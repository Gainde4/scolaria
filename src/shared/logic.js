/* ===== Scolaria : règles métier communes à l'interface et au serveur =====
   Fonctions pures : elles travaillent sur un objet « ctx » { db, touched, h } où
   db = { table: [lignes] }, touched = lignes créées ou modifiées, h = outils de l'hôte (identifiants, hachage, date).
   Le serveur (Code.gs) les appelle pour de vrai, l'interface en mode démonstration les appelle sur sa copie locale. */

/* ---------- Textes, téléphones, identifiants ---------- */
const pad_ = (n, l) => String(n).padStart(l || 3, '0');
function safe_(s, max, multiline) {
  s = String(s == null ? '' : s).replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ');
  s = multiline ? s.replace(/[ \t]+/g, ' ').trim() : s.replace(/\s+/g, ' ').trim();
  while (s && '=+-@'.indexOf(s[0]) >= 0) s = s.slice(1).trim();      // jamais de formule dans le classeur
  return s.slice(0, max || 120);
}
function validEmail_(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim()) && String(s).length <= 120; }
function phoneDigits_(s, ind) {
  ind = ind || '221'; let d = String(s || '').replace(/\D/g, '');
  if (d.indexOf('00' + ind) === 0) d = d.slice(2 + ind.length); else if (d.indexOf(ind) === 0 && d.length >= ind.length + 8) d = d.slice(ind.length);
  return d;
}
/* Numéro local de l'indicatif de l'école (Sénégal par défaut : 9 chiffres commençant par 70, 75, 76, 77, 78, 30 ou 33) ou numéro international +… */
function validPhone_(s, ind) {
  ind = ind || '221'; const raw = String(s || '').replace(/[\s.()-]/g, '');
  if (/^\+\d{8,15}$/.test(raw)) return true;
  const d = phoneDigits_(s, ind);
  return ind === '221' ? /^(70|75|76|77|78|33|30)\d{7}$/.test(d) : /^\d{7,12}$/.test(d);
}
function fmtPhone_(s) { const d = phoneDigits_(s); return d.length === 9 ? d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5, 7) + ' ' + d.slice(7) : String(s || '').trim(); }
function e164_(s, ind) {
  ind = ind || '221'; const raw = String(s || '').trim().replace(/[\s.()-]/g, '');
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  return validPhone_(s, ind) ? '+' + ind + phoneDigits_(s, ind) : '';
}
/* Identifiant de connexion : adresse e-mail, numéro de téléphone (chiffres) ou code d'accès (n° d'admission). */
function loginKey_(s) {
  s = String(s || '').trim(); if (s.indexOf('@') >= 0) return s.toLowerCase();
  const d = s.replace(/[\s.()-]/g, ''); if (/^\+?\d{8,15}$/.test(d)) return phoneDigits_(d);
  return s.toLowerCase();
}
function validDate_(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false; const d = new Date(s + 'T12:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
function ageOn_(birth, today) { const b = birth.split('-').map(Number), t = today.split('-').map(Number); let a = t[0] - b[0]; if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) a--; return a; }
const fullName_ = p => p ? (String(p.prenom || '') + ' ' + String(p.nom || '')).trim() : '';
function parseJson_(s, def) { try { const v = JSON.parse(s); return v == null ? def : v; } catch (e) { return def; } }
function fcfa_(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'; }
function fmtDateFr_(s) { return s ? String(s).split('-').reverse().join('/') : ''; }

/* ---------- Mensualités (aussi utilisées pour les rappels) ---------- */
function monthsElapsed_() {
  const m = new Date().getMonth() + 1;
  if (m >= 10) return m - 9;
  if (m <= 6) return m + 3;
  return m === 9 ? 0 : 9;
}
function studentDues_(db, s) {
  const fee = db.feeStructure.find(f => f.classId === s.classId) || { inscription: 0, mensualite: 0 };
  const count = monthsElapsed_();
  const pays = db.payments.filter(p => p.studentId === s.id);
  const sum = (type, mois) => pays.filter(p => p.type === type && (mois === undefined || p.mois === mois)).reduce((a, p) => a + (Number(p.montant) || 0), 0);
  const byMonth = MOIS.map((m, i) => {
    const paid = sum('Mensualité', m), due = i < count ? fee.mensualite : 0;
    return { m, paid, due, status: i >= count ? 'fut' : paid >= fee.mensualite ? 'ok' : paid > 0 ? 'part' : 'no' };
  });
  const inscPaid = sum('Inscription');
  const du = fee.inscription + fee.mensualite * count;
  const applied = Math.min(inscPaid, fee.inscription) + byMonth.reduce((a, b) => a + Math.min(b.paid, b.due), 0);
  return { fee, byMonth, inscPaid, du, paye: applied, reste: Math.max(0, du - applied) };
}

/* ---------- Personnalisation des modules ---------- */
const CF_TYPES = ['text', 'area', 'num', 'date', 'select', 'bool'];
function modRow_(db, k) { return (db.modules || []).find(x => x.id === k) || null; }
function customDefs_(db, k) {
  const a = parseJson_((modRow_(db, k) || {}).champs, []);
  return Array.isArray(a) ? a.filter(d => d && /^[a-z][a-z0-9_]{0,19}$/.test(String(d.k)) && d.l && CF_TYPES.indexOf(d.t) >= 0) : [];
}
function listOf_(db, key) {
  const def = LIST_DEFS[key]; if (!def) return [];
  const o = parseJson_((modRow_(db, def.mod) || {}).listes, {});
  return Array.isArray(o[key]) && o[key].length ? o[key] : def.def;
}
function modOpt_(db, k) {
  const defs = OPTION_DEFS[k] || [], o = parseJson_((modRow_(db, k) || {}).options, {}), out = {};
  defs.forEach(d => { out[d.k] = o[d.k] === undefined ? d.def : o[d.k]; });
  return out;
}
function cleanExtra_(defs, raw) {
  const src = typeof raw === 'string' ? parseJson_(raw, {}) : (raw || {}), out = {};
  defs.forEach(d => {
    let v = src[d.k]; if (v === undefined || v === null || v === '') return;
    if (d.t === 'num') { v = Number(v); if (isNaN(v)) return; }
    else if (d.t === 'bool') v = v === true || v === 'true';
    else { v = safe_(v, d.t === 'area' ? 400 : 120, d.t === 'area'); if (!v) return; if (d.t === 'select' && (d.o || []).indexOf(v) < 0) return; if (d.t === 'date' && !validDate_(v)) return; }
    out[d.k] = v;
  });
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
/* Valide une ligne de configuration envoyée par l'administrateur (modules, droits, canaux, messages). */
function sanitizeConfig_(t, o) {
  const bad = m => { throw new Error(m); };
  if (t === 'modules') {
    const m = MOD_BY_KEY[o.id]; if (!m) bad('Module inconnu.');
    const lists = parseJson_(o.listes, {}), cleanLists = {};
    Object.keys(lists).forEach(k => { if (LIST_DEFS[k] && LIST_DEFS[k].mod === m.k && Array.isArray(lists[k])) { const a = lists[k].map(x => safe_(x, 40)).filter(Boolean).slice(0, 30); if (a.length) cleanLists[k] = a; } });
    const seen = {}, defs = (parseJson_(o.champs, []) || []).slice(0, 15).filter(d => d && d.l && /^[a-z][a-z0-9_]{0,19}$/.test(String(d.k)) && CF_TYPES.indexOf(d.t) >= 0 && !seen[d.k] && (seen[d.k] = 1)).map(d => ({ k: d.k, l: safe_(d.l, 40), t: d.t, req: !!d.req, liste: !!d.liste, o: d.t === 'select' ? (d.o || []).map(x => safe_(x, 40)).filter(Boolean).slice(0, 20) : undefined }));
    if (!m.custom && defs.length) bad('Ce module n’accepte pas de champs personnalisés.');
    const opt = parseJson_(o.options, {}), cleanOpt = {};
    (OPTION_DEFS[m.k] || []).forEach(d => {
      let v = opt[d.k]; if (v === undefined) return;
      if (d.t === 'bool') v = v === true || v === 'true'; else if (d.t === 'num') { v = Number(v); if (isNaN(v)) return; v = Math.max(d.min, Math.min(d.max, Math.round(v))); }
      else if (d.t === 'select') { if (!d.o.some(x => x[0] === v)) return; } else v = safe_(v, 300);
      cleanOpt[d.k] = v;
    });
    return { id: m.k, label: safe_(o.label, 40), sub: safe_(o.sub, 160), actif: m.sys || m.fixed ? true : o.actif !== false && o.actif !== 'false', ordre: Number(o.ordre) || 0, champs: defs.length ? JSON.stringify(defs) : '', listes: Object.keys(cleanLists).length ? JSON.stringify(cleanLists) : '', options: Object.keys(cleanOpt).length ? JSON.stringify(cleanOpt) : '' };
  }
  if (t === 'perms') {
    const m = MOD_BY_KEY[o.module]; if (!m || m.sys || m.fixed) bad('Ce module ne se règle pas dans la matrice.');
    if (ROLE_IDS.indexOf(o.role) < 1) bad('Rôle inconnu.');
    if (m.el.indexOf(o.role) < 0) bad('Ce rôle ne peut pas recevoir de droits sur ce module.');
    return { id: o.role + '|' + o.module, role: o.role, module: o.module, droits: normRights_(m, o.droits) };
  }
  if (t === 'channels') {
    const d = CHANNEL_DEFS[o.id]; if (!d) bad('Canal inconnu.');
    if (!d.providers.some(p => p[0] === o.fournisseur)) bad('Fournisseur inconnu pour ce canal.');
    const opt = parseJson_(o.options, {}), clean = {};
    if (opt.from) clean.from = safe_(opt.from, 40); if (opt.indicatif) clean.indicatif = safe_(opt.indicatif, 5);
    return { id: o.id, actif: o.actif === true || o.actif === 'true', fournisseur: o.fournisseur, expediteur: safe_(o.expediteur, 60), options: Object.keys(clean).length ? JSON.stringify(clean) : '' };
  }
  if (t === 'templates') {
    const d = EVENTS[o.id]; if (!d || d.hidden) bad('Message inconnu.');
    const texte = safe_(o.texte, 600, true); if (!texte) bad('Le texte du message ne peut pas être vide.');
    return { id: o.id, actif: o.actif === true || o.actif === 'true', email: !!(o.email === true || o.email === 'true'), sms: !!(o.sms === true || o.sms === 'true'), whatsapp: !!(o.whatsapp === true || o.whatsapp === 'true'), sujet: safe_(o.sujet, 150), texte };
  }
  return o;
}

/* ---------- Modifications d'un ctx ---------- */
function put_(ctx, t, row) {
  const arr = ctx.db[t] || (ctx.db[t] = []), i = arr.findIndex(x => x.id === row.id);
  if (i >= 0) arr[i] = row; else arr.push(row);
  (ctx.touched[t] = ctx.touched[t] || {})[row.id] = row;
  return row;
}
const yearOf_ = db => ((db.settings && db.settings[0] || {}).annee || '').slice(0, 4) || String(new Date().getFullYear());
const nextSeq_ = (rows, key) => rows.reduce((m, r) => { const x = /(\d+)$/.exec(r[key] || ''); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
const nextAdmission_ = db => 'ADM-' + yearOf_(db) + '-' + pad_(nextSeq_(db.students || [], 'admission'));
const nextRef_ = db => 'INS-' + yearOf_(db) + '-' + pad_(nextSeq_(db.admissions || [], 'ref'), 4);

/* ---------- Inscription en ligne ---------- */
function parentOfUser_(db, user) {
  const adm = (db.admissions || []).filter(a => a.userId === user.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (adm) return { prenom: adm.parentPrenom, nom: adm.parentNom, tel: adm.parentTel, lien: adm.lien, email: adm.parentEmail || user.email || '' };
  const par = user.linkId && (db.parents || []).find(p => p.id === user.linkId);
  if (par) return { prenom: par.prenom, nom: par.nom, tel: par.tel, lien: par.lien, email: par.email || user.email || '' };
  const parts = String(user.nom || '').split(' ');
  return { prenom: parts[0], nom: parts.slice(1).join(' ') || parts[0], tel: user.tel, lien: 'Tuteur', email: user.email || '' };
}
/* form = { parent: {prenom, nom, lien, tel, email, pwd}, enfants: [{prenom, nom, sexe, naissance, classId, remarque, extra}], canaux, consent }
   me = compte déjà connecté (candidat ou parent qui ajoute un enfant) */
function registerCore_(ctx, form, me) {
  const db = ctx.db, h = ctx.h, o = modOpt_(db, 'admissions'), today = h.today();
  if (!o.public) throw new Error('Les inscriptions en ligne sont fermées pour le moment. Contactez le secrétariat.');
  if (form.consent !== true) throw new Error('Veuillez accepter le traitement des informations pour continuer.');
  const kids = Array.isArray(form.enfants) ? form.enfants : [];
  if (!kids.length) throw new Error('Ajoutez au moins un enfant.');
  if (kids.length > 5) throw new Error('Cinq enfants au maximum par envoi.');
  if (!(db.classes || []).length) throw new Error('Aucune classe n’est ouverte aux inscriptions pour le moment.');

  let par, user = me || null;
  if (user) par = parentOfUser_(db, user);
  else {
    const p = form.parent || {};
    par = { prenom: safe_(p.prenom, 60), nom: safe_(p.nom, 60), lien: safe_(p.lien, 20), tel: String(p.tel || '').trim(), email: String(p.email || '').trim().toLowerCase() };
    if (!par.prenom) throw new Error('Indiquez le prénom du parent ou tuteur.');
    if (!par.nom) throw new Error('Indiquez le nom du parent ou tuteur.');
    if (listOf_(db, 'parents.lien').indexOf(par.lien) < 0) throw new Error('Choisissez votre lien avec l’enfant.');
    if (!validPhone_(par.tel, ((db.settings || [])[0] || {}).indicatif)) throw new Error('Numéro de téléphone invalide (exemple : 77 123 45 67).');
    if (par.email && !validEmail_(par.email)) throw new Error('Adresse e-mail invalide.');
    if (!p.pwd || String(p.pwd).length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    par.tel = fmtPhone_(par.tel);
  }
  const defs = customDefs_(db, 'admissions'), rows = [];
  kids.forEach((k, i) => {
    const n = kids.length > 1 ? ' (enfant ' + (i + 1) + ')' : '', e = {
      prenom: safe_(k.prenom, 60), nom: safe_(k.nom, 60), sexe: k.sexe, naissance: String(k.naissance || ''), classId: String(k.classId || ''), remarque: safe_(k.remarque, 200, true)
    };
    if (!e.prenom || !e.nom) throw new Error('Indiquez le prénom et le nom de l’enfant' + n + '.');
    if (e.sexe !== 'M' && e.sexe !== 'F') throw new Error('Indiquez le sexe de l’enfant' + n + '.');
    if (!validDate_(e.naissance)) throw new Error('Date de naissance invalide' + n + '.');
    const age = ageOn_(e.naissance, today); if (age < 2 || age > 25) throw new Error('Date de naissance improbable' + n + ' : l’âge doit être compris entre 2 et 25 ans.');
    if (!db.classes.some(c => c.id === e.classId)) throw new Error('Choisissez la classe demandée' + n + '.');
    const same = x => String(x.nom).toLowerCase() === e.nom.toLowerCase() && String(x.prenom).toLowerCase() === e.prenom.toLowerCase() && x.naissance === e.naissance;
    if ((db.admissions || []).some(x => same(x) && x.statut !== 'Refusé') || (db.students || []).some(x => same(x) && x.statut === 'Actif') || rows.some(same))
      throw new Error(e.prenom + ' ' + e.nom + ' a déjà une inscription ou un dossier. Contactez le secrétariat pour la modifier.');
    e.extra = cleanExtra_(defs, k.extra); rows.push(e);
  });

  if (!user) {
    const p = form.parent, key = loginKey_(par.email || par.tel);
    if ((db.users || []).some(u => u.login === key || u.email === key || (par.email && u.email === par.email)))
      throw new Error('Un compte existe déjà avec ces coordonnées. Connectez-vous pour ajouter un enfant, ou demandez de l’aide au secrétariat.');
    const pw = h.pwd(String(p.pwd)), canaux = (Array.isArray(form.canaux) ? form.canaux : []).filter(c => CHANNEL_DEFS[c]).join(',');
    user = put_(ctx, 'users', { id: h.uid(), email: par.email, nom: (par.prenom + ' ' + par.nom).trim(), role: 'candidat', linkId: '', tel: par.tel, actif: true, hash: pw.hash, salt: pw.salt, login: key, mustChange: false, source: 'inscription', canaux });
  }
  const adms = rows.map(e => put_(ctx, 'admissions', {
    id: h.uid(), date: today, nom: e.nom, prenom: e.prenom, sexe: e.sexe, naissance: e.naissance, classId: e.classId, parentPrenom: par.prenom, parentNom: par.nom, parentTel: par.tel, lien: par.lien,
    statut: 'En attente', remarque: e.remarque, studentId: '', parentEmail: par.email, userId: user.id, ref: nextRef_(db), source: 'en ligne', extra: e.extra
  }));
  const admitted = [];
  if (o.mode === 'auto') adms.forEach(a => { try { admitted.push(admitCore_(ctx, a.id, { classId: a.classId, actor: 'Inscription en ligne' })); } catch (e) { /* classe complète : la demande reste en attente */ } });
  return { user, parent: par, admissions: adms, refs: adms.map(a => a.ref), admitted };
}

/* ---------- Admission : dossier élève, fiche parent, comptes ---------- */
function admitCore_(ctx, admissionId, params) {
  const db = ctx.db, h = ctx.h, o = modOpt_(db, 'admissions'), adm = (db.admissions || []).find(a => a.id === admissionId);
  if (!adm) throw new Error('Candidature introuvable.');
  if (adm.statut === 'Admis') throw new Error('Ce candidat est déjà admis.');
  const classId = (params && params.classId) || adm.classId, cl = (db.classes || []).find(c => c.id === classId);
  if (!cl) throw new Error('Choisissez une classe d’affectation.');
  const eff = (db.students || []).filter(s => s.classId === classId && s.statut === 'Actif').length;
  if (eff >= cl.effectifMax) throw new Error('La classe ' + cl.nom + ' est complète (' + eff + '/' + cl.effectifMax + ').');
  const no = String((params && params.admission) || '').trim() || nextAdmission_(db);
  if (!/^ADM-\d{4}-\d{3,5}$/.test(no)) throw new Error('Numéro d’admission au format ADM-2026-031 attendu.');
  if ((db.students || []).some(s => s.admission === no)) throw new Error('Ce numéro d’admission est déjà attribué.');

  const u = adm.userId ? (db.users || []).find(x => x.id === adm.userId) : null, tel = x => phoneDigits_(x);
  let par = u && u.linkId ? (db.parents || []).find(x => x.id === u.linkId) : null;
  if (!par && tel(adm.parentTel)) par = (db.parents || []).find(x => tel(x.tel) === tel(adm.parentTel)) || null;
  if (!par) par = put_(ctx, 'parents', { id: h.uid(), nom: adm.parentNom, prenom: adm.parentPrenom, lien: adm.lien || 'Tuteur', tel: adm.parentTel, email: adm.parentEmail || '', profession: '', adresse: '', extra: '' });
  const st = put_(ctx, 'students', { id: h.uid(), admission: no, nom: adm.nom, prenom: adm.prenom, sexe: adm.sexe, naissance: adm.naissance, classId, parentId: par.id, tel: adm.parentTel || par.tel, adresse: '', statut: 'Actif', nin: '', extra: '' });
  const done = put_(ctx, 'admissions', Object.assign({}, adm, { statut: 'Admis', classId, studentId: st.id }));

  const comptes = [];
  if (o.creerComptes) {
    const fresh = (role, nom, login, email, linkId, tel2) => {
      const pwd = h.temp(), pw = h.pwd(pwd);
      put_(ctx, 'users', { id: h.uid(), email, nom, role, linkId, tel: tel2, actif: true, hash: pw.hash, salt: pw.salt, login, mustChange: true, source: 'admission', canaux: '' });
      return { role, nom, login, pwd, nouveau: true };
    };
    const taken = key => (db.users || []).some(x => x.login === key || x.email === key);
    if (u) {
      const up = (u.role === 'candidat' || !u.linkId) ? put_(ctx, 'users', Object.assign({}, u, { role: u.role === 'candidat' ? 'parent' : u.role, linkId: par.id })) : u;
      comptes.push({ role: 'parent', nom: up.nom, login: up.login || up.email, pwd: '', nouveau: false });
    } else {
      const ex = (db.users || []).find(x => x.role === 'parent' && x.linkId === par.id), key = loginKey_(par.email || par.tel);
      if (ex) comptes.push({ role: 'parent', nom: ex.nom, login: ex.login || ex.email, pwd: '', nouveau: false });
      else if (key && !taken(key)) comptes.push(fresh('parent', fullName_(par), key, par.email || '', par.id, par.tel));
      else comptes.push({ role: 'parent', nom: fullName_(par), login: key, pwd: '', nouveau: false, note: key ? 'Cet identifiant appartient déjà à un autre compte : liez-le depuis « Utilisateurs et rôles ».' : 'Aucun contact : créez le compte depuis « Utilisateurs et rôles ».' });
    }
    if (o.compteEleve) { const key = no.toLowerCase(); if (!taken(key)) comptes.push(fresh('eleve', fullName_(st), key, '', st.id, '')); }
  }
  return { student: st, parent: par, admission: done, classe: cl, comptes };
}

/* ---------- Messages : modèles, destinataires, liens manuels ---------- */
function renderTpl_(t, vars) { return String(t || '').replace(/\{([a-zA-Z_]+)\}/g, (m, k) => vars[k] === undefined || vars[k] === null ? '' : String(vars[k])).replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim(); }
function tplOf_(db, ev) {
  const d = EVENTS[ev]; if (!d) return null;
  const r = (db.templates || []).find(x => x.id === ev), t = Object.assign({ id: ev }, d.def);
  if (r) { t.actif = r.actif; t.email = r.email; t.sms = r.sms; t.whatsapp = r.whatsapp; if (r.sujet) t.sujet = r.sujet; if (r.texte) t.texte = r.texte; }
  return t;
}
function chanOf_(db, c) {
  const d = CHANNEL_DEFS[c], r = (db.channels || []).find(x => x.id === c);
  return { id: c, actif: r ? r.actif : d.def.actif, fournisseur: r && r.fournisseur ? r.fournisseur : d.def.fournisseur, expediteur: r ? r.expediteur : '', options: parseJson_(r && r.options, {}) };
}
/* recipients : [{nom, tel, email, canaux, vars}] → liste de messages à envoyer, un par canal utilisable */
function planMessages_(db, ev, recipients, vars, opts) {
  opts = opts || {}; const tpl = tplOf_(db, ev); if (!tpl) return [];
  const st = (db.settings || [])[0] || {}, ind = st.indicatif || '221', out = [];
  recipients.forEach(r => {
    const prefs = r.canaux ? String(r.canaux).split(',').filter(Boolean) : [];
    ['email', 'sms', 'whatsapp'].forEach(c => {
      if (opts.canaux ? opts.canaux.indexOf(c) < 0 : !tpl[c]) return;
      if (!chanOf_(db, c).actif) return;
      if (prefs.length && prefs.indexOf(c) < 0) return;
      const to = c === 'email' ? String(r.email || '').trim().toLowerCase() : e164_(r.tel, ind);
      if (!to || (c === 'email' && !validEmail_(to))) return;
      const vv = Object.assign({ ecole: st.ecole || '', nom: r.nom || '' }, typeof vars === 'function' ? vars(c) : (vars || {}), r.vars || {});
      out.push({ canal: c, to, nom: r.nom || '', event: ev, sujet: renderTpl_(opts.sujet != null ? opts.sujet : tpl.sujet, vv), texte: renderTpl_(opts.texte != null ? opts.texte : tpl.texte, vv), secrets: opts.secrets || [] });
    });
  });
  return out;
}
function manualLink_(canal, to, texte) {
  if (canal === 'whatsapp') return 'https://wa.me/' + String(to).replace(/\D/g, '') + '?text=' + encodeURIComponent(texte);
  if (canal === 'sms') return 'sms:' + to + '?body=' + encodeURIComponent(texte);
  return '';
}
/* Destinataires (parents) d'un élève : fiche parent + préférences du compte lié. */
function parentRecipients_(db, student) {
  const par = (db.parents || []).find(p => p.id === student.parentId); if (!par) return [];
  const u = (db.users || []).find(x => x.role === 'parent' && x.linkId === par.id);
  return [{ nom: fullName_(par), tel: par.tel, email: par.email || (u && u.email) || '', canaux: u ? u.canaux : '', vars: { parent: fullName_(par) } }];
}

/* ---------- Plans d'envoi (communs au serveur et à la démonstration) ---------- */
function summarize_(rows) {
  const s = { total: rows.length, envoyes: 0, echecs: 0, aEnvoyer: 0, liens: [] };
  rows.forEach(r => {
    if (r.statut === 'Envoyé') s.envoyes++;
    else if (r.statut === 'À envoyer') { s.aEnvoyer++; if (r.lien && s.liens.length < 200) s.liens.push({ id: r.id, nom: r.nom, canal: r.canal, lien: r.lien }); }
    else s.echecs++;
  });
  return s;
}
/* Message envoyé aux parents quand un élève est admis. Le mot de passe provisoire n'y figure que si la direction l'a décidé, et jamais dans un lien manuel. */
function admissionPlan_(db, a) {
  const o = modOpt_(db, 'admissions'), news = (a.comptes || []).filter(x => x.nouveau && x.pwd), secrets = o.envoyerAcces ? news.map(x => x.pwd) : [];
  const acces = canal => {
    if (!o.envoyerAcces || !news.length || (canal !== 'email' && chanOf_(db, canal).fournisseur === 'lien')) return '';
    return news.map(x => (x.role === 'eleve' ? 'Compte élève' : 'Votre compte') + ' : identifiant ' + x.login + ', mot de passe provisoire ' + x.pwd + ' (à changer à la première connexion).').join(' ');
  };
  const tpl = tplOf_(db, 'admission'); if (!tpl || !tpl.actif) return [];
  return planMessages_(db, 'admission', parentRecipients_(db, a.student), canal => ({ eleve: fullName_(a.student), classe: a.classe.nom, admission: a.student.admission, acces: acces(canal) }), { secrets });
}
/* Envoi groupé : parents, une classe, enseignants ou personnel. */
function broadcastPlan_(db, spec) {
  spec = spec || {};
  const canaux = (Array.isArray(spec.canaux) ? spec.canaux : []).filter(x => CHANNEL_DEFS[x]);
  if (!canaux.length) throw new Error('Choisissez au moins un canal.');
  const texte = safe_(spec.texte, 600, true); if (!texte) throw new Error('Écrivez le message.');
  const act = (db.students || []).filter(s => s.statut === 'Actif'), recs = [], seen = {};
  const addParents = list => list.forEach(s => parentRecipients_(db, s).forEach(r => { const k = r.nom + '|' + r.tel; if (!seen[k]) { seen[k] = 1; recs.push(r); } }));
  if (spec.audience === 'parents') addParents(act);
  else if (spec.audience === 'classe') { if (!(db.classes || []).some(c => c.id === spec.classId)) throw new Error('Choisissez une classe.'); addParents(act.filter(s => s.classId === spec.classId)); }
  else if (spec.audience === 'enseignants' || spec.audience === 'personnel') {
    (db.teachers || []).forEach(t => { const u = (db.users || []).find(x => x.role === 'enseignant' && x.linkId === t.id); recs.push({ nom: fullName_(t), tel: t.tel, email: t.email || (u && u.email) || '', canaux: u ? u.canaux : '' }); });
    if (spec.audience === 'personnel') (db.users || []).forEach(u => { if (u.actif && (u.role === 'secretaire' || u.role === 'surveillant')) recs.push({ nom: u.nom, tel: u.tel, email: u.email, canaux: u.canaux }); });
  } else throw new Error('Choisissez les destinataires.');
  return { recs, plan: planMessages_(db, 'diffusion', recs, {}, { canaux, texte, sujet: safe_(spec.sujet, 150) || undefined }) };
}
/* Rappels de mensualité aux parents des élèves qui ont un reste à payer. */
function remindPlan_(db, ids) {
  const tpl = tplOf_(db, 'rappel'), canaux = ['email', 'sms', 'whatsapp'].filter(c => tpl[c]);
  if (!canaux.length) throw new Error('Aucun canal n’est coché pour le message « Rappel de mensualité ». Réglez-le dans « Canaux de communication ».');
  let plan = [];
  (db.students || []).filter(s => s.statut === 'Actif' && (!Array.isArray(ids) || !ids.length || ids.indexOf(s.id) >= 0)).forEach(s => {
    const d = studentDues_(db, s); if (d.reste <= 0) return;
    plan = plan.concat(planMessages_(db, 'rappel', parentRecipients_(db, s), { eleve: fullName_(s), reste: fcfa_(d.reste) }, { canaux }));
  });
  return plan;
}
