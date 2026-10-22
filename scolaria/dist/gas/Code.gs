/**
 * Scolaria — backend Google Apps Script
 * Base de données : le classeur Google Sheets auquel ce script est lié (un onglet par table).
 * Les fonctions dont le nom finit par « _ » sont privées : le navigateur ne peut pas les appeler.
 */
var SCHEMA = {"settings": "id,ecole,adresse,tel,email,annee,devise,noteMax:n,notePassage:n,responsable,slogan", "classes": "id,nom,niveau,section,titulaireId,effectifMax:n,salle", "subjects": "id,nom,code,coef:n", "teachers": "id,matricule,nom,prenom,sexe,tel,email,specialite,statut,embauche", "assignments": "id,teacherId,subjectId,classId,heures:n", "students": "id,admission,nom,prenom,sexe,naissance,classId,parentId,tel,adresse,statut,nin", "parents": "id,nom,prenom,lien,tel,email,profession,adresse", "admissions": "id,date,nom,prenom,sexe,naissance,classId,parentPrenom,parentNom,parentTel,lien,statut,remarque,studentId", "users": "id,email,nom,role,linkId,tel,actif:b,hash,salt", "periods": "id,ordre:n,label,debut,fin,pause:b", "timetable": "id,classId,jour:n,periodId,subjectId,teacherId,salle", "attendance": "id,date,classId,studentId,statut,note", "exams": "id,session,type,classId,subjectId,date,heure,duree:n,salle,noteMax:n,trimestre", "marks": "id,examId,studentId,note:n,abs:b", "lessons": "id,teacherId,classId,subjectId,titre,objectifs,date,duree:n,statut", "logbook": "id,date,teacherId,classId,subjectId,contenu,devoirs", "conduct": "id,studentId,date,type,gravite,description,signalePar", "activities": "id,studentId,activite,categorie,date,resultat", "ptm": "id,date,heure,teacherId,statut,parentId,studentId,motif", "substitutes": "id,date,absentId,substituteId,classId,periodId,motif", "notices": "id,titre,contenu,date,cible,epingle:b,auteur", "events": "id,titre,date,fin,categorie,lieu", "complaints": "id,date,categorie,message,statut,reponse", "tickets": "id,cree,titre,description,priorite,statut,assigneId,creePar", "documents": "id,titre,type,studentId,fichier,verifie:b,expiration", "assets": "id,tag,nom,categorie,lieu,achat,valeur:n,etat,responsable", "maintenance": "id,assetId,date,type,description,cout:n,technicien", "stock": "id,code,nom,categorie,unite,initial:n,seuil:n,prix:n", "stockTx": "id,itemId,date,type,quantite:n,motif", "feeStructure": "id,classId,inscription:n,mensualite:n,transport:n,cantine:n", "payments": "id,date,studentId,type,mois,montant:n,mode,recu,caissier,remarque", "audit": "id,at,user,action,table,rowId,detail"};
var TABLES = Object.keys(SCHEMA);
var SESSION_TTL = 21600;          // 6 heures, maximum autorisé par CacheService
var MAX_TRIES = 5;                // tentatives de connexion avant blocage de 10 minutes

/* ================= Page web ================= */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Scolaria')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ================= Accès à la feuille ================= */
function ss_() {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (s) return s;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Aucun classeur lié. Créez le script depuis Extensions > Apps Script dans un Google Sheets.');
  return SpreadsheetApp.openById(id);
}
function cols_(t) { return SCHEMA[t].split(',').map(function (c) { return c.split(':')[0]; }); }
function types_(t) { var o = {}; SCHEMA[t].split(',').forEach(function (c) { var p = c.split(':'); o[p[0]] = p[1] || 's'; }); return o; }

function sheet_(t) {
  var book = ss_(), sh = book.getSheetByName(t), c = cols_(t), ty = types_(t);
  if (!sh) { sh = book.insertSheet(t); }
  var w = Math.max(sh.getLastColumn(), 1), head = sh.getRange(1, 1, 1, w).getValues()[0].filter(String);
  if (!head.length) { sh.getRange(1, 1, 1, c.length).setValues([c]); head = c; sh.setFrozenRows(1); sh.getRange(1, 1, 1, c.length).setFontWeight('bold').setBackground('#0e2a30').setFontColor('#ffffff'); }
  else { var miss = c.filter(function (x) { return head.indexOf(x) < 0; }); if (miss.length) { sh.getRange(1, head.length + 1, 1, miss.length).setValues([miss]); head = head.concat(miss); } }
  // Les colonnes de texte restent du texte : Sheets ne transforme pas « 2026-09-05 » en date.
  head.forEach(function (name, i) { if (ty[name] === 's' || ty[name] === undefined) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); });
  return { sh: sh, head: head };
}
function ensureAll_() { TABLES.forEach(function (t) { sheet_(t); }); }
function clean_(t, name, v) {
  var ty = types_(t)[name];
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (v === null || v === undefined) v = '';
  if (ty === 'n') { if (v === '') return ''; var n = Number(v); return isNaN(n) ? '' : n; }
  if (ty === 'b') return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';
  return String(v);
}
function read_(t) {
  var s = sheet_(t), last = s.sh.getLastRow();
  if (last < 2) return [];
  var vals = s.sh.getRange(2, 1, last - 1, s.head.length).getValues(), c = cols_(t), out = [];
  vals.forEach(function (r) {
    if (r[s.head.indexOf('id')] === '' ) return;
    var o = {}; c.forEach(function (name) { var i = s.head.indexOf(name); o[name] = clean_(t, name, i < 0 ? '' : r[i]); }); out.push(o);
  });
  return out;
}
function rowArray_(t, head, obj, base) {
  var c = cols_(t);
  return head.map(function (name, i) { return c.indexOf(name) >= 0 ? clean_(t, name, obj[name]) : (base ? base[i] : ''); });
}
function upsert_(t, rows) {
  var s = sheet_(t), idCol = s.head.indexOf('id') + 1, last = s.sh.getLastRow();
  var ids = last > 1 ? s.sh.getRange(2, idCol, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var data = last > 1 ? s.sh.getRange(2, 1, last - 1, s.head.length).getValues() : [], add = [], touched = false;
  rows.forEach(function (o) {
    var i = ids.indexOf(String(o.id));
    if (i >= 0) { data[i] = rowArray_(t, s.head, o, data[i]); touched = true; }
    else { add.push(rowArray_(t, s.head, o, null)); ids.push(String(o.id)); data.push(add[add.length - 1]); }
  });
  if (touched) { var n = last - 1; if (n > 0) s.sh.getRange(2, 1, n, s.head.length).setValues(data.slice(0, n)); }
  if (add.length) s.sh.getRange(Math.max(last, 1) + 1, 1, add.length, s.head.length).setValues(add);
}
function delete_(t, ids) {
  var s = sheet_(t), last = s.sh.getLastRow(); if (last < 2) return;
  var idCol = s.head.indexOf('id') + 1, col = s.sh.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) if (ids.indexOf(String(col[i][0])) >= 0) s.sh.deleteRow(i + 2);
}

/* ================= Sécurité : mots de passe, sessions, droits ================= */
function hash_(pwd, salt) {
  var d = salt + ':' + pwd, b;
  for (var i = 0; i < 300; i++) { b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d, Utilities.Charset.UTF_8); d = Utilities.base64Encode(b) + salt; }
  return Utilities.base64Encode(b);
}
function newUser_(email, nom, role, pwd, linkId) {
  var salt = Utilities.getUuid();
  return { id: Utilities.getUuid(), email: String(email).trim().toLowerCase(), nom: nom, role: role, linkId: linkId || '', tel: '', actif: true, hash: hash_(pwd, salt), salt: salt };
}
function checkPwd_(p) { if (!p || String(p).length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.'); }
function publicUser_(u) { return { id: u.id, email: u.email, nom: u.nom, role: u.role, linkId: u.linkId, tel: u.tel, actif: u.actif, hash: '', salt: '' }; }
function auth_(token) {
  var id = token ? CacheService.getScriptCache().get('s:' + token) : null;
  if (!id) throw new Error('AUTH');
  var u = read_('users').filter(function (x) { return x.id === id && x.actif; })[0];
  if (!u) throw new Error('AUTH');
  CacheService.getScriptCache().put('s:' + token, id, SESSION_TTL);
  return u;
}
function withLock_(fn) { var l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function audit_(user, action, table, rowId, detail) {
  if (table === 'audit') return;
  upsert_('audit', [{ id: Utilities.getUuid(), at: new Date().toISOString(), user: user.nom, action: action, table: table, rowId: rowId, detail: String(detail || '').slice(0, 200) }]);
}

var ADM = ['admin'], SEC = ['admin', 'secretaire'], STF = ['admin', 'secretaire', 'surveillant', 'enseignant'];
var WRITE = {
  students: SEC, parents: SEC, admissions: SEC, classes: SEC, subjects: ADM, teachers: SEC, assignments: SEC, users: ADM, settings: ADM, periods: SEC, timetable: SEC,
  attendance: ['admin', 'surveillant', 'enseignant'], exams: SEC, marks: ['admin', 'enseignant'], lessons: ['admin', 'enseignant'], logbook: ['admin', 'enseignant'],
  conduct: ['admin', 'surveillant', 'enseignant'], activities: ['admin', 'secretaire', 'surveillant'], ptm: ['admin', 'secretaire', 'enseignant'], substitutes: ['admin', 'secretaire', 'surveillant'],
  notices: SEC, events: SEC, complaints: ADM, tickets: STF, documents: SEC, assets: SEC, maintenance: SEC, stock: SEC, stockTx: SEC, feeStructure: ADM, payments: SEC
};
/* Le contrôle fin (qui peut écrire quelle ligne) est ici et non dans le navigateur. */
function allowWrite_(user, t, row, existing, isDelete) {
  var r = user.role;
  if ((WRITE[t] || []).indexOf(r) >= 0) return true;
  if (t === 'complaints' && !existing && !isDelete) return true;                       // dépôt anonyme ouvert à tous
  if (t === 'users' && existing && existing.id === user.id && !isDelete) return true;  // chacun peut modifier son profil
  if (t === 'ptm' && r === 'parent' && existing && !isDelete) return existing.statut === 'Libre' || existing.parentId === user.linkId;
  return false;
}
function hasRole_(user, roles) { return roles.indexOf(user.role) >= 0; }

/* ================= Données visibles selon le rôle ================= */
function dataFor_(user) {
  var all = {}; TABLES.forEach(function (t) { all[t] = read_(t); });
  all.users = all.users.map(publicUser_);
  var r = user.role, out = {};
  if (r === 'admin') return all;
  TABLES.forEach(function (t) { out[t] = []; });
  if (r === 'secretaire' || r === 'surveillant' || r === 'enseignant') {
    var money = r === 'secretaire', base = ['settings', 'classes', 'subjects', 'teachers', 'assignments', 'students', 'parents', 'periods', 'timetable', 'attendance', 'exams', 'marks', 'lessons', 'logbook', 'conduct', 'activities', 'ptm', 'substitutes', 'notices', 'events', 'tickets'];
    if (money) base = base.concat(['admissions', 'documents', 'assets', 'maintenance', 'stock', 'stockTx', 'feeStructure', 'payments']);
    base.forEach(function (t) { out[t] = all[t]; });
    if (!money) out.students = all.students.map(function (s) { var c = {}; for (var k in s) c[k] = s[k]; c.nin = ''; return c; });
    out.users = all.users.map(function (u) { return u.id === user.id || money ? u : { id: u.id, email: '', nom: u.nom, role: u.role, linkId: '', tel: '', actif: u.actif, hash: '', salt: '' }; });
    return out;
  }
  // élève ou parent : uniquement les enfants concernés, camarades rendus anonymes pour le classement
  var kids = r === 'eleve' ? all.students.filter(function (s) { return s.id === user.linkId; }) : all.students.filter(function (s) { return s.parentId === user.linkId; });
  var kidIds = kids.map(function (s) { return s.id; }), classIds = kids.map(function (s) { return s.classId; });
  var inCls = function (x) { return classIds.indexOf(x.classId) >= 0; };
  var n = 0, mates = all.students.filter(function (s) { return classIds.indexOf(s.classId) >= 0 && s.statut === 'Actif'; });
  out.settings = all.settings; out.periods = all.periods; out.subjects = all.subjects; out.notices = all.notices; out.events = all.events;
  out.classes = all.classes.filter(function (c) { return classIds.indexOf(c.id) >= 0; });
  out.timetable = all.timetable.filter(inCls); out.exams = all.exams.filter(inCls); out.assignments = all.assignments.filter(inCls);
  out.students = mates.map(function (s) { if (kidIds.indexOf(s.id) >= 0) { var c = {}; for (var k in s) c[k] = s[k]; c.nin = ''; return c; } n++; return { id: s.id, admission: '', nom: 'Camarade', prenom: '#' + n, sexe: s.sexe, naissance: '', classId: s.classId, parentId: '', tel: '', adresse: '', statut: 'Actif', nin: '' }; });
  out.marks = all.marks.filter(function (m) { return mates.some(function (s) { return s.id === m.studentId; }); });
  out.attendance = all.attendance.filter(function (a) { return kidIds.indexOf(a.studentId) >= 0; });
  out.teachers = all.teachers.map(function (t) { return { id: t.id, matricule: '', nom: t.nom, prenom: t.prenom, sexe: '', tel: '', email: '', specialite: t.specialite, statut: '', embauche: '' }; });
  out.users = all.users.filter(function (u) { return u.id === user.id; });
  if (r === 'parent') {
    out.parents = all.parents.filter(function (p) { return p.id === user.linkId; });
    out.payments = all.payments.filter(function (p) { return kidIds.indexOf(p.studentId) >= 0; });
    out.feeStructure = all.feeStructure.filter(inCls);
    out.ptm = all.ptm.filter(function (x) { return x.statut === 'Libre' || x.parentId === user.linkId; });
  }
  return out;
}

/* ================= API appelée par le navigateur ================= */
function apiStatus() {
  ensureAll_();
  var set = read_('settings')[0];
  return { hasUsers: read_('users').length > 0, school: set ? set.ecole : '' };
}
function apiSetupAdmin(email, nom, pwd) {
  return withLock_(function () {
    ensureAll_();
    if (read_('users').length) throw new Error('Un compte existe déjà. Connectez-vous.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw new Error('Adresse e-mail invalide.');
    if (!nom || !String(nom).trim()) throw new Error('Indiquez votre nom.');
    checkPwd_(pwd);
    var u = newUser_(email, String(nom).trim(), 'admin', pwd); upsert_('users', [u]);
    if (!read_('settings').length) upsert_('settings', [{ id: 'main', ecole: 'Mon établissement', adresse: '', tel: '', email: String(email).trim(), annee: defaultYear_(), devise: 'FCFA', noteMax: 20, notePassage: 10, responsable: String(nom).trim(), slogan: '' }]);
    audit_(u, 'créé', 'users', u.id, 'Compte administrateur initial');
    return login_(u);
  });
}
function defaultYear_() { var d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return y + '-' + (y + 1); }
function login_(u) { var token = Utilities.getUuid() + Utilities.getUuid(); CacheService.getScriptCache().put('s:' + token, u.id, SESSION_TTL); return { token: token, me: publicUser_(u) }; }
function apiLogin(email, pwd) {
  var key = 'try:' + String(email || '').trim().toLowerCase(), cache = CacheService.getScriptCache(), tries = Number(cache.get(key) || 0);
  if (tries >= MAX_TRIES) throw new Error('Trop de tentatives. Réessayez dans 10 minutes.');
  var u = read_('users').filter(function (x) { return x.email === String(email || '').trim().toLowerCase(); })[0];
  if (!u || !u.actif || !u.hash || hash_(String(pwd || ''), u.salt) !== u.hash) { cache.put(key, String(tries + 1), 600); throw new Error('Adresse ou mot de passe incorrect.'); }
  cache.remove(key); return login_(u);
}
function apiLogout(token) { if (token) CacheService.getScriptCache().remove('s:' + token); return true; }
function apiLoadAll(token) { var u = auth_(token); return { tables: dataFor_(u), me: publicUser_(u) }; }

function apiSave(token, t, row) { return apiSaveMany(token, t, [row])[0]; }
function apiSaveMany(token, t, rows) {
  var user = auth_(token);
  if (TABLES.indexOf(t) < 0 || t === 'audit') throw new Error('Table inconnue.');
  return withLock_(function () {
    var current = read_(t), saved = [];
    rows.forEach(function (raw) {
      var id = raw.id || Utilities.getUuid(), ex = current.filter(function (x) { return x.id === id; })[0] || null, o = {};
      cols_(t).forEach(function (c) { o[c] = raw[c]; }); o.id = id;
      if (t === 'users') {
        if (ex) { if (user.role !== 'admin') { o.role = ex.role; o.email = ex.email; o.linkId = ex.linkId; o.actif = ex.actif; } }
        else { o.email = String(o.email || '').trim().toLowerCase(); }
        var full = read_('users').filter(function (x) { return x.id === id; })[0]; o.hash = full ? full.hash : ''; o.salt = full ? full.salt : '';
        if (o.email && read_('users').some(function (x) { return x.email === o.email && x.id !== id; })) throw new Error('Cette adresse a déjà un compte.');
        if (ex && ex.role === 'admin' && (o.role !== 'admin' || !o.actif) && read_('users').filter(function (x) { return x.role === 'admin' && x.actif; }).length < 2) throw new Error('Il doit rester au moins un administrateur actif.');
      }
      if (t === 'ptm' && user.role === 'parent') {
        // Un parent peut seulement réserver un créneau libre ou libérer le sien : date, heure et enseignant restent ceux du créneau.
        if (!ex) throw new Error('Action non autorisée pour votre rôle.');
        ['date', 'heure', 'teacherId'].forEach(function (k) { o[k] = ex[k]; });
        var mine = read_('students').filter(function (x) { return x.parentId === user.linkId; }).map(function (x) { return x.id; });
        if (ex.statut === 'Libre') {
          if (mine.indexOf(o.studentId) < 0) throw new Error('Choisissez un de vos enfants.');
          o.statut = 'Réservé'; o.parentId = user.linkId;
        } else if (ex.parentId === user.linkId) {
          if (o.statut === 'Libre') { o.parentId = ''; o.studentId = ''; o.motif = ''; }
          else { if (mine.indexOf(o.studentId) < 0) throw new Error('Choisissez un de vos enfants.'); o.statut = ex.statut; o.parentId = user.linkId; }
        } else throw new Error('Créneau déjà réservé.');
      }
      if (t === 'complaints' && !ex && user.role !== 'admin') { o.statut = 'Nouvelle'; o.reponse = ''; }
      if (!allowWrite_(user, t, o, ex, false)) throw new Error('Action non autorisée pour votre rôle.');
      saved.push(o);
    });
    upsert_(t, saved);
    audit_(user, rows.some(function (r) { return !r.id; }) ? 'créé' : 'modifié', t, saved.length === 1 ? saved[0].id : '', saved.length === 1 ? (saved[0].recu || saved[0].nom || saved[0].titre || saved[0].session || '') : saved.length + ' lignes');
    return saved.map(function (o) { if (t === 'users') { o.hash = ''; o.salt = ''; } return o; });
  });
}
function apiRemove(token, t, ids) {
  var user = auth_(token);
  if (TABLES.indexOf(t) < 0 || t === 'audit') throw new Error('Table inconnue.');
  return withLock_(function () {
    var current = read_(t);
    ids.forEach(function (id) {
      var ex = current.filter(function (x) { return x.id === id; })[0]; if (!ex) return;
      if (!allowWrite_(user, t, ex, ex, true)) throw new Error('Suppression non autorisée pour votre rôle.');
      if (t === 'users' && id === user.id) throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
    });
    delete_(t, ids); audit_(user, 'supprimé', t, ids.join(','), ids.length + ' ligne(s)'); return true;
  });
}
function apiSetPassword(token, userId, pwd) {
  var user = auth_(token); if (!hasRole_(user, ['admin'])) throw new Error('Réservé à la direction.'); checkPwd_(pwd);
  return withLock_(function () {
    var u = read_('users').filter(function (x) { return x.id === userId; })[0]; if (!u) throw new Error('Utilisateur introuvable.');
    var salt = Utilities.getUuid(); u.salt = salt; u.hash = hash_(pwd, salt); upsert_('users', [u]); audit_(user, 'modifié', 'users', userId, 'Mot de passe réinitialisé'); return true;
  });
}
function apiChangePassword(token, oldPwd, newPwd) {
  var user = auth_(token); checkPwd_(newPwd);
  return withLock_(function () {
    var u = read_('users').filter(function (x) { return x.id === user.id; })[0];
    if (hash_(String(oldPwd || ''), u.salt) !== u.hash) throw new Error('Ancien mot de passe incorrect.');
    var salt = Utilities.getUuid(); u.salt = salt; u.hash = hash_(newPwd, salt); upsert_('users', [u]); audit_(user, 'modifié', 'users', user.id, 'Changement de mot de passe'); return true;
  });
}
/* Charge les données d'exemple (une seule fois, uniquement sur une base vide). */
function apiImportAll(token, tables) {
  var user = auth_(token); if (!hasRole_(user, ['admin'])) throw new Error('Réservé à la direction.');
  return withLock_(function () {
    if (read_('students').length || read_('classes').length) throw new Error('La base contient déjà des données.');
    var n = 0;
    TABLES.forEach(function (t) {
      if (t === 'users' || t === 'audit' || !tables[t] || !tables[t].length) return;
      var rows = tables[t].map(function (r) { var o = {}; cols_(t).forEach(function (c) { o[c] = r[c]; }); o.id = r.id || Utilities.getUuid(); return o; });
      if (t === 'settings') rows = [Object.assign({}, rows[0], { id: 'main' })];
      upsert_(t, rows); n += rows.length;
    });
    audit_(user, 'créé', 'import', '', n + ' lignes d’exemple');
    return n;
  });
}
function apiEmailReport(token, subject, htmlBody) {
  var user = auth_(token); if (!hasRole_(user, ['admin'])) throw new Error('Réservé à la direction.');
  MailApp.sendEmail({ to: user.email, subject: String(subject).slice(0, 150), htmlBody: String(htmlBody).replace(/<script[\s\S]*?<\/script>/gi, '') });
  audit_(user, 'créé', 'rapport', '', 'Rapport envoyé à ' + user.email);
  return true;
}

/* ================= Rapport hebdomadaire automatique ================= */
function weeklyReport() {
  var admins = read_('users').filter(function (u) { return u.role === 'admin' && u.actif; }); if (!admins.length) return;
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
