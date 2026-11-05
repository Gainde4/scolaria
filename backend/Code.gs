/**
 * Scolaria — backend Google Apps Script
 * Base de données : le classeur Google Sheets auquel ce script est lié (un onglet par table).
 * Les fonctions dont le nom finit par « _ » sont privées : le navigateur ne peut pas les appeler.
 * Les clés d'API (Twilio, passerelle) sont gardées dans les propriétés du script, jamais dans le classeur.
 */
var SCHEMA = __SCHEMA__;
var TABLES = Object.keys(SCHEMA);
var SESSION_TTL = 21600;          // 6 heures, maximum autorisé par CacheService
var MAX_TRIES = 5;                // tentatives de connexion avant blocage de 10 minutes
var MAX_SEND = 60;                // envois réseau (e-mail, Twilio, passerelle) par opération
var MAX_MESSAGES = 500;           // messages par envoi groupé (les liens manuels ne partent pas du serveur)
var CONFIG_TABLES = ['modules', 'perms', 'channels', 'templates'];

/*__SHARED__*/

/* ================= Page web ================= */
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return json_({ ok: true, app: 'Scolaria' }); // vérification de l'adresse depuis un navigateur
  var page;
  try { page = HtmlService.createHtmlOutputFromFile('Index'); }
  catch (err) { return json_({ ok: true, app: 'Scolaria', info: 'Serveur actif. La page de l’application est hébergée ailleurs (GitHub Pages, Firebase).' }); }
  return page.setTitle('Scolaria').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ================= Point d'entrée HTTP =================
   Permet d'héberger la page ailleurs (Firebase Hosting, par exemple) : elle envoie {fn, args} en POST (texte brut, pour éviter la
   requête de pré-vérification CORS que Apps Script ne sait pas traiter). Seules les fonctions listées ci-dessous sont appelables ;
   chacune applique elle-même ses contrôles (jeton, rôle, droits), exactement comme avec google.script.run. */
var MAX_BODY = 10 * 1024 * 1024;
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function api_() {
  return {
    apiStatus: apiStatus, apiChallenge: apiChallenge, apiRegister: apiRegister, apiSetupAdmin: apiSetupAdmin, apiLogin: apiLogin,
    apiAppUrl: apiAppUrl, apiLogout: apiLogout, apiLoadAll: apiLoadAll, apiSave: apiSave, apiSaveMany: apiSaveMany, apiRemove: apiRemove,
    apiSetPassword: apiSetPassword, apiChangePassword: apiChangePassword, apiImportAll: apiImportAll, apiEmailReport: apiEmailReport,
    apiAdmit: apiAdmit, apiSetSecret: apiSetSecret, apiSecretsStatus: apiSecretsStatus, apiTestChannel: apiTestChannel,
    apiBroadcast: apiBroadcast, apiRemind: apiRemind, apiOutboxMark: apiOutboxMark
  };
}
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) throw new Error('Requête trop volumineuse.');
    var req = JSON.parse(raw || '{}'), table = api_(), fn = String(req.fn || '');
    if (!Object.prototype.hasOwnProperty.call(table, fn)) throw new Error('Fonction inconnue.');
    var args = Array.isArray(req.args) ? req.args : [];
    if (args.length > 8) throw new Error('Trop d’arguments.');
    return json_({ ok: true, data: table[fn].apply(null, args) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ================= Accès à la feuille (lectures mémorisées pendant une exécution) ================= */
var BOOK_ = null, SHEETS_ = null, MEMO_ = {}, QUEUE_ = [], COLS_ = {}, TYPES_ = {};
TABLES.forEach(function (t) { COLS_[t] = []; TYPES_[t] = {}; SCHEMA[t].split(',').forEach(function (c) { var p = c.split(':'); COLS_[t].push(p[0]); TYPES_[t][p[0]] = p[1] || 's'; }); });
function cols_(t) { return COLS_[t]; }
function types_(t) { return TYPES_[t]; }
function ss_() {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (s) return s;                                        // script créé depuis un classeur (Extensions > Apps Script)
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // Script autonome (créé sur script.google.com) : il crée son classeur au premier appel, dans le Drive de la personne qui a déployé.
  var lock = LockService.getScriptLock(), had = lock.hasLock();
  if (!had) lock.waitLock(20000);
  try {
    id = props.getProperty('SHEET_ID');                   // un autre appel a pu le créer pendant l'attente
    if (id) return SpreadsheetApp.openById(id);
    var created = SpreadsheetApp.create('Scolaria — données');
    props.setProperty('SHEET_ID', created.getId());
    return created;
  } finally { if (!had) lock.releaseLock(); }
}
function book_() { if (!BOOK_) BOOK_ = ss_(); return BOOK_; }
function sheets_() { if (!SHEETS_) { SHEETS_ = {}; book_().getSheets().forEach(function (s) { SHEETS_[s.getName()] = s; }); } return SHEETS_; }
/* Les colonnes de texte restent du texte : Sheets ne transforme pas « 2026-09-05 » en date. Réglé une seule fois, à la création de la colonne. */
function fmtCols_(sh, ty, head, which) {
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  which.forEach(function (name) { if (ty[name] === 's' || ty[name] === undefined) sh.getRange(2, head.indexOf(name) + 1, rows, 1).setNumberFormat('@'); });
}
function table_(t) {
  if (MEMO_[t]) return MEMO_[t];
  var c = cols_(t), ty = types_(t), sh = sheets_()[t];
  if (!sh) { sh = book_().insertSheet(t); SHEETS_[t] = sh; }
  var vals = sh.getDataRange().getValues(), head = (vals[0] || []).map(String).filter(function (x) { return x !== ''; });
  if (!head.length) {
    sh.getRange(1, 1, 1, c.length).setValues([c]); head = c.slice(); sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, c.length).setFontWeight('bold').setBackground('#0e2a30').setFontColor('#ffffff');
    fmtCols_(sh, ty, head, c); vals = [head.slice()];
  } else {
    var miss = c.filter(function (x) { return head.indexOf(x) < 0; });
    if (miss.length) {   // mise à jour du schéma : les colonnes manquantes sont ajoutées à droite
      sh.getRange(1, head.length + 1, 1, miss.length).setValues([miss]); head = head.concat(miss); fmtCols_(sh, ty, head, miss);
      vals = vals.map(function (r, i) { if (i === 0) return head.slice(); while (r.length < head.length) r.push(''); return r; });
    }
  }
  MEMO_[t] = { sh: sh, head: head, vals: vals, rows: null };
  return MEMO_[t];
}
function clean_(t, name, v) {
  var ty = types_(t)[name];
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (v === null || v === undefined) v = '';
  if (ty === 'n') { if (v === '') return ''; var n = Number(v); return isNaN(n) ? '' : n; }
  if (ty === 'b') return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';
  return String(v);
}
function read_(t) {
  var s = table_(t); if (s.rows) return s.rows;
  var c = cols_(t), idx = c.map(function (n) { return s.head.indexOf(n); }), idI = s.head.indexOf('id'), out = [];
  for (var r = 1; r < s.vals.length; r++) {
    var row = s.vals[r]; if (row[idI] === '' || row[idI] === undefined) continue;
    var o = {}; for (var j = 0; j < c.length; j++) o[c[j]] = clean_(t, c[j], idx[j] < 0 ? '' : row[idx[j]]);
    out.push(o);
  }
  s.rows = out; return out;
}
function rowArray_(t, head, obj) {
  var c = cols_(t);
  return head.map(function (name) { return c.indexOf(name) >= 0 ? clean_(t, name, obj[name]) : ''; });
}
function upsert_(t, rows) {
  var s = table_(t), idI = s.head.indexOf('id'), pos = {};
  for (var r = 1; r < s.vals.length; r++) pos[String(s.vals[r][idI])] = r;
  var add = [], upd = [];
  rows.forEach(function (o) {
    var i = pos[String(o.id)];
    if (i !== undefined) {
      var base = s.vals[i].slice(), arr = rowArray_(t, s.head, o);   // les colonnes ajoutées à la main dans le classeur sont conservées
      s.head.forEach(function (name, k) { if (cols_(t).indexOf(name) < 0) arr[k] = base[k]; });
      upd.push([i, arr]);
    } else add.push(rowArray_(t, s.head, o));
  });
  if (upd.length > 25) {                       // beaucoup de lignes : une seule écriture pour tout le bloc, bien plus rapide qu'une écriture par ligne
    var block = s.vals.slice(1).map(function (r) { var c = r.slice(0, s.head.length); while (c.length < s.head.length) c.push(''); return c; });
    upd.forEach(function (u) { block[u[0] - 1] = u[1]; });
    s.sh.getRange(2, 1, block.length, s.head.length).setValues(block);
  } else upd.forEach(function (u) { s.sh.getRange(u[0] + 1, 1, 1, s.head.length).setValues([u[1]]); });
  if (add.length) s.sh.getRange(s.vals.length + 1, 1, add.length, s.head.length).setValues(add);
  delete MEMO_[t];
}
function delete_(t, ids) {
  var s = table_(t), idI = s.head.indexOf('id');
  for (var r = s.vals.length - 1; r >= 1; r--) if (ids.indexOf(String(s.vals[r][idI])) >= 0) s.sh.deleteRow(r + 1);
  delete MEMO_[t];
}
function persist_(ctx) {
  Object.keys(ctx.touched).forEach(function (t) { upsert_(t, Object.keys(ctx.touched[t]).map(function (id) { return ctx.touched[t][id]; })); });
}
function loadDb_(names) { var db = {}; names.forEach(function (t) { db[t] = read_(t).slice(); }); return db; }
function schemaStamp_() { var n = 0, s = JSON.stringify(SCHEMA); for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0; return 'ready:' + n; }
function ensureAll_() {
  var cache = CacheService.getScriptCache(), key = schemaStamp_();
  if (cache.get(key)) return;
  TABLES.forEach(function (t) { table_(t); });
  cache.put(key, '1', 21600);
}

/* ================= Sécurité : mots de passe, sessions, droits ================= */
function hash_(pwd, salt) {
  var d = salt + ':' + pwd, b;
  for (var i = 0; i < 300; i++) { b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d, Utilities.Charset.UTF_8); d = Utilities.base64Encode(b) + salt; }
  return Utilities.base64Encode(b);
}
function newPwd_(pwd) { var salt = Utilities.getUuid(); return { salt: salt, hash: hash_(pwd, salt) }; }
function tempPwd_() {
  var a = 'abcdefghjkmnpqrstuvwxyz23456789', u = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''), s = '';
  for (var i = 0; i < 10; i++) s += a.charAt(parseInt(u.substr(i * 2, 2), 16) % a.length);
  return s;
}
function host_() {
  return { uid: function () { return Utilities.getUuid(); }, pwd: newPwd_, temp: tempPwd_, today: function () { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); } };
}
function checkPwd_(p) { if (!p || String(p).length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.'); }
function publicUser_(u) { return { id: u.id, email: u.email, nom: u.nom, role: u.role, linkId: u.linkId, tel: u.tel, actif: u.actif, hash: '', salt: '', login: u.login, mustChange: u.mustChange, source: u.source, canaux: u.canaux }; }
function maskedUser_(u) { return { id: u.id, email: '', nom: u.nom, role: u.role, linkId: '', tel: '', actif: u.actif, hash: '', salt: '', login: '', mustChange: false, source: '', canaux: '' }; }
function auth_(token, allowMust) {
  var id = token ? CacheService.getScriptCache().get('s:' + token) : null;
  if (!id) throw new Error('AUTH');
  var u = read_('users').filter(function (x) { return x.id === id && x.actif; })[0];
  if (!u) throw new Error('AUTH');
  if (u.mustChange && !allowMust) throw new Error('MUSTCHANGE : changez d’abord votre mot de passe provisoire.');
  CacheService.getScriptCache().put('s:' + token, id, SESSION_TTL);
  return u;
}
/* Pendant le verrou, les lectures mémorisées sont jetées : on lit toujours l'état le plus récent. */
function withLock_(fn) { var l = LockService.getScriptLock(); l.waitLock(20000); try { MEMO_ = {}; return fn(); } finally { l.releaseLock(); } }
function audit_(user, action, table, rowId, detail) {
  if (table === 'audit') return;
  upsert_('audit', [{ id: Utilities.getUuid(), at: new Date().toISOString(), user: user.nom, action: action, table: table, rowId: rowId, detail: String(detail || '').slice(0, 200) }]);
}

/* ----- Droits : la matrice (rôle × module) est lue ici, jamais dans le navigateur ----- */
function cfg_() { return { perms: read_('perms'), modules: read_('modules') }; }
function mine_(user, k, c) { return rights_(user.role, k, c.perms, c.modules); }
function need_(user, k, verb) {
  var c = cfg_(); if (mine_(user, k, c).indexOf(verb) < 0) throw new Error('Action non autorisée pour votre rôle.');
  return c;
}
/* Droit d'écrire dans une table : celui du module qui la gère, ou d'un module qui la modifie en passant (« also »). */
function canTable_(user, t, verb, c) {
  var ok = false;
  MODS.forEach(function (m) {
    var rt = mine_(user, m.k, c); if (rt.indexOf('v') < 0) return;
    if (m.table === t) { if (rt.indexOf(verb) >= 0) ok = true; }
    else if (m.also.indexOf(t) >= 0 && verb !== 's' && (rt.indexOf('c') >= 0 || rt.indexOf('m') >= 0)) ok = true;
  });
  return ok;
}
function allowWrite_(user, t, ex, isDelete, c) {
  var verb = isDelete ? 's' : ex ? 'm' : 'c';
  if (t === 'audit') return false;
  if (t === 'outbox') return isDelete && canTable_(user, t, 's', c);        // le journal des envois n'est écrit que par le serveur
  if (canTable_(user, t, verb, c)) return true;
  if (t === 'complaints' && !ex && !isDelete && mine_(user, 'complaints', c).indexOf('v') >= 0) return true;   // dépôt anonyme ouvert à tous
  if (t === 'users' && ex && ex.id === user.id && !isDelete) return true;                                      // chacun peut modifier son profil
  if (t === 'ptm' && user.role === 'parent' && ex && !isDelete && mine_(user, 'ptm', c).indexOf('v') >= 0) return true;     // le détail (créneau libre, ses enfants) est vérifié plus bas
  return false;
}
function customFor_(t, c) {
  var m = MODS.filter(function (x) { return x.custom && x.table === t; })[0];
  return m ? customDefs_({ modules: c.modules }, m.k) : null;
}

/* ================= Données visibles selon le rôle ================= */
function fam_(user, G) {
  var r = user.role, all = G('students');
  var kids = r === 'eleve' ? all.filter(function (s) { return s.id === user.linkId; }) : r === 'parent' ? all.filter(function (s) { return s.parentId === user.linkId; }) : [];
  var classIds = kids.map(function (s) { return s.classId; });
  var mates = all.filter(function (s) { return classIds.indexOf(s.classId) >= 0 && s.statut === 'Actif'; });
  var admCls = G('admissions').filter(function (a) { return a.userId === user.id; }).map(function (a) { return a.classId; });
  return { kids: kids, kidIds: kids.map(function (s) { return s.id; }), classIds: classIds, admClassIds: admCls, mates: mates };
}
var NOTICE_TARGETS = { eleve: ['Tous', 'Élèves'], parent: ['Tous', 'Parents'], candidat: ['Tous'] };
/* Données d'un élève, d'un parent ou d'une famille candidate : uniquement ce qui les concerne. */
function famRows_(t, user, G, F) {
  var r = user.role, inCls = function (x) { return F.classIds.indexOf(x.classId) >= 0; }, mine = function (x) { return F.kidIds.indexOf(x.studentId) >= 0; };
  switch (t) {
    case 'settings': case 'modules': case 'periods': case 'subjects': case 'events': return G(t);
    case 'perms': return G(t).filter(function (p) { return p.role === r; });
    case 'users': return G(t).filter(function (u) { return u.id === user.id; }).map(publicUser_);
    case 'notices': return G(t).filter(function (n) { return NOTICE_TARGETS[r].indexOf(n.cible) >= 0; });
    case 'admissions': return G(t).filter(function (a) { return a.userId === user.id; });
    case 'classes': return G(t).filter(function (c) { return F.classIds.indexOf(c.id) >= 0 || F.admClassIds.indexOf(c.id) >= 0; });
    case 'timetable': case 'exams': case 'assignments': case 'lessons': case 'logbook': case 'substitutes': return G(t).filter(inCls);
    case 'students': {
      var n = 0, out = F.mates.map(function (s) {
        if (F.kidIds.indexOf(s.id) >= 0) { var c = {}; for (var k in s) c[k] = s[k]; c.nin = ''; return c; }
        n++; return { id: s.id, admission: '', nom: 'Camarade', prenom: '#' + n, sexe: s.sexe, naissance: '', classId: s.classId, parentId: '', tel: '', adresse: '', statut: 'Actif', nin: '', extra: '' };
      });
      F.kids.forEach(function (s) { if (F.mates.indexOf(s) < 0) { var c = {}; for (var k in s) c[k] = s[k]; c.nin = ''; out.push(c); } });
      return out;
    }
    case 'marks': return G(t).filter(function (m) { return F.mates.some(function (s) { return s.id === m.studentId; }); });
    case 'attendance': case 'conduct': case 'activities': return G(t).filter(mine);
    case 'documents': return r === 'parent' ? G(t).filter(mine) : [];
    case 'teachers': return G(t).map(function (x) { return { id: x.id, matricule: '', nom: x.nom, prenom: x.prenom, sexe: '', tel: '', email: '', specialite: x.specialite, statut: '', embauche: '', extra: '' }; });
    case 'parents': return r === 'parent' ? G(t).filter(function (p) { return p.id === user.linkId; }) : [];
    case 'payments': return r === 'parent' ? G(t).filter(mine) : [];
    case 'feeStructure': return r === 'parent' ? G(t).filter(inCls) : [];
    case 'ptm': return r === 'parent' ? G(t).filter(function (x) { return x.statut === 'Libre' || x.parentId === user.linkId; }) : [];
    default: return [];
  }
}
function staffRows_(t, user, G) {
  var rows = G(t), full = user.role === 'secretaire';
  if (t === 'users') return rows.map(function (u) { return u.id === user.id || full ? publicUser_(u) : maskedUser_(u); });
  if (t === 'students' && !full) return rows.map(function (s) { var c = {}; for (var k in s) c[k] = s[k]; c.nin = ''; return c; });
  if (t === 'perms') return rows.filter(function (p) { return p.role === user.role; });
  return rows;
}
function dataFor_(user) {
  var c = cfg_(), r = user.role, need = {}, out = {}, G = read_, isFam = FAMILY_ROLES.indexOf(r) >= 0;
  TABLES.forEach(function (t) { out[t] = []; });
  ALWAYS_READ.concat(['users', 'perms']).forEach(function (t) { need[t] = 1; });
  if (r === 'admin') TABLES.forEach(function (t) { need[t] = 1; });
  else MODS.forEach(function (m) {
    var rt = mine_(user, m.k, c); if (rt.indexOf('v') < 0) return;
    if (m.guard && rt.indexOf(m.guard) < 0) return;
    m.reads.forEach(function (t) { need[t] = 1; });
  });
  var F = isFam ? fam_(user, G) : null;
  Object.keys(need).forEach(function (t) {
    out[t] = r === 'admin' ? (t === 'users' ? G(t).map(publicUser_) : G(t)) : isFam ? famRows_(t, user, G, F) : staffRows_(t, user, G);
  });
  return out;
}

/* ================= Envoi de messages : e-mail, SMS, WhatsApp ================= */
function secret_(canal, name) { return PropertiesService.getScriptProperties().getProperty('sec:' + canal + ':' + name) || ''; }
function queue_(msgs) { msgs.forEach(function (m) { QUEUE_.push(m); }); }
/* Un modèle d'événement (inscription, paiement…) : envoyé seulement s'il est actif, sauf demande explicite. */
function notify_(db, ev, recipients, vars, opts) {
  opts = opts || {}; var tpl = tplOf_(db, ev); if (!tpl || (!tpl.actif && !opts.force)) return [];
  var plan = planMessages_(db, ev, recipients, vars, opts); queue_(plan); return plan;
}
function twilioError_(body) { try { var j = JSON.parse(body); return String(j.message || j.error_message || body).slice(0, 150); } catch (e) { return String(body).slice(0, 150); } }
function hasSecret_(m) { return (m.secrets || []).some(function (s) { return s && String(m.texte).indexOf(s) >= 0; }); }
function sendOne_(db, m) {
  var ch = chanOf_(db, m.canal), st = (db.settings || [])[0] || {};
  try {
    if (m.canal === 'email') {
      MailApp.sendEmail({ to: m.to, subject: m.sujet || ('Message de ' + (st.ecole || 'l’école')), body: m.texte, name: ch.expediteur || st.ecole || 'Scolaria' });
      return { statut: 'Envoyé', detail: '' };
    }
    if (ch.fournisseur === 'lien') return { statut: 'À envoyer', detail: 'Ouvrez le lien pour envoyer le message depuis un téléphone.', lien: hasSecret_(m) ? '' : manualLink_(m.canal, m.to, m.texte) };
    if (ch.fournisseur === 'twilio') {
      var sid = secret_(m.canal, 'sid'), tok = secret_(m.canal, 'token'), from = String(ch.options.from || '').replace(/^whatsapp:/i, '').trim();
      if (!sid || !tok || !from) return { statut: 'Échec', detail: 'Twilio n’est pas entièrement configuré (identifiants ou numéro expéditeur manquants).' };
      var payload = { To: (m.canal === 'whatsapp' ? 'whatsapp:' : '') + m.to, Body: m.texte };
      if (/^MG/.test(from) && m.canal === 'sms') payload.MessagingServiceSid = from; else payload.From = (m.canal === 'whatsapp' ? 'whatsapp:' : '') + from;
      var resp = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'post', headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + tok) }, payload: payload, muteHttpExceptions: true });
      var code = resp.getResponseCode();
      return code >= 200 && code < 300 ? { statut: 'Envoyé', detail: '' } : { statut: 'Échec', detail: 'Twilio (' + code + ') : ' + twilioError_(resp.getContentText()) };
    }
    if (ch.fournisseur === 'webhook') {
      var url = secret_(m.canal, 'url'), sec = secret_(m.canal, 'secret');
      if (!/^https:\/\//.test(url)) return { statut: 'Échec', detail: 'Adresse de la passerelle absente ou non sécurisée (https obligatoire).' };
      var r2 = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: sec ? { 'X-Scolaria-Secret': sec } : {}, payload: JSON.stringify({ canal: m.canal, to: m.to, nom: m.nom, texte: m.texte, event: m.event }), muteHttpExceptions: true });
      var c2 = r2.getResponseCode();
      return c2 >= 200 && c2 < 300 ? { statut: 'Envoyé', detail: '' } : { statut: 'Échec', detail: 'Passerelle (' + c2 + ')' };
    }
    return { statut: 'Échec', detail: 'Fournisseur inconnu.' };
  } catch (e) { return { statut: 'Échec', detail: String(e.message || e).slice(0, 150) }; }
}
function mask_(text, secrets) { var t = String(text || ''); (secrets || []).forEach(function (s) { if (s) t = t.split(s).join('••••••'); }); return t; }
/* Envoie la file d'attente (hors verrou) et inscrit chaque message au journal des envois. */
function flush_() {
  var q = QUEUE_; QUEUE_ = []; if (!q.length) return [];
  var db = loadDb_(['channels', 'settings']), rows = [], n = 0;
  q.forEach(function (m) {
    var ch = chanOf_(db, m.canal), net = m.canal === 'email' || ch.fournisseur !== 'lien', r;
    if (net && n >= MAX_SEND) r = { statut: 'Non envoyé', detail: 'Limite d’envois par opération atteinte (' + MAX_SEND + ').' };
    else { if (net) n++; r = sendOne_(db, m); }
    rows.push({ id: Utilities.getUuid(), at: new Date().toISOString(), canal: m.canal, fournisseur: ch.fournisseur, to: m.to, nom: m.nom, event: m.event, statut: r.statut, detail: String(r.detail || '').slice(0, 200), texte: mask_(m.texte, m.secrets).slice(0, 600), lien: r.lien || '' });
  });
  withLock_(function () { upsert_('outbox', rows); });
  return rows;
}
/* ================= API publique (sans connexion) ================= */
function regInfo_(hasUsers) {
  var db = loadDb_(['modules', 'classes', 'settings', 'channels']), o = modOpt_(db, 'admissions');
  if (!hasUsers || !o.public || !modActive_('admissions', db.modules)) return { open: false };
  return {
    open: true, mode: o.mode, consentement: o.consentement, indicatif: (db.settings[0] || {}).indicatif || '221',
    classes: db.classes.map(function (c) { return { id: c.id, nom: c.nom, niveau: c.niveau }; }),
    champs: customDefs_(db, 'admissions'), liens: listOf_(db, 'parents.lien'),
    canaux: ['email', 'sms', 'whatsapp'].filter(function (x) { return chanOf_(db, x).actif; })
  };
}
function apiStatus() {
  ensureAll_();
  var set = read_('settings')[0], has = read_('users').length > 0;
  return { hasUsers: has, school: set ? set.ecole : '', registration: regInfo_(has) };
}
function apiChallenge() {
  var cache = CacheService.getScriptCache(), key = 'chal:' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH'), n = Number(cache.get(key) || 0);
  if (n >= 300) throw new Error('Trop de demandes. Réessayez plus tard.');
  cache.put(key, String(n + 1), 3600);
  var a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8), id = Utilities.getUuid();
  cache.put('c:' + id, String(a + b), 900);
  return { id: id, q: a + ' + ' + b };
}
function checkChallenge_(id, ans) {
  var v = id ? CacheService.getScriptCache().get('c:' + id) : null;
  if (!v) throw new Error('La question de vérification a expiré. Rechargez le formulaire.');
  if (String(ans).trim() !== v) throw new Error('Réponse incorrecte à la question de vérification.');
}
/* Inscription d'un ou plusieurs enfants : crée le compte de la famille et les candidatures. Sans jeton : nouvelle famille. Avec jeton : ajout d'un enfant. */
function apiRegister(form, token) {
  form = form || {};
  if (form.site) return { ok: true, refs: [], admis: 0 };                       // champ piège réservé aux robots
  var me = null;
  if (token) { me = auth_(token); if (me.role !== 'candidat' && me.role !== 'parent') throw new Error('Action non autorisée pour votre rôle.'); }
  else checkChallenge_(form.cid, form.cans);                                    // une famille déjà connectée n'a pas à prouver qu'elle est humaine
  var cache = CacheService.getScriptCache(), tz = Session.getScriptTimeZone(), kids = Array.isArray(form.enfants) ? form.enfants.length : 0;
  var res = withLock_(function () {
    var db = loadDb_(['users', 'admissions', 'parents', 'students', 'classes', 'settings', 'modules', 'templates', 'channels']), o = modOpt_(db, 'admissions');
    var hk = 'reg:' + Utilities.formatDate(new Date(), tz, 'yyyyMMddHH'), n = Number(cache.get(hk) || 0);
    if (o.public && n + kids > o.maxParHeure) throw new Error('Trop d’inscriptions en ce moment. Réessayez dans une heure ou contactez le secrétariat.');
    var ctx = { db: db, touched: {}, h: host_() }, r = registerCore_(ctx, form, me);
    persist_(ctx); cache.put(hk, String(n + kids), 3600); if (form.cid) cache.remove('c:' + form.cid);
    audit_({ nom: 'Inscription en ligne' }, 'créé', 'admissions', '', r.refs.join(', '));
    r.db = db; r.user = db.users.filter(function (x) { return x.id === r.user.id; })[0]; return r;
  });
  var db = res.db, eleves = res.admissions.map(function (a) { return a.prenom + ' ' + a.nom; }).join(' et ');
  notify_(db, 'inscription_recue', [{ nom: res.parent.prenom + ' ' + res.parent.nom, tel: res.parent.tel, email: res.parent.email, canaux: res.user.canaux }], { parent: res.parent.prenom + ' ' + res.parent.nom, eleve: eleves, ref: res.refs.join(', '), identifiant: res.user.login || res.user.email });
  res.admitted.forEach(function (a) { announceAdmission_(db, a); });
  flush_();
  // Les comptes créés à l'admission automatique sont montrés une seule fois à la famille qui vient de s'inscrire.
  var comptes = []; res.admitted.forEach(function (a) { a.comptes.forEach(function (x) { if (x.nouveau && x.pwd) comptes.push({ role: x.role, nom: x.nom, login: x.login, pwd: x.pwd }); }); });
  var out = { ok: true, refs: res.refs, admis: res.admitted.length, comptes: comptes };
  if (!me) out.session = login_(res.user);
  return out;
}
function announceAdmission_(db, a) { var plan = admissionPlan_(db, a); if (plan.length) queue_(plan); }

/* ================= API avec connexion ================= */
function apiSetupAdmin(email, nom, pwd) {
  return withLock_(function () {
    ensureAll_();
    if (read_('users').length) throw new Error('Un compte existe déjà. Connectez-vous.');
    if (!validEmail_(email)) throw new Error('Adresse e-mail invalide.');
    if (!nom || !String(nom).trim()) throw new Error('Indiquez votre nom.');
    checkPwd_(pwd);
    var pw = newPwd_(pwd), mail = String(email).trim().toLowerCase();
    var u = { id: Utilities.getUuid(), email: mail, nom: String(nom).trim(), role: 'admin', linkId: '', tel: '', actif: true, hash: pw.hash, salt: pw.salt, login: mail, mustChange: false, source: 'installation', canaux: '' };
    upsert_('users', [u]);
    if (!read_('settings').length) upsert_('settings', [{ id: 'main', ecole: 'Mon établissement', adresse: '', tel: '', email: mail, annee: defaultYear_(), devise: 'FCFA', noteMax: 20, notePassage: 10, responsable: String(nom).trim(), slogan: '', indicatif: '221' }]);
    audit_(u, 'créé', 'users', u.id, 'Compte administrateur initial');
    return login_(u);
  });
}
function defaultYear_() { var d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return y + '-' + (y + 1); }
function login_(u) { var token = Utilities.getUuid() + Utilities.getUuid(); CacheService.getScriptCache().put('s:' + token, u.id, SESSION_TTL); return { token: token, me: publicUser_(u) }; }
function apiLogin(identifier, pwd) {
  var key = loginKey_(identifier), cache = CacheService.getScriptCache(), ck = 'try:' + key.slice(0, 120), tries = Number(cache.get(ck) || 0);
  if (tries >= MAX_TRIES) throw new Error('Trop de tentatives. Réessayez dans 10 minutes.');
  var u = key ? read_('users').filter(function (x) { return (x.login && x.login === key) || (x.email && x.email === key); })[0] : null;
  if (!u || !u.actif || !u.hash || hash_(String(pwd || ''), u.salt) !== u.hash) { cache.put(ck, String(tries + 1), 600); throw new Error('Identifiant ou mot de passe incorrect.'); }
  cache.remove(ck); return login_(u);
}
/* Adresse publique de l'application (pour le bouton « Voir le formulaire public » de la direction). */
function apiAppUrl(token) { auth_(token); return ScriptApp.getService().getUrl(); }
function apiLogout(token) { if (token) CacheService.getScriptCache().remove('s:' + token); return true; }
function apiLoadAll(token) {
  var u = auth_(token, true);
  if (u.mustChange) return { tables: {}, me: publicUser_(u) };
  return { tables: dataFor_(u), me: publicUser_(u) };
}

function notifyAfterSave_(t, saved, before) {
  if (t !== 'payments' && t !== 'attendance') return;
  var db = loadDb_(['templates', 'channels', 'settings']), ev = t === 'payments' ? 'paiement' : 'absence';
  if (!tplOf_(db, ev).actif) return;                                         // la plupart du temps : rien à envoyer, on ne lit pas le reste
  ['students', 'parents', 'users'].forEach(function (x) { db[x] = read_(x).slice(); });
  if (t === 'payments') saved.forEach(function (p) {
    if (before[p.id]) return;
    var s = db.students.filter(function (x) { return x.id === p.studentId; })[0]; if (!s) return;
    notify_(db, 'paiement', parentRecipients_(db, s), { eleve: fullName_(s), montant: fcfa_(p.montant), nature: p.type + (p.mois ? ' ' + p.mois : ''), recu: p.recu });
  });
  else saved.forEach(function (a) {
    if (a.statut !== 'Absent' || (before[a.id] && before[a.id].statut === 'Absent')) return;
    var s = db.students.filter(function (x) { return x.id === a.studentId; })[0]; if (!s) return;
    notify_(db, 'absence', parentRecipients_(db, s), { eleve: fullName_(s), date: fmtDateFr_(a.date) });
  });
  flush_();
}
function apiSave(token, t, row) { return apiSaveMany(token, t, [row])[0]; }
function apiSaveMany(token, t, rows) {
  var user = auth_(token);
  if (TABLES.indexOf(t) < 0 || t === 'audit' || t === 'outbox') throw new Error('Table inconnue.');
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Données invalides.');
  var before = {};
  var saved = withLock_(function () {
    var c = cfg_(), current = read_(t), done = [], allUsers = t === 'users' ? read_('users') : null, defs = customFor_(t, c), isConfig = CONFIG_TABLES.indexOf(t) >= 0;
    rows.forEach(function (raw) {
      var o = {}, id, ex;
      if (isConfig) { o = sanitizeConfig_(t, raw); id = o.id; }
      else { id = raw.id || Utilities.getUuid(); cols_(t).forEach(function (k) { o[k] = raw[k]; }); o.id = id; }
      ex = current.filter(function (x) { return x.id === id; })[0] || null; if (ex) before[id] = ex;
      if (!allowWrite_(user, t, ex, false, c)) throw new Error('Action non autorisée pour votre rôle.');
      if (defs) o.extra = cleanExtra_(defs, raw.extra); else if (cols_(t).indexOf('extra') >= 0) o.extra = '';
      if (t === 'users') {
        var full = allUsers.filter(function (x) { return x.id === id; })[0] || null;
        if (ex && user.role !== 'admin') { var keep = {}; for (var k in ex) keep[k] = ex[k]; keep.nom = String(o.nom || ex.nom).slice(0, 80); keep.tel = String(o.tel || '').slice(0, 30); keep.canaux = String(o.canaux || '').split(',').filter(function (x) { return CHANNEL_DEFS[x]; }).join(','); o = keep; }
        else {
          if (ROLE_IDS.indexOf(o.role) < 0) throw new Error('Rôle inconnu.');
          o.email = String(o.email || '').trim().toLowerCase(); o.login = loginKey_(o.login || o.email);
          if (!o.login) throw new Error('Indiquez une adresse e-mail ou un identifiant de connexion.');
          if (o.email && !validEmail_(o.email)) throw new Error('Adresse e-mail invalide.');
          if (allUsers.some(function (x) { return x.id !== id && ((x.login && (x.login === o.login || x.login === o.email)) || (x.email && (x.email === o.email || x.email === o.login))); })) throw new Error('Cet identifiant ou cette adresse a déjà un compte.');
          if (ex && ex.role === 'admin' && (o.role !== 'admin' || !o.actif) && allUsers.filter(function (x) { return x.role === 'admin' && x.actif; }).length < 2) throw new Error('Il doit rester au moins un administrateur actif.');
          o.mustChange = full ? full.mustChange : false; o.source = full ? full.source : 'manuel';
        }
        o.hash = full ? full.hash : ''; o.salt = full ? full.salt : '';
      }
      if (t === 'admissions') {
        if (o.statut === 'Admis' && (!ex || ex.statut !== 'Admis')) throw new Error('Pour admettre un candidat, utilisez le bouton « Admettre » : il crée le dossier élève et les comptes.');
        o.statut = ['En attente', 'Admis', 'Refusé'].indexOf(o.statut) >= 0 ? o.statut : 'En attente';
        if (ex) { o.userId = ex.userId; o.ref = ex.ref; o.source = ex.source; o.studentId = ex.studentId; }
        else { o.userId = ''; o.studentId = ''; o.source = 'secrétariat'; o.ref = nextRef_({ admissions: current.concat(done), settings: read_('settings') }); }
        o.parentEmail = String(o.parentEmail || '').trim().toLowerCase(); if (o.parentEmail && !validEmail_(o.parentEmail)) throw new Error('Adresse e-mail du parent invalide.');
      }
      if (t === 'ptm' && user.role === 'parent') {
        // Un parent peut seulement réserver un créneau libre ou libérer le sien : date, heure et enseignant restent ceux du créneau.
        if (!ex) throw new Error('Action non autorisée pour votre rôle.');
        ['date', 'heure', 'teacherId'].forEach(function (k) { o[k] = ex[k]; });
        var mineIds = read_('students').filter(function (x) { return x.parentId === user.linkId; }).map(function (x) { return x.id; });
        if (ex.statut === 'Libre') {
          if (mineIds.indexOf(o.studentId) < 0) throw new Error('Choisissez un de vos enfants.');
          o.statut = 'Réservé'; o.parentId = user.linkId;
        } else if (ex.parentId === user.linkId) {
          if (o.statut === 'Libre') { o.parentId = ''; o.studentId = ''; o.motif = ''; }
          else { if (mineIds.indexOf(o.studentId) < 0) throw new Error('Choisissez un de vos enfants.'); o.statut = ex.statut; o.parentId = user.linkId; }
        } else throw new Error('Créneau déjà réservé.');
      }
      if (t === 'complaints' && !canTable_(user, t, 'm', c)) { o.statut = 'Nouvelle'; o.reponse = ''; if (ex) throw new Error('Action non autorisée pour votre rôle.'); }
      done.push(o);
    });
    upsert_(t, done);
    audit_(user, rows.some(function (r) { return !(r.id || isConfig); }) ? 'créé' : 'modifié', t, done.length === 1 ? done[0].id : '', done.length === 1 ? (done[0].recu || done[0].nom || done[0].titre || done[0].session || done[0].label || '') : done.length + ' lignes');
    return done;
  });
  notifyAfterSave_(t, saved, before);
  return saved.map(function (o) { if (t === 'users') { o = publicUser_(o); } return o; });
}
function apiRemove(token, t, ids) {
  var user = auth_(token);
  if (TABLES.indexOf(t) < 0 || t === 'audit') throw new Error('Table inconnue.');
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error('Données invalides.');
  return withLock_(function () {
    var c = cfg_(), current = read_(t);
    ids.forEach(function (id) {
      var ex = current.filter(function (x) { return x.id === id; })[0]; if (!ex) return;
      if (!allowWrite_(user, t, ex, true, c)) throw new Error('Suppression non autorisée pour votre rôle.');
      if (t === 'users' && id === user.id) throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
    });
    delete_(t, ids); audit_(user, 'supprimé', t, ids.join(','), ids.length + ' ligne(s)'); return true;
  });
}
function apiSetPassword(token, userId, pwd) {
  var user = auth_(token); if (user.role !== 'admin') throw new Error('Réservé à la direction.'); checkPwd_(pwd);
  return withLock_(function () {
    var u = read_('users').filter(function (x) { return x.id === userId; })[0]; if (!u) throw new Error('Utilisateur introuvable.');
    var pw = newPwd_(pwd); u.salt = pw.salt; u.hash = pw.hash; u.mustChange = u.id !== user.id;      // la personne choisira son propre mot de passe à la première connexion
    upsert_('users', [u]); audit_(user, 'modifié', 'users', userId, 'Mot de passe réinitialisé'); return true;
  });
}
function apiChangePassword(token, oldPwd, newPwd) {
  var user = auth_(token, true); checkPwd_(newPwd);
  return withLock_(function () {
    var u = read_('users').filter(function (x) { return x.id === user.id; })[0];
    if (hash_(String(oldPwd || ''), u.salt) !== u.hash) throw new Error('Ancien mot de passe incorrect.');
    if (String(oldPwd) === String(newPwd)) throw new Error('Choisissez un mot de passe différent de l’ancien.');
    var pw = newPwd_(newPwd); u.salt = pw.salt; u.hash = pw.hash; u.mustChange = false; upsert_('users', [u]); audit_(user, 'modifié', 'users', user.id, 'Changement de mot de passe'); return true;
  });
}
/* Charge les données d'exemple (une seule fois, uniquement sur une base vide). */
var SKIP_IMPORT = ['users', 'audit', 'modules', 'perms', 'channels', 'templates', 'outbox'];
function apiImportAll(token, tables) {
  var user = auth_(token); if (user.role !== 'admin') throw new Error('Réservé à la direction.');
  return withLock_(function () {
    if (read_('students').length || read_('classes').length) throw new Error('La base contient déjà des données.');
    var n = 0;
    TABLES.forEach(function (t) {
      if (SKIP_IMPORT.indexOf(t) >= 0 || !tables[t] || !tables[t].length) return;
      var rows = tables[t].map(function (r) { var o = {}; cols_(t).forEach(function (k) { o[k] = r[k]; }); o.id = r.id || Utilities.getUuid(); return o; });
      if (t === 'settings') rows = [Object.assign({}, rows[0], { id: 'main' })];
      upsert_(t, rows); n += rows.length;
    });
    audit_(user, 'créé', 'import', '', n + ' lignes d’exemple');
    return n;
  });
}
function apiEmailReport(token, subject, htmlBody) {
  var user = auth_(token); need_(user, 'reports', 'm');
  MailApp.sendEmail({ to: user.email, subject: String(subject).slice(0, 150), htmlBody: String(htmlBody).replace(/<script[\s\S]*?<\/script>/gi, '') });
  audit_(user, 'créé', 'rapport', '', 'Rapport envoyé à ' + user.email);
  return true;
}

/* ----- Admission : crée l'élève, le parent et les comptes en une seule opération ----- */
function apiAdmit(token, admissionId, classId, admNo) {
  var user = auth_(token); need_(user, 'admissions', 'm');
  var res = withLock_(function () {
    var db = loadDb_(['users', 'admissions', 'parents', 'students', 'classes', 'settings', 'modules', 'templates', 'channels']), ctx = { db: db, touched: {}, h: host_() };
    var r = admitCore_(ctx, admissionId, { classId: classId, admission: admNo });
    persist_(ctx); audit_(user, 'créé', 'students', r.student.id, 'Admission de ' + fullName_(r.student));
    r.db = db; return r;
  });
  announceAdmission_(res.db, res); flush_();
  return { student: res.student, parent: res.parent, classe: res.classe.nom, comptes: res.comptes };
}

/* ----- Canaux : clés d'API, essais, envois groupés, rappels ----- */
function secretNames_(canal) { var s = (CHANNEL_DEFS[canal] || { secrets: {} }).secrets, a = []; Object.keys(s).forEach(function (p) { s[p].forEach(function (n) { if (a.indexOf(n) < 0) a.push(n); }); }); return a; }
function apiSetSecret(token, canal, name, value) {
  var user = auth_(token); if (user.role !== 'admin') throw new Error('Réservé à la direction.');
  if (secretNames_(canal).indexOf(name) < 0) throw new Error('Clé inconnue.');
  var p = PropertiesService.getScriptProperties(), key = 'sec:' + canal + ':' + name, v = String(value || '').trim();
  if (v) p.setProperty(key, v); else p.deleteProperty(key);
  audit_(user, 'modifié', 'channels', canal, (v ? 'Clé enregistrée : ' : 'Clé effacée : ') + name);
  return true;
}
function apiSecretsStatus(token) {
  var user = auth_(token); if (user.role !== 'admin') throw new Error('Réservé à la direction.');
  var out = { quota: -1 };
  Object.keys(CHANNEL_DEFS).forEach(function (c) { out[c] = {}; secretNames_(c).forEach(function (n) { out[c][n] = !!secret_(c, n); }); });
  try { out.quota = MailApp.getRemainingDailyQuota(); } catch (e) { /* quota indisponible */ }
  return out;
}
function apiTestChannel(token, canal, to) {
  var user = auth_(token); if (user.role !== 'admin') throw new Error('Réservé à la direction.');
  if (!CHANNEL_DEFS[canal]) throw new Error('Canal inconnu.');
  var db = loadDb_(['channels', 'settings']), dest = canal === 'email' ? String(to || user.email).trim().toLowerCase() : e164_(to, (db.settings[0] || {}).indicatif || '221');
  if (!dest || (canal === 'email' && !validEmail_(dest))) throw new Error(canal === 'email' ? 'Adresse e-mail invalide.' : 'Numéro de téléphone invalide.');
  var m = { canal: canal, to: dest, nom: 'Essai', event: 'test', sujet: 'Essai Scolaria', texte: 'Ceci est un message d’essai envoyé depuis Scolaria.', secrets: [] };
  queue_([m]); var rows = flush_(); audit_(user, 'créé', 'outbox', '', 'Essai ' + canal);
  return rows[0];
}
function broadcastDb_() { return loadDb_(['classes', 'students', 'parents', 'teachers', 'users', 'settings', 'channels', 'templates', 'feeStructure', 'payments']); }
function sendPlan_(user, db, plan, label) {
  if (!plan.length) throw new Error('Aucun destinataire joignable avec ces canaux. Vérifiez les numéros et adresses, et les préférences de contact.');
  if (plan.length > MAX_MESSAGES) throw new Error('Trop de messages (' + plan.length + ', maximum ' + MAX_MESSAGES + '). Choisissez une classe.');
  var net = plan.filter(function (m) { return m.canal === 'email' || chanOf_(db, m.canal).fournisseur !== 'lien'; });
  if (net.length > MAX_SEND) throw new Error(net.length + ' envois automatiques demandés, la limite est de ' + MAX_SEND + ' par opération. Choisissez une classe, ou le canal « lien » pour un envoi manuel.');
  var mails = plan.filter(function (m) { return m.canal === 'email'; }).length;
  if (mails) { try { var q = MailApp.getRemainingDailyQuota(); if (q < mails) throw new Error('Quota d’e-mails du jour insuffisant : il reste ' + q + ' envois pour ' + mails + ' messages.'); } catch (e) { if (/Quota/.test(e.message)) throw e; } }
  queue_(plan); var rows = flush_(); audit_(user, 'créé', 'outbox', '', label + ' : ' + plan.length + ' message(s)');
  return summarize_(rows);
}
function apiBroadcast(token, spec) {
  var user = auth_(token); need_(user, 'messages', 'c');
  var db = broadcastDb_(), b = broadcastPlan_(db, spec), s = sendPlan_(user, db, b.plan, 'Envoi groupé'); s.destinataires = b.recs.length; return s;
}
function apiRemind(token, studentIds) {
  var user = auth_(token); need_(user, 'messages', 'c');
  var db = broadcastDb_(); return sendPlan_(user, db, remindPlan_(db, studentIds), 'Rappels de mensualité');
}
function apiOutboxMark(token, id) {
  var user = auth_(token); need_(user, 'outbox', 'm');
  return withLock_(function () {
    var r = read_('outbox').filter(function (x) { return x.id === id; })[0]; if (!r) throw new Error('Message introuvable.');
    r.statut = 'Envoyé (manuel)'; r.detail = 'Envoyé par ' + user.nom; upsert_('outbox', [r]); return true;
  });
}

/* ================= Rapport hebdomadaire automatique ================= */
function weeklyReport() {
  var admins = read_('users').filter(function (u) { return u.role === 'admin' && u.actif && u.email; }); if (!admins.length) return;
  var classes = read_('classes'), students = read_('students').filter(function (s) { return s.statut === 'Actif'; }), att = read_('attendance'), pay = read_('payments'), tickets = read_('tickets'), stock = read_('stock'), tx = read_('stockTx');
  var tz = Session.getScriptTimeZone(), since = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), tz, 'yyyy-MM-dd'), wk = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), tz, 'yyyy-MM-dd');
  var rows = classes.map(function (c) {
    var a = att.filter(function (x) { return x.classId === c.id && x.date >= since; }), ok = a.filter(function (x) { return x.statut === 'Présent' || x.statut === 'Retard'; }).length;
    return '<tr><td>' + c.nom + '</td><td>' + students.filter(function (s) { return s.classId === c.id; }).length + '</td><td>' + (a.length ? Math.round(ok / a.length * 1000) / 10 + ' %' : '—') + '</td></tr>';
  }).join('');
  var low = stock.filter(function (s) { var q = s.initial + tx.filter(function (t) { return t.itemId === s.id; }).reduce(function (n, t) { return n + (t.type === 'Entrée' ? t.quantite : -t.quantite); }, 0); return q <= s.seuil; }).length;
  var enc = pay.filter(function (p) { return p.date >= wk; }).reduce(function (n, p) { return n + p.montant; }, 0);
  var body = '<h2>Rapport hebdomadaire</h2><p>Encaissé sur 7 jours : <b>' + enc + ' FCFA</b><br>Demandes d’assistance ouvertes : <b>' + tickets.filter(function (t) { return t.statut === 'Ouvert' || t.statut === 'En cours'; }).length + '</b><br>Articles à réapprovisionner : <b>' + low + '</b></p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Classe</th><th>Effectif</th><th>Présence (30 j)</th></tr>' + rows + '</table>';
  admins.forEach(function (u) { MailApp.sendEmail({ to: u.email, subject: 'Scolaria — rapport hebdomadaire', htmlBody: body }); });
}
/* À exécuter une fois depuis l'éditeur pour programmer l'envoi chaque lundi à 7 h. */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'weeklyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
}
