/* ===== Scolaria : noyau (constantes, utilitaires, accès aux données, données de démonstration) ===== */
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext, Fragment } = React;
const html = htm.bind(React.createElement);
/* Trois façons d'exécuter l'application :
   - HAS_GOOGLE : la page est servie par Apps Script (google.script.run) ;
   - serveur distant : la page est hébergée ailleurs (Firebase Hosting) et config.js définit window.SCOLARIA_API = adresse /exec du déploiement Apps Script ;
   - démonstration : aucun serveur, données dans le navigateur.
   IN_GAS = « un vrai serveur tient les données » (les deux premiers cas). */
const HAS_GOOGLE = typeof google !== 'undefined' && !!(google.script && google.script.run);
const REMOTE_WANTED = typeof window !== 'undefined' && window.SCOLARIA_API !== undefined;
const REMOTE_URL = REMOTE_WANTED && /^https:\/\/script\.google\.com\/[\w\-./]+\/exec$/.test(String(window.SCOLARIA_API)) ? String(window.SCOLARIA_API) : '';
const IN_GAS = HAS_GOOGLE || REMOTE_WANTED;
/* Une page hébergée sur GitHub Pages ne peut pas envoyer l'en-tête qui interdit de l'afficher dans le cadre d'un autre site (clickjacking) : l'application refuse donc de s'afficher dans un cadre. */
const FRAMED = REMOTE_WANTED && (() => { try { return window.top !== window.self; } catch (e) { return true; } })();

/* Règles communes (registre des modules, droits, inscription, messages) : le même code tourne dans Code.gs */
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

/* ===== Scolaria : registre commun à l'interface et au serveur =====
   Ce fichier est inséré tel quel dans l'interface (build.py) et dans Code.gs.
   Toutes les fonctions finissent par « _ » : côté Google, cela les rend inaccessibles depuis le navigateur. */

const ROLE_IDS = ['admin', 'secretaire', 'surveillant', 'enseignant', 'eleve', 'parent', 'candidat'];
const FAMILY_ROLES = ['eleve', 'parent', 'candidat'];
const ROLE_CODE = { S: 'secretaire', V: 'surveillant', E: 'enseignant', F: 'eleve', P: 'parent', K: 'candidat' };
const MOIS = ['Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
const GROUPS = ['Pilotage', 'Élèves et familles', 'Enseignement', 'Évaluations', 'Personnel', 'Finances', 'Communication', 'Patrimoine', 'Administration', 'Mon compte'];

/* ---------- Registre des modules ----------
   k : clé · l : libellé · g : groupe · i : icône · verbs : droits possibles (v voir, c créer, m modifier, s supprimer)
   table : table principale · also : tables que le module peut aussi créer ou modifier · reads : tables nécessaires à l'affichage
   guard : droit supplémentaire exigé pour lire les tables (plaintes : seuls ceux qui les traitent les lisent)
   el : rôles auxquels le module peut être accordé (plafond de sécurité) · d : droits par défaut
   sys : réservé à la direction, jamais accordable · fixed : accordé à tous, non modifiable · adm : false = la direction n'y accède pas
   custom : le module accepte des champs personnalisés (colonne « extra » de sa table) */
function M_(k, l, g, i, verbs, o) {
  o = o || {};
  const el = (o.el === undefined ? 'S V E' : o.el).split(' ').filter(Boolean).map(c => ROLE_CODE[c]);
  const d = {}; (o.d || '').split(' ').filter(Boolean).forEach(p => { const x = p.split('='); d[ROLE_CODE[x[0]]] = x[1] || ''; });
  return { k, l, g, i, verbs, table: o.table || '', also: o.also || [], reads: o.reads || (o.table ? [o.table] : []), guard: o.guard || '', el, d, sys: !!o.sys, fixed: !!o.fixed, adm: o.adm !== false, custom: !!o.custom };
}
const MODS = [
  M_('dashboard', 'Tableau de bord', 'Pilotage', 'dash', 'v', { reads: ['classes', 'students', 'attendance', 'teachers', 'events'], d: 'S=v V=v E=v' }),
  M_('home', 'Mon espace', 'Pilotage', 'dash', 'v', { adm: false, el: 'F P K', reads: ['classes', 'students', 'attendance', 'marks', 'exams', 'subjects', 'feeStructure', 'payments', 'notices', 'events', 'timetable', 'periods', 'admissions'], d: 'F=v P=v K=v' }),
  M_('reports', 'Rapports de classe', 'Pilotage', 'chart', 'vm', { reads: ['classes', 'students', 'attendance', 'marks', 'exams', 'subjects'], d: 'S=v' }),

  M_('admissions', 'Admissions', 'Élèves et familles', 'clip', 'vcms', { table: 'admissions', reads: ['admissions', 'parents', 'students', 'classes'], custom: true, d: 'S=vcms' }),
  M_('students', 'Élèves', 'Élèves et familles', 'users', 'vcms', { table: 'students', reads: ['students', 'classes', 'parents'], custom: true, d: 'S=vcms V=v E=v' }),
  M_('parents', 'Parents', 'Élèves et familles', 'users', 'vcms', { table: 'parents', also: ['students'], reads: ['parents', 'students', 'classes'], custom: true, d: 'S=vcms V=v' }),
  M_('conduct', 'Conduite', 'Élèves et familles', 'shield', 'vcms', { table: 'conduct', reads: ['conduct', 'students', 'classes'], el: 'S V E F P', custom: true, d: 'S=v V=vcms E=vcms' }),
  M_('activities', 'Activités', 'Élèves et familles', 'award', 'vcms', { table: 'activities', reads: ['activities', 'students', 'classes'], el: 'S V E F P', custom: true, d: 'S=vcms V=vcms E=v' }),
  M_('documents', 'Documents', 'Élèves et familles', 'file', 'vcms', { table: 'documents', reads: ['documents', 'students', 'classes'], el: 'S P', custom: true, d: 'S=vcms' }),
  M_('ptm', 'Rencontres parents', 'Élèves et familles', 'cal', 'vcms', { table: 'ptm', reads: ['ptm', 'teachers', 'students', 'parents', 'classes'], el: 'S V E P', custom: true, d: 'S=vcms E=vcms P=v' }),

  M_('timetable', 'Emploi du temps', 'Enseignement', 'clock', 'vcms', { table: 'timetable', also: ['periods'], reads: ['timetable', 'periods', 'classes', 'subjects', 'teachers', 'assignments'], el: 'S V E F P', d: 'S=vcms V=v E=v F=v P=v' }),
  M_('classes', 'Classes', 'Enseignement', 'school', 'vcms', { table: 'classes', reads: ['classes', 'teachers', 'students'], custom: true, d: 'S=vcms V=v E=v' }),
  M_('subjects', 'Matières', 'Enseignement', 'book', 'vcms', { table: 'subjects', custom: true, d: 'S=v V=v E=v' }),
  M_('assignments', 'Affectations', 'Enseignement', 'swap', 'vcms', { table: 'assignments', reads: ['assignments', 'classes', 'subjects', 'teachers'], custom: true, d: 'S=vcms E=v' }),
  M_('lessons', 'Plan de cours', 'Enseignement', 'book', 'vcms', { table: 'lessons', reads: ['lessons', 'classes', 'subjects', 'teachers'], el: 'S V E F P', custom: true, d: 'E=vcms' }),
  M_('logbook', 'Cahier de textes', 'Enseignement', 'book', 'vcms', { table: 'logbook', reads: ['logbook', 'classes', 'subjects', 'teachers'], el: 'S V E F P', custom: true, d: 'S=v V=v E=vcms' }),
  M_('substitutes', 'Remplacements', 'Enseignement', 'swap', 'vcms', { table: 'substitutes', reads: ['substitutes', 'teachers', 'classes', 'periods'], custom: true, d: 'S=vcms V=vcms E=v' }),

  M_('attendance', 'Présences', 'Évaluations', 'check', 'vcms', { table: 'attendance', reads: ['attendance', 'classes', 'students'], d: 'S=v V=vcms E=vcms' }),
  M_('exams', 'Examens', 'Évaluations', 'clip', 'vcms', { table: 'exams', reads: ['exams', 'classes', 'subjects'], custom: true, d: 'S=vcms E=v' }),
  M_('marks', 'Notes', 'Évaluations', 'edit', 'vcms', { table: 'marks', reads: ['marks', 'exams', 'students', 'classes', 'subjects', 'assignments'], d: 'E=vcms' }),
  M_('results', 'Résultats', 'Évaluations', 'chart', 'v', { reads: ['marks', 'exams', 'students', 'classes', 'subjects'], el: 'S V E F P', d: 'S=v V=v E=v F=v P=v' }),
  M_('halltickets', 'Convocations', 'Évaluations', 'file', 'v', { reads: ['exams', 'students', 'classes', 'subjects'], d: 'S=v' }),

  M_('teachers', 'Enseignants', 'Personnel', 'user', 'vcms', { table: 'teachers', custom: true, d: 'S=vcms' }),

  M_('payments', 'Encaissement', 'Finances', 'receipt', 'vcms', { table: 'payments', reads: ['payments', 'students', 'feeStructure', 'classes'], el: 'S', custom: true, d: 'S=vcms' }),
  M_('dues', 'Mensualités', 'Finances', 'cash', 'v', { reads: ['payments', 'students', 'feeStructure', 'classes'], el: 'S P', d: 'S=v P=v' }),
  M_('cash', 'Caisse du jour', 'Finances', 'cash', 'v', { reads: ['payments', 'students', 'classes'], el: 'S', d: 'S=v' }),
  M_('feeStructure', 'Frais de scolarité', 'Finances', 'sliders', 'vcms', { table: 'feeStructure', reads: ['feeStructure', 'classes'], el: 'S', custom: true, d: 'S=v' }),

  M_('notices', 'Avis', 'Communication', 'bell', 'vcms', { table: 'notices', el: 'S V E F P K', custom: true, d: 'S=vcms V=v E=v F=v P=v K=v' }),
  M_('events', 'Calendrier', 'Communication', 'cal', 'vcms', { table: 'events', el: 'S V E F P K', custom: true, d: 'S=vcms V=v E=v F=v P=v K=v' }),
  M_('messages', 'Envoyer un message', 'Communication', 'send', 'vc', { reads: ['channels', 'templates', 'classes', 'students', 'parents', 'teachers'], d: 'S=vc' }),
  M_('outbox', 'Journal des envois', 'Communication', 'mail', 'vms', { table: 'outbox', d: 'S=vm' }),
  M_('complaints', 'Plaintes anonymes', 'Communication', 'shield', 'vcms', { table: 'complaints', guard: 'm', el: 'S V E F P', d: 'S=v V=v E=v F=v P=v' }),
  M_('tickets', 'Assistance', 'Communication', 'help', 'vcms', { table: 'tickets', custom: true, d: 'S=vcms V=vcms E=vcms' }),

  M_('assets', 'Équipements', 'Patrimoine', 'tool', 'vcms', { table: 'assets', also: ['maintenance'], reads: ['assets', 'maintenance'], custom: true, d: 'S=vcms' }),
  M_('maintenance', 'Maintenance', 'Patrimoine', 'tool', 'vcms', { table: 'maintenance', reads: ['maintenance', 'assets'], custom: true, d: 'S=vcms' }),
  M_('stock', 'Stock', 'Patrimoine', 'box', 'vcms', { table: 'stock', also: ['stockTx'], reads: ['stock', 'stockTx'], custom: true, d: 'S=vcms' }),
  M_('stockTx', 'Mouvements', 'Patrimoine', 'swap', 'vcms', { table: 'stockTx', reads: ['stockTx', 'stock'], custom: true, d: 'S=vcms' }),

  M_('users', 'Utilisateurs et rôles', 'Administration', 'shield', 'vcms', { table: 'users', sys: true, el: '' }),
  M_('settings', 'Paramètres', 'Administration', 'sliders', 'vm', { table: 'settings', sys: true, el: '' }),
  M_('modules', 'Modules', 'Administration', 'sliders', 'vcms', { table: 'modules', sys: true, el: '' }),
  M_('perms', 'Autorisations', 'Administration', 'shield', 'vcms', { table: 'perms', sys: true, el: '' }),
  M_('channels', 'Canaux de communication', 'Administration', 'send', 'vcms', { table: 'channels', also: ['templates'], reads: ['channels', 'templates'], sys: true, el: '' }),
  M_('audit', 'Journal d’audit', 'Administration', 'shield', 'v', { table: 'audit', sys: true, el: '' }),

  M_('profile', 'Mon profil', 'Mon compte', 'user', 'vm', { fixed: true, el: 'S V E F P K' })
];
const MOD_BY_KEY = {}; MODS.forEach(m => { MOD_BY_KEY[m.k] = m; });
const ALWAYS_READ = ['settings', 'modules'];   /* lisibles par tout compte connecté, sans données sensibles */

/* ---------- Droits effectifs ---------- */
function normRights_(m, s) {
  s = String(s || ''); let r = '';
  'vcms'.split('').forEach(c => { if (s.indexOf(c) >= 0 && m.verbs.indexOf(c) >= 0) r += c; });
  return r.indexOf('v') < 0 ? '' : r;
}
function modActive_(k, modules) {
  const m = MOD_BY_KEY[k]; if (!m) return false; if (m.sys || m.fixed) return true;
  const row = (modules || []).find(x => x.id === k); return !row || row.actif !== false;
}
function defRights_(role, k) {
  const m = MOD_BY_KEY[k]; if (!m) return '';
  if (role === 'admin') return m.adm ? m.verbs : '';
  return normRights_(m, m.d[role] || '');
}
/* Droits d'un rôle sur un module : plafond de sécurité (el), réglage de la matrice (perms), module désactivé (modules). */
function rights_(role, k, perms, modules) {
  const m = MOD_BY_KEY[k]; if (!m || !modActive_(k, modules)) return '';
  if (role === 'admin') return m.adm ? m.verbs : '';
  if (m.sys) return '';
  if (m.fixed) return m.verbs;
  if (m.el.indexOf(role) < 0) return '';
  const ov = (perms || []).find(p => p.role === role && p.module === k);
  return normRights_(m, ov ? ov.droits : defRights_(role, k));
}

/* ---------- Listes de choix modifiables ---------- */
const LIST_DEFS = {
  'payments.mode': { mod: 'payments', l: 'Modes de paiement', def: ['Espèces', 'Wave', 'Orange Money', 'Virement', 'Chèque'] },
  'classes.niveau': { mod: 'classes', l: 'Niveaux d’études', def: ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'] },
  'parents.lien': { mod: 'parents', l: 'Liens de parenté', def: ['Père', 'Mère', 'Tuteur', 'Tutrice'] },
  'teachers.statut': { mod: 'teachers', l: 'Statuts du personnel enseignant', def: ['Permanent', 'Vacataire'] },
  'exams.type': { mod: 'exams', l: 'Types d’épreuves', def: ['Devoir', 'Composition', 'Examen blanc', 'Examen final'] },
  'documents.type': { mod: 'documents', l: 'Types de pièces', def: ['Acte de naissance', 'Certificat médical', 'Bulletin précédent', 'Pièce d’identité du tuteur', 'Certificat de scolarité', 'Autorisation parentale'] },
  'activities.categorie': { mod: 'activities', l: 'Catégories d’activités', def: ['Sport', 'Culture', 'Club', 'Concours', 'Bénévolat'] },
  'events.categorie': { mod: 'events', l: 'Catégories d’événements', def: ['Examen', 'Réunion', 'Fête', 'Vacances', 'Autre'] },
  'assets.categorie': { mod: 'assets', l: 'Catégories d’équipements', def: ['Informatique', 'Bureautique', 'Mobilier', 'Énergie', 'Transport', 'Sport', 'Autre'] },
  'stock.categorie': { mod: 'stock', l: 'Catégories d’articles', def: ['Fournitures', 'Bureautique', 'Entretien', 'Sport', 'Autre'] },
  'complaints.categorie': { mod: 'complaints', l: 'Catégories de plaintes', def: ['Cantine', 'Discipline', 'Enseignement', 'Sécurité', 'Transport', 'Autre'] }
};

/* ---------- Options propres à certains modules ---------- */
const OPTION_DEFS = {
  admissions: [
    { k: 'public', t: 'bool', l: 'Inscription en ligne ouverte, sans connexion', def: true },
    { k: 'mode', t: 'select', l: 'Validation des inscriptions', o: [['validation', 'Par le secrétariat (recommandé)'], ['auto', 'Automatique : admission immédiate si la classe a de la place']], def: 'validation' },
    { k: 'maxParHeure', t: 'num', l: 'Inscriptions acceptées par heure (anti-abus)', def: 20, min: 1, max: 200 },
    { k: 'creerComptes', t: 'bool', l: 'Créer automatiquement les comptes parent et élève à l’admission', def: true },
    { k: 'compteEleve', t: 'bool', l: 'Créer aussi un compte pour l’élève', def: true },
    { k: 'envoyerAcces', t: 'bool', l: 'Envoyer par message le mot de passe provisoire de l’élève au parent', def: false },
    { k: 'consentement', t: 'text', l: 'Texte de consentement du formulaire', def: 'J’accepte que ces informations soient utilisées par l’école pour traiter cette inscription.' }
  ]
};

/* ---------- Canaux et messages automatiques ---------- */
const CHANNEL_DEFS = {
  email: { l: 'E-mail', providers: [['gmail', 'Gmail (compte Google de l’école)']], def: { actif: true, fournisseur: 'gmail' }, secrets: {} },
  sms: { l: 'SMS', providers: [['lien', 'Lien SMS : envoi manuel depuis un téléphone'], ['twilio', 'Twilio'], ['webhook', 'Passerelle personnalisée (webhook)']], def: { actif: false, fournisseur: 'lien' }, secrets: { twilio: ['sid', 'token'], webhook: ['url', 'secret'] } },
  whatsapp: { l: 'WhatsApp', providers: [['lien', 'Lien WhatsApp : envoi manuel (gratuit)'], ['twilio', 'Twilio WhatsApp'], ['webhook', 'Passerelle personnalisée (webhook)']], def: { actif: false, fournisseur: 'lien' }, secrets: { twilio: ['sid', 'token'], webhook: ['url', 'secret'] } }
};
const SECRET_LABELS = { sid: 'Account SID', token: 'Auth Token', url: 'Adresse de la passerelle (URL)', secret: 'Secret partagé (facultatif)' };
const EVENTS = {
  inscription_recue: { l: 'Inscription reçue', vars: 'parent, eleve, ref, identifiant, ecole', def: { actif: true, email: true, sms: false, whatsapp: true, sujet: 'Inscription reçue — {ecole}', texte: 'Bonjour {parent}, la demande d’inscription de {eleve} à {ecole} est bien reçue (dossier {ref}). Connectez-vous avec l’identifiant {identifiant} pour suivre son état.' } },
  admission: { l: 'Élève admis', vars: 'parent, eleve, classe, admission, acces, ecole', def: { actif: true, email: true, sms: false, whatsapp: true, sujet: '{eleve} est admis(e) — {ecole}', texte: 'Bonne nouvelle : {eleve} est admis(e) en {classe} à {ecole}. N° d’admission : {admission}. Vous pouvez désormais consulter son dossier avec votre compte. {acces}' } },
  paiement: { l: 'Paiement reçu', vars: 'parent, eleve, montant, nature, recu, ecole', def: { actif: false, email: false, sms: false, whatsapp: true, sujet: 'Reçu {recu} — {ecole}', texte: '{ecole} : paiement de {montant} reçu pour {eleve} ({nature}). Reçu n° {recu}. Merci.' } },
  absence: { l: 'Absence signalée', vars: 'parent, eleve, date, ecole', def: { actif: false, email: false, sms: true, whatsapp: true, sujet: 'Absence de {eleve} — {ecole}', texte: '{ecole} : {eleve} a été signalé(e) absent(e) le {date}. Merci de prendre contact avec l’école si besoin.' } },
  rappel: { l: 'Rappel de mensualité', vars: 'parent, eleve, reste, ecole', def: { actif: false, email: true, sms: true, whatsapp: true, sujet: 'Scolarité de {eleve} — {ecole}', texte: '{ecole} : il reste {reste} à régler pour la scolarité de {eleve}. Merci de passer au secrétariat ou de payer par Wave ou Orange Money.' } },
  diffusion: { l: 'Message libre', vars: 'nom, ecole', hidden: true, def: { actif: true, email: true, sms: true, whatsapp: true, sujet: 'Message de {ecole}', texte: '' } }
};


/* Schéma unique : injecté à la construction, partagé avec Code.gs */
const SCHEMA = {"settings": "id,ecole,adresse,tel,email,annee,devise,noteMax:n,notePassage:n,responsable,slogan,indicatif", "classes": "id,nom,niveau,section,titulaireId,effectifMax:n,salle,extra", "subjects": "id,nom,code,coef:n,extra", "teachers": "id,matricule,nom,prenom,sexe,tel,email,specialite,statut,embauche,extra", "assignments": "id,teacherId,subjectId,classId,heures:n,extra", "students": "id,admission,nom,prenom,sexe,naissance,classId,parentId,tel,adresse,statut,nin,extra", "parents": "id,nom,prenom,lien,tel,email,profession,adresse,extra", "admissions": "id,date,nom,prenom,sexe,naissance,classId,parentPrenom,parentNom,parentTel,lien,statut,remarque,studentId,parentEmail,userId,ref,source,extra", "users": "id,email,nom,role,linkId,tel,actif:b,hash,salt,login,mustChange:b,source,canaux", "periods": "id,ordre:n,label,debut,fin,pause:b", "timetable": "id,classId,jour:n,periodId,subjectId,teacherId,salle", "attendance": "id,date,classId,studentId,statut,note", "exams": "id,session,type,classId,subjectId,date,heure,duree:n,salle,noteMax:n,trimestre,extra", "marks": "id,examId,studentId,note:n,abs:b", "lessons": "id,teacherId,classId,subjectId,titre,objectifs,date,duree:n,statut,extra", "logbook": "id,date,teacherId,classId,subjectId,contenu,devoirs,extra", "conduct": "id,studentId,date,type,gravite,description,signalePar,extra", "activities": "id,studentId,activite,categorie,date,resultat,extra", "ptm": "id,date,heure,teacherId,statut,parentId,studentId,motif,extra", "substitutes": "id,date,absentId,substituteId,classId,periodId,motif,extra", "notices": "id,titre,contenu,date,cible,epingle:b,auteur,extra", "events": "id,titre,date,fin,categorie,lieu,extra", "complaints": "id,date,categorie,message,statut,reponse", "tickets": "id,cree,titre,description,priorite,statut,assigneId,creePar,extra", "documents": "id,titre,type,studentId,fichier,verifie:b,expiration,extra", "assets": "id,tag,nom,categorie,lieu,achat,valeur:n,etat,responsable,extra", "maintenance": "id,assetId,date,type,description,cout:n,technicien,extra", "stock": "id,code,nom,categorie,unite,initial:n,seuil:n,prix:n,extra", "stockTx": "id,itemId,date,type,quantite:n,motif,extra", "feeStructure": "id,classId,inscription:n,mensualite:n,transport:n,cantine:n,extra", "payments": "id,date,studentId,type,mois,montant:n,mode,recu,caissier,remarque,extra", "audit": "id,at,user,action,table,rowId,detail", "modules": "id,label,sub,actif:b,ordre:n,champs,listes,options", "perms": "id,role,module,droits", "channels": "id,actif:b,fournisseur,expediteur,options", "templates": "id,actif:b,email:b,sms:b,whatsapp:b,sujet,texte", "outbox": "id,at,canal,fournisseur,to,nom,event,statut,detail,texte,lien"};
const TYPES = {};
Object.keys(SCHEMA).forEach(t => {
  TYPES[t] = {};
  SCHEMA[t].split(',').forEach(c => { const p = c.split(':'); TYPES[t][p[0]] = p[1] || 's'; });
});
function normRow(t, r) {
  const o = {}, ty = TYPES[t];
  for (const k in ty) {
    let v = r[k]; if (v === undefined || v === null) v = '';
    if (ty[k] === 'n') { v = v === '' ? '' : Number(v); if (Number.isNaN(v)) v = ''; }
    else if (ty[k] === 'b') v = (v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1');
    else v = String(v);
    o[k] = v;
  }
  return o;
}

/* ---------- Utilitaires ---------- */
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n, l = 3) => String(n).padStart(l, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const dow = s => new Date(s + 'T12:00:00').getDay();           // 0 = dimanche
const fmtDate = s => s ? s.split('-').reverse().join('/') : '';
const fmtLong = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtDT = iso => { if (!iso) return ''; const d = new Date(iso); return fmtDate(ymd(d)) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2); };
const num = n => (Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const money = n => num(n) + ' F';
const dec = (n, d = 2) => (Number(n)).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const fullName = p => p ? (p.prenom + ' ' + p.nom).trim() : '—';
const byName = (a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr');
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const ROLES = [['admin', 'Direction'], ['secretaire', 'Secrétariat'], ['enseignant', 'Enseignant'], ['surveillant', 'Surveillant général'], ['eleve', 'Élève'], ['parent', 'Parent'], ['candidat', 'Famille candidate']];
const ROLE_LABEL = Object.fromEntries(ROLES);

/* Barème en 7 mentions, notes sur 20 */
const MENTIONS = [[18, 'Excellent', 'ok'], [16, 'Très bien', 'ok'], [14, 'Bien', 'ok'], [12, 'Assez bien', 'info'], [10, 'Passable', 'warn'], [8, 'Insuffisant', 'bad'], [0, 'Très faible', 'bad']];
const mention = n20 => MENTIONS.find(m => n20 >= m[0]) || MENTIONS[MENTIONS.length - 1];

/* Montant en lettres (reçus) */
function enLettres(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zéro';
  const U = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  const b100 = (x, fin) => {
    if (x < 20) return U[x];
    if (x < 70) { const d = Math.floor(x / 10), u = x % 10; return T[d] + (u === 1 ? ' et un' : u ? '-' + U[u] : ''); }
    if (x < 80) { const u = x - 60; return 'soixante' + (u === 11 ? ' et onze' : '-' + U[u]); }
    const u = x - 80;
    return u === 0 ? 'quatre-vingt' + (fin ? 's' : '') : 'quatre-vingt-' + U[u];
  };
  const b1000 = (x, fin) => {
    const c = Math.floor(x / 100), r = x % 100; let s = '';
    if (c > 0) { s = c === 1 ? 'cent' : U[c] + ' cent'; if (r === 0 && c > 1 && fin) s += 's'; }
    if (r > 0) s += (s ? ' ' : '') + b100(r, fin);
    return s;
  };
  const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000, parts = [];
  if (mil) parts.push(b1000(mil, true) + ' million' + (mil > 1 ? 's' : ''));
  if (th) parts.push(th === 1 ? 'mille' : b1000(th, false) + ' mille');
  if (rest) parts.push(b1000(rest, true));
  return parts.join(' ');
}

/* ---------- Libellés des références ---------- */
const clsName = (db, id) => { const c = db.classes.find(x => x.id === id); return c ? c.nom : '—'; };
const LABEL = {
  classes: c => c.nom,
  subjects: s => s.nom,
  teachers: t => fullName(t),
  parents: p => fullName(p),
  students: (s, db) => fullName(s) + (db ? ' · ' + clsName(db, s.classId) : ''),
  periods: p => p.label + ' (' + p.debut + '–' + p.fin + ')',
  assets: a => a.tag + ' · ' + a.nom,
  stock: s => s.nom,
  users: u => u.nom,
  exams: (e, db) => clsName(db, e.classId) + ' · ' + ((db.subjects.find(s => s.id === e.subjectId) || {}).nom || '?') + ' · ' + e.session
};
const refLabel = (db, t, id) => { if (!id) return '—'; const r = db[t].find(x => x.id === id); return r ? LABEL[t](r, db) : '—'; };

/* ---------- Mensualités et impayés (règle commune, voir shared/logic.js) ---------- */
const monthsElapsed = monthsElapsed_, studentDues = studentDues_;

/* ---------- Données de démonstration (stables, générées à partir d'une graine) ---------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function buildSeed() {
  const R = rng(20261021), rnd = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
  let n = 0; const id = p => p + (++n);
  const db = {}; Object.keys(SCHEMA).forEach(t => { db[t] = []; });
  const now = new Date(), T = todayStr(), mo = now.getMonth() + 1;
  const startY = mo >= 9 ? now.getFullYear() : now.getFullYear() - 1, annee = startY + '-' + (startY + 1);
  const wk = (d, step) => { while (dow(d) === 0 || dow(d) === 6) d = addDays(d, step); return d; };

  db.settings.push({ id: 'main', ecole: 'Complexe scolaire Les Baobabs', adresse: 'Avenue Léopold Sédar Senghor, Dakar', tel: '33 000 00 00', email: 'contact@lesbaobabs.example', annee, devise: 'FCFA', noteMax: 20, notePassage: 10, responsable: 'Seydou Mbaye', slogan: 'Apprendre, grandir, réussir', indicatif: '221' });

  const SUB = [['Français', 'FR', 3, 5], ['Mathématiques', 'MATH', 3, 4], ['Anglais', 'ANG', 2, 3], ['Histoire-Géographie', 'HG', 2, 3], ['SVT', 'SVT', 2, 2], ['Physique-Chimie', 'PC', 2, 2], ['EPS', 'EPS', 1, 2]];
  SUB.forEach(s => db.subjects.push({ id: id('mat'), nom: s[0], code: s[1], coef: s[2] }));
  const TE = [['Moussa', 'Ndiaye', 'M', 'Mathématiques'], ['Awa', 'Diop', 'F', 'Français'], ['Ibrahima', 'Fall', 'M', 'Anglais'], ['Fatou', 'Sarr', 'F', 'Histoire-Géographie'], ['Ousmane', 'Gueye', 'M', 'SVT'], ['Mariama', 'Ba', 'F', 'Physique-Chimie'], ['Pape', 'Diouf', 'M', 'EPS'], ['Aminata', 'Sy', 'F', 'Français']];
  TE.forEach((t, i) => db.teachers.push({ id: id('ens'), matricule: 'ENS-' + pad(i + 1), nom: t[1], prenom: t[0], sexe: t[2], tel: '77 ' + pad(rnd(100, 999)) + ' ' + pad(rnd(10, 99), 2) + ' ' + pad(rnd(10, 99), 2), email: (t[0] + '.' + t[1]).toLowerCase() + '@lesbaobabs.example', specialite: t[3], statut: i < 6 ? 'Permanent' : 'Vacataire', embauche: (startY - rnd(1, 8)) + '-09-15' }));
  const CL = [['6ème A', '6ème', 'A', 'Salle 1', 1], ['6ème B', '6ème', 'B', 'Salle 2', 0], ['5ème A', '5ème', 'A', 'Salle 3', 3], ['4ème A', '4ème', 'A', 'Salle 4', 2], ['3ème A', '3ème', 'A', 'Salle 5', 5]];
  CL.forEach(c => db.classes.push({ id: id('cl'), nom: c[0], niveau: c[1], section: c[2], titulaireId: db.teachers[c[4]].id, effectifMax: 40, salle: c[3] }));
  const teacherFor = (ci, si) => { const sub = SUB[si][0]; if (sub === 'Français') return db.teachers[ci < 3 ? 1 : 7]; return db.teachers.find(t => t.specialite === sub); };
  db.classes.forEach((c, ci) => db.subjects.forEach((s, si) => db.assignments.push({ id: id('aff'), teacherId: teacherFor(ci, si).id, subjectId: s.id, classId: c.id, heures: SUB[si][3] })));
  [[35000, 22000], [35000, 22000], [35000, 23000], [40000, 25000], [45000, 28000]].forEach((f, i) => db.feeStructure.push({ id: id('frais'), classId: db.classes[i].id, inscription: f[0], mensualite: f[1], transport: 12000, cantine: 15000 }));

  const PER = [['Cours 1', '08:00', '09:00', 0], ['Cours 2', '09:00', '10:00', 0], ['Récréation', '10:00', '10:30', 1], ['Cours 3', '10:30', '11:30', 0], ['Cours 4', '11:30', '12:30', 0], ['Cours 5', '15:00', '16:00', 0], ['Cours 6', '16:00', '17:00', 0]];
  PER.forEach((p, i) => db.periods.push({ id: id('per'), ordre: i + 1, label: p[0], debut: p[1], fin: p[2], pause: !!p[3] }));
  const teach = db.periods.filter(p => !p.pause), busy = new Set();
  db.classes.forEach((c, ci) => {
    const slots = []; for (let j = 1; j <= 5; j++) teach.forEach(p => slots.push([j, p]));
    for (let i = slots.length - 1; i > 0; i--) { const k = Math.floor(R() * (i + 1)); [slots[i], slots[k]] = [slots[k], slots[i]]; }
    const needs = []; db.assignments.filter(a => a.classId === c.id).forEach(a => { for (let i = 0; i < a.heures; i++) needs.push(a); });
    const used = new Set();
    needs.forEach(a => {
      const sl = slots.find(([j, p]) => !used.has(j + '|' + p.id) && !busy.has(a.teacherId + '|' + j + '|' + p.id)); if (!sl) return;
      used.add(sl[0] + '|' + sl[1].id); busy.add(a.teacherId + '|' + sl[0] + '|' + sl[1].id);
      db.timetable.push({ id: id('edt'), classId: c.id, jour: sl[0], periodId: sl[1].id, subjectId: a.subjectId, teacherId: a.teacherId, salle: c.salle });
    });
  });

  const PH = ['Mamadou', 'Ibrahima', 'Moussa', 'Abdoulaye', 'Ousmane', 'Modou', 'Pape', 'Serigne', 'Lamine', 'Babacar', 'Alioune', 'Mbaye', 'Idrissa', 'Samba', 'Boubacar'];
  const PF = ['Fatou', 'Awa', 'Aminata', 'Mariama', 'Khady', 'Ndèye', 'Aïssatou', 'Rokhaya', 'Astou', 'Coumba', 'Sokhna', 'Binta', 'Marième', 'Dior', 'Adja'];
  const NOMS = ['Ndiaye', 'Diop', 'Fall', 'Sow', 'Ba', 'Sarr', 'Gueye', 'Diallo', 'Faye', 'Seck', 'Mbaye', 'Cissé', 'Thiam', 'Sy', 'Kane', 'Niang', 'Diouf', 'Wade', 'Camara', 'Touré'];
  const PP = [['Abdoulaye', 'Père'], ['Fatou', 'Mère'], ['Modou', 'Père'], ['Aïssatou', 'Mère'], ['Ibou', 'Père'], ['Ndèye Fatou', 'Mère'], ['Lamine', 'Père'], ['Coumba', 'Mère'], ['Alioune', 'Père'], ['Marième', 'Mère'], ['Babacar', 'Père'], ['Rokhaya', 'Mère'], ['Cheikh', 'Père'], ['Astou', 'Mère'], ['Samba', 'Père'], ['Khady', 'Mère'], ['Mor', 'Père'], ['Dior', 'Mère'], ['Pape Samba', 'Père'], ['Sokhna', 'Mère'], ['Oumar', 'Tuteur'], ['Binta', 'Tutrice']];
  const PRO = ['Commerçant', 'Enseignante', 'Chauffeur', 'Infirmière', 'Comptable', 'Couturière', 'Ingénieur', 'Mécanicien', 'Fonctionnaire', 'Agent de banque'];
  const QUART = ['Médina', 'Grand-Yoff', 'Parcelles Assainies', 'Pikine', 'Guédiawaye', 'Liberté 6', 'Ouakam', 'Yoff', 'Mermoz'];
  PP.forEach((p, i) => db.parents.push({ id: id('par'), nom: NOMS[i % 20], prenom: p[0], lien: p[1], tel: '77 ' + pad(rnd(100, 999)) + ' ' + pad(rnd(10, 99), 2) + ' ' + pad(rnd(10, 99), 2), email: '', profession: pick(PRO), adresse: pick(QUART) }));
  for (let i = 0; i < 30; i++) {
    const ci = [8, 15, 21, 26, 30].findIndex(b => i < b), lvl = [0, 0, 1, 2, 3][ci], sexe = i % 2 ? 'F' : 'M', fam = db.parents[i < 22 ? i : rnd(0, 21)];
    db.students.push({ id: id('el'), admission: 'ADM-' + startY + '-' + pad(i + 1), nom: fam.nom, prenom: sexe === 'M' ? PH[(i * 7) % PH.length] : PF[(i * 5) % PF.length], sexe, naissance: (startY - 11 - lvl - rnd(0, 1)) + '-' + pad(rnd(1, 12), 2) + '-' + pad(rnd(1, 28), 2), classId: db.classes[ci].id, parentId: fam.id, tel: fam.tel, adresse: fam.adresse, statut: 'Actif', nin: '' });
  }
  const actives = db.students;

  /* présences : 10 derniers jours ouvrés */
  const days = []; for (let d = T; days.length < 10; d = addDays(d, -1)) if (dow(d) !== 0 && dow(d) !== 6) days.push(d);
  days.forEach(d => actives.forEach(s => { const r = R(); db.attendance.push({ id: id('pre'), date: d, classId: s.classId, studentId: s.id, statut: r < .92 ? 'Présent' : r < .95 ? 'Absent' : r < .98 ? 'Retard' : 'Excusé', note: '' }); }));

  /* examens et notes */
  const ab = {}; actives.forEach(s => { ab[s.id] = 8 + R() * 8; });
  db.classes.forEach(c => db.subjects.forEach((s, si) => {
    const sa = db.assignments.find(a => a.classId === c.id && a.subjectId === s.id);
    const e1 = { id: id('exa'), session: 'Devoir 1 – T1', type: 'Devoir', classId: c.id, subjectId: s.id, date: wk(addDays(T, -rnd(4, 14)), -1), heure: pick(['08:00', '10:30', '15:00']), duree: 60, salle: c.salle, noteMax: 20, trimestre: 'T1' };
    db.exams.push(e1);
    actives.filter(st => st.classId === c.id).forEach(st => {
      const abs = R() < .02, raw = Math.round((ab[st.id] + (R() - .5) * 8) * 2) / 2;
      db.marks.push({ id: id('not'), examId: e1.id, studentId: st.id, note: abs ? '' : Math.max(0, Math.min(20, raw)), abs });
    });
    db.exams.push({ id: id('exa'), session: 'Composition 1 – T1', type: 'Composition', classId: c.id, subjectId: s.id, date: wk(addDays(T, 10 + si * 1 + (c.id === db.classes[0].id ? 0 : 0)), 1), heure: pick(['08:00', '10:30', '15:00']), duree: 120, salle: c.salle, noteMax: 20, trimestre: 'T1' });
  }));

  /* finances */
  const cnt = monthsElapsed(); let rec = 0;
  const payDate = (monthIdx) => { const calMonth = ((9 + monthIdx) % 12) + 1, y = calMonth >= 10 ? startY : startY + 1; let d = y + '-' + pad(calMonth, 2) + '-' + pad(rnd(2, 20), 2); return d > T ? T : d; };
  const MODES = ['Espèces', 'Wave', 'Orange Money', 'Wave', 'Espèces', 'Virement'];
  actives.forEach((s, si) => {
    const fee = db.feeStructure.find(f => f.classId === s.classId);
    const add = (date, type, mois, montant) => db.payments.push({ id: id('pay'), date, studentId: s.id, type, mois, montant, mode: pick(MODES), recu: 'REC-' + startY + '-' + pad(++rec, 4), caissier: 'Khady Thiam', remarque: '' });
    if (R() < .93) add(startY + '-09-' + pad(rnd(10, 28), 2), 'Inscription', '', fee.inscription);
    for (let i = 0; i < cnt; i++) { const r = R(); if (r < .8) add(payDate(i), 'Mensualité', MOIS[i], fee.mensualite); else if (r < .88) add(payDate(i), 'Mensualité', MOIS[i], Math.round(fee.mensualite / 2)); }
    if (si % 4 === 0) add(payDate(0), 'Cantine', MOIS[0], fee.cantine);
    if (si % 5 === 1) add(payDate(0), 'Transport', MOIS[0], fee.transport);
  });
  db.payments.sort((a, b) => a.date.localeCompare(b.date)).forEach((p, i) => { p.recu = 'REC-' + startY + '-' + pad(i + 1, 4); });

  /* utilisateurs : l'identifiant de connexion est l'adresse e-mail, le téléphone ou le n° d'admission */
  const U = (idu, email, nom, role, linkId, tel, extra) => Object.assign({ id: idu, email, nom, role, linkId, tel, actif: true, login: loginKey_(email || tel), mustChange: false, source: 'manuel', canaux: '' }, extra || {});
  db.users.push(
    U('u-admin', 'directeur@lesbaobabs.example', 'Seydou Mbaye', 'admin', '', '77 000 00 01'),
    U('u-sec', 'secretariat@lesbaobabs.example', 'Khady Thiam', 'secretaire', '', '77 000 00 02'),
    U('u-ens', db.teachers[0].email, fullName(db.teachers[0]), 'enseignant', db.teachers[0].id, db.teachers[0].tel),
    U('u-sur', 'surveillance@lesbaobabs.example', 'Idrissa Camara', 'surveillant', '', '77 000 00 03'),
    U('u-eleve', 'eleve@lesbaobabs.example', fullName(db.students[0]), 'eleve', db.students[0].id, ''),
    U('u-parent', 'parent@lesbaobabs.example', fullName(db.parents[0]), 'parent', db.parents[0].id, db.parents[0].tel, { canaux: 'email,whatsapp' }),
    U('u-cand', 'mame.sow@example.com', 'Mame Sow', 'candidat', '', '77 120 45 67', { source: 'inscription', canaux: 'whatsapp' }));

  /* admissions : la première vient d'une famille qui s'est inscrite en ligne (compte « candidat ») */
  [['Khadija', 'Sow', 'F', 'Mame', 'Sow', '77 120 45 67', 'Mère', 'En attente'], ['Pathé', 'Ndoye', 'M', 'Ablaye', 'Ndoye', '76 330 12 90', 'Père', 'En attente'], ['Yacine', 'Gomis', 'F', 'Rama', 'Gomis', '78 410 22 31', 'Mère', 'Refusé']].forEach((a, i) =>
    db.admissions.push({ id: id('adm'), date: addDays(T, -3 - i * 2), nom: a[1], prenom: a[0], sexe: a[2], naissance: (startY - 11) + '-0' + (i + 3) + '-12', classId: db.classes[0].id, parentPrenom: a[3], parentNom: a[4], parentTel: a[5], lien: a[6], statut: a[7], remarque: a[7] === 'Refusé' ? 'Effectif complet' : '', studentId: '', parentEmail: i === 0 ? 'mame.sow@example.com' : '', userId: i === 0 ? 'u-cand' : '', ref: 'INS-' + startY + '-' + pad(i + 1, 4), source: i === 0 ? 'en ligne' : 'secrétariat', extra: '' }));

  /* vie scolaire */
  db.notices.push(
    { id: id('avis'), titre: 'Réunion des parents d’élèves', contenu: 'Une réunion générale se tiendra à l’école. La présence d’au moins un parent par élève est demandée.', date: addDays(T, -1), cible: 'Tous', epingle: true, auteur: 'Direction' },
    { id: id('avis'), titre: 'Calendrier des compositions du 1er trimestre', contenu: 'Les convocations individuelles sont disponibles au secrétariat. Les élèves doivent se présenter 15 minutes avant l’épreuve.', date: addDays(T, -4), cible: 'Élèves', epingle: false, auteur: 'Direction' },
    { id: id('avis'), titre: 'Remise des cahiers de textes', contenu: 'Les enseignants remettent leur cahier de textes à jour au secrétariat avant la fin de la semaine.', date: addDays(T, -6), cible: 'Enseignants', epingle: false, auteur: 'Direction' });
  [['Réunion des parents d’élèves', 9, 9, 'Réunion', 'Cour de l’école'], ['Compositions du 1er trimestre', 10, 16, 'Examen', 'Salles de classe'], ['Journée sportive', 25, 25, 'Fête', 'Stade municipal'], ['Conseil de classe', 35, 38, 'Réunion', 'Salle des professeurs'], ['Vacances de fin de trimestre', 52, 66, 'Vacances', '']].forEach(e =>
    db.events.push({ id: id('evt'), titre: e[0], date: addDays(T, e[1]), fin: addDays(T, e[2]), categorie: e[3], lieu: e[4] }));
  db.complaints.push({ id: id('plt'), date: addDays(T, -2), categorie: 'Cantine', message: 'Les portions du déjeuner sont parfois insuffisantes pour les plus jeunes.', statut: 'Nouvelle', reponse: '' },
    { id: id('plt'), date: addDays(T, -9), categorie: 'Discipline', message: 'Du bruit régulier devant la salle 3 pendant les cours de l’après-midi.', statut: 'Résolue', reponse: 'Un surveillant est désormais posté dans le couloir.' });
  const H = h => new Date(Date.now() - h * 3600e3).toISOString();
  db.tickets.push({ id: id('tic'), cree: H(2), titre: 'Vidéoprojecteur de la salle 4 en panne', description: 'L’image est floue et s’éteint après 10 minutes.', priorite: 'Urgente', statut: 'Ouvert', assigneId: 'u-sec', creePar: 'Moussa Ndiaye' },
    { id: id('tic'), cree: H(30), titre: 'Robinet qui fuit dans les toilettes des filles', description: '', priorite: 'Haute', statut: 'En cours', assigneId: 'u-sec', creePar: 'Idrissa Camara' },
    { id: id('tic'), cree: H(60), titre: 'Imprimer 120 convocations d’examen', description: 'Papier A4 à prévoir.', priorite: 'Normale', statut: 'Ouvert', assigneId: 'u-sec', creePar: 'Seydou Mbaye' },
    { id: id('tic'), cree: H(130), titre: 'Mettre à jour la liste des parents', description: '', priorite: 'Basse', statut: 'Résolu', assigneId: 'u-sec', creePar: 'Khady Thiam' });
  [[0, 'Éloge', 'Faible', 'Très bonne participation en classe'], [4, 'Avertissement', 'Moyenne', 'Retards répétés'], [9, 'Retenue', 'Moyenne', 'Bavardages pendant la composition'], [14, 'Éloge', 'Faible', 'Aide ses camarades en mathématiques'], [21, 'Blâme', 'Grave', 'Insolence envers un enseignant']].forEach((c, i) =>
    db.conduct.push({ id: id('cdt'), studentId: db.students[c[0]].id, date: addDays(T, -2 - i * 2), type: c[1], gravite: c[2], description: c[3], signalePar: 'Idrissa Camara' }));
  [[0, 'Football', 'Sport', 'Équipe de l’école'], [3, 'Club de lecture', 'Culture', 'Membre'], [7, 'Concours d’orthographe', 'Concours', '2e place'], [12, 'Club environnement', 'Club', 'Responsable du jardin'], [18, 'Athlétisme', 'Sport', 'Qualifiée au district'], [25, 'Chorale', 'Culture', 'Soliste']].forEach(a =>
    db.activities.push({ id: id('act'), studentId: db.students[a[0]].id, activite: a[1], categorie: a[2], date: addDays(T, -20), resultat: a[3] }));

  /* enseignement */
  db.classes.slice(0, 3).forEach((c, i) => {
    const a = db.assignments.find(x => x.classId === c.id && x.subjectId === db.subjects[1].id);
    db.lessons.push({ id: id('lec'), teacherId: a.teacherId, classId: c.id, subjectId: a.subjectId, titre: ['Les fractions', 'Les nombres relatifs', 'Les angles'][i], objectifs: 'Maîtriser les notions de base et résoudre trois exercices types.', date: addDays(T, i + 1), duree: 60, statut: i === 0 ? 'Prévu' : 'Prévu' });
    db.logbook.push({ id: id('cah'), date: addDays(T, -i - 1), teacherId: a.teacherId, classId: c.id, subjectId: a.subjectId, contenu: ['Révision du chapitre 2, correction du devoir.', 'Introduction aux nombres relatifs, exemples de la vie courante.', 'Construction d’angles au rapporteur.'][i], devoirs: ['Exercices 4 à 7 page 32', 'Apprendre la leçon', 'Terminer la construction'][i] });
  });
  db.lessons.push({ id: id('lec'), teacherId: db.teachers[1].id, classId: db.classes[0].id, subjectId: db.subjects[0].id, titre: 'Le récit d’aventure', objectifs: 'Identifier les étapes du récit et écrire un court paragraphe.', date: addDays(T, -3), duree: 60, statut: 'Fait' });
  const nx = addDays(T, 5);
  [['09:00', 1, true], ['09:30', 3, true], ['10:00', 0, false], ['10:30', 2, false], ['11:00', 4, false], ['15:00', 5, false]].forEach((p, i) =>
    db.ptm.push({ id: id('rdv'), date: wk(nx, 1), heure: p[0], teacherId: db.teachers[p[1]].id, statut: p[2] ? 'Réservé' : 'Libre', parentId: p[2] ? db.parents[0].id : '', studentId: p[2] ? db.students[0].id : '', motif: p[2] ? 'Suivi des résultats' : '' }));
  db.substitutes.push({ id: id('rem'), date: addDays(T, -2), absentId: db.teachers[2].id, substituteId: db.teachers[3].id, classId: db.classes[1].id, periodId: db.periods[0].id, motif: 'Absence maladie' });

  /* documents, équipements, stock */
  [[0, 'Acte de naissance', ''], [1, 'Certificat médical', addDays(T, 14)], [2, 'Certificat médical', addDays(T, -10)], [3, 'Bulletin précédent', ''], [4, 'Acte de naissance', ''], [5, 'Certificat médical', addDays(T, 200)], [6, 'Pièce d’identité du tuteur', addDays(T, 21)]].forEach((d, i) =>
    db.documents.push({ id: id('doc'), titre: d[1] + ' – ' + db.students[d[0]].prenom, type: d[1], studentId: db.students[d[0]].id, fichier: d[1].toLowerCase().replace(/[^a-z]+/g, '-') + '-' + (d[0] + 1) + '.pdf', verifie: i % 3 !== 1, expiration: d[2] }));
  [['Vidéoprojecteur Epson', 'Informatique', 'Salle 4', 280000, 'Passable'], ['Ordinateur portable HP', 'Informatique', 'Secrétariat', 350000, 'Bon'], ['Groupe électrogène 5 kVA', 'Énergie', 'Local technique', 900000, 'Bon'], ['Photocopieuse Ricoh', 'Bureautique', 'Secrétariat', 650000, 'Bon'], ['Minibus scolaire', 'Transport', 'Garage', 14500000, 'Bon'], ['Tableau blanc 3 m', 'Mobilier', 'Salle 2', 85000, 'Usagé']].forEach((a, i) =>
    db.assets.push({ id: id('act'), tag: 'IMM-' + pad(i + 1), nom: a[0], categorie: a[1], lieu: a[2], achat: (startY - rnd(0, 4)) + '-0' + rnd(1, 9) + '-10', valeur: a[3], etat: a[4], responsable: 'Khady Thiam' }));
  [[0, 'Corrective', 'Remplacement de la lampe', 45000, 'Atelier Diop Électro'], [2, 'Préventive', 'Vidange et filtre', 38000, 'Garage Central'], [4, 'Préventive', 'Révision des 10 000 km', 120000, 'Garage Central'], [3, 'Corrective', 'Remplacement du rouleau', 28000, 'Bureautique Dakar']].forEach((m, i) =>
    db.maintenance.push({ id: id('ent'), assetId: db.assets[m[0]].id, date: addDays(T, -10 - i * 15), type: m[1], description: m[2], cout: m[3], technicien: m[4] }));
  [['CRA-01', 'Craie blanche (boîte)', 'Fournitures', 'boîte', 40, 15, 1200], ['CAH-100', 'Cahier 100 pages', 'Fournitures', 'pièce', 300, 100, 350], ['STY-B', 'Stylo bleu', 'Fournitures', 'pièce', 200, 60, 150], ['PAP-A4', 'Papier A4', 'Bureautique', 'ramette', 30, 10, 3200], ['MAR-N', 'Marqueur effaçable', 'Fournitures', 'pièce', 60, 20, 500], ['JAV-5', 'Eau de javel 5 L', 'Entretien', 'bidon', 12, 6, 2500], ['TON-R', 'Toner photocopieuse', 'Bureautique', 'cartouche', 4, 2, 48000]].forEach(s =>
    db.stock.push({ id: id('stk'), code: s[0], nom: s[1], categorie: s[2], unite: s[3], initial: s[4], seuil: s[5], prix: s[6] }));
  [[0, 'Sortie', 22, 'Distribution aux classes'], [3, 'Sortie', 21, 'Impression des devoirs'], [5, 'Sortie', 7, 'Nettoyage mensuel'], [6, 'Sortie', 3, 'Remplacement'], [1, 'Entrée', 100, 'Achat rentrée'], [4, 'Sortie', 38, 'Distribution aux classes']].forEach((t, i) =>
    db.stockTx.push({ id: id('mvt'), itemId: db.stock[t[0]].id, date: addDays(T, -5 - i * 3), type: t[1], quantite: t[2], motif: t[3] }));

  db.audit.push({ id: id('aud'), at: H(26), user: 'Khady Thiam', action: 'créé', table: 'payments', rowId: '', detail: 'Encaissement mensualité' },
    { id: id('aud'), at: H(5), user: 'Seydou Mbaye', action: 'modifié', table: 'notices', rowId: '', detail: 'Avis épinglé' });
  db.__v = 2;
  return db;
}

/* ---------- Accès aux données ---------- */
const LS_KEY = 'scolaria-demo-v2';
const lsGet = () => { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const lsSet = db => { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { /* stockage indisponible : la démo reste en mémoire */ } };
const lsClear = () => { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } };

/* Appel du serveur Apps Script par HTTPS. Corps en texte brut : évite la requête de pré-vérification CORS (OPTIONS) que Apps Script ne traite pas. */
const remote = async (fn, a) => {
  if (!REMOTE_URL) throw new Error('Adresse du serveur non configurée : renseignez l’adresse /exec du déploiement Apps Script dans config.js (voir docs/FIREBASE.md).');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
  let res;
  try { res = await fetch(REMOTE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args: a }), redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: ctl.signal }); }
  catch (e) { throw new Error(e && e.name === 'AbortError' ? 'Le serveur met trop de temps à répondre. Réessayez.' : 'Serveur injoignable. Vérifiez la connexion Internet et l’adresse du serveur dans config.js.'); }
  finally { clearTimeout(timer); }
  let j; try { j = await res.json(); } catch (e) { throw new Error('Réponse inattendue du serveur. Vérifiez que le déploiement Apps Script est ouvert à « Tout le monde » et que l’adresse se termine par /exec.'); }
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'Erreur du serveur.');
  return j.data;
};
const gas = (fn, ...a) => HAS_GOOGLE
  ? new Promise((ok, ko) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => ko(new Error((e && e.message) || String(e))))[fn](...a))
  : remote(fn, a);
let TOKEN = ''; try { TOKEN = sessionStorage.getItem('scolaria-token') || ''; } catch (e) { /* ignore */ }
const setToken = t => { TOKEN = t || ''; try { if (t) sessionStorage.setItem('scolaria-token', t); else sessionStorage.removeItem('scolaria-token'); } catch (e) { /* ignore */ } };
const isAuthErr = e => e && /(^|\W)AUTH($|\W)/.test(e.message || '');
const Api = IN_GAS ? {
  status: () => gas('apiStatus'),
  challenge: () => gas('apiChallenge'),
  async register(form, connected) { const r = await gas('apiRegister', form, connected ? TOKEN : ''); if (r.session) { setToken(r.session.token); delete r.session; r.logged = true; } return r; },
  async login(identifier, pwd) { const r = await gas('apiLogin', identifier, pwd); setToken(r.token); },
  async setup(email, nom, pwd) { const r = await gas('apiSetupAdmin', email, nom, pwd); setToken(r.token); },
  async logout() { try { await gas('apiLogout', TOKEN); } catch (e) { /* ignore */ } setToken(''); },
  hasToken: () => !!TOKEN,
  async load() {
    const r = await gas('apiLoadAll', TOKEN); const db = {};
    Object.keys(SCHEMA).forEach(t => { db[t] = (r.tables[t] || []).map(x => normRow(t, x)); });
    return { db, me: normRow('users', r.me) };
  },
  save: (t, row) => gas('apiSave', TOKEN, t, row),
  saveMany: (t, rows) => gas('apiSaveMany', TOKEN, t, rows),
  remove: (t, ids) => gas('apiRemove', TOKEN, t, ids),
  setPassword: (id, pwd) => gas('apiSetPassword', TOKEN, id, pwd),
  changePassword: (a, b) => gas('apiChangePassword', TOKEN, a, b),
  importAll: tables => gas('apiImportAll', TOKEN, tables),
  email: (subject, body) => gas('apiEmailReport', TOKEN, subject, body),
  admit: (id, classId, no) => gas('apiAdmit', TOKEN, id, classId, no),
  setSecret: (canal, name, value) => gas('apiSetSecret', TOKEN, canal, name, value),
  secretsStatus: () => gas('apiSecretsStatus', TOKEN),
  testChannel: (canal, to) => gas('apiTestChannel', TOKEN, canal, to),
  broadcast: spec => gas('apiBroadcast', TOKEN, spec),
  remind: ids => gas('apiRemind', TOKEN, ids),
  outboxMark: id => gas('apiOutboxMark', TOKEN, id)
} : {
  async load(role) {
    let db = lsGet(); if (!db || db.__v !== 2) { db = buildSeed(); lsSet(db); }
    return { db, me: db.users.find(u => u.role === (role || 'admin')) };
  }
};

/* ---------- Mode démonstration : le « serveur » est la même logique métier, appliquée à la copie locale ---------- */
const demoHost = { uid, today: todayStr, pwd: () => ({ hash: '', salt: '' }), temp: () => Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 12).padEnd(10, 'x') };
function demoApply(db, ctx) {
  const next = { ...db };
  Object.keys(ctx.touched).forEach(t => {
    const m = {}; Object.keys(ctx.touched[t]).forEach(id => { m[id] = normRow(t, ctx.touched[t][id]); });
    const have = new Set(db[t].map(x => x.id));
    next[t] = [...db[t].map(x => m[x.id] || x), ...Object.values(m).filter(x => !have.has(x.id))];
  });
  return next;
}
function demoRun(db, fn) {
  const copy = {}; Object.keys(db).forEach(t => { copy[t] = Array.isArray(db[t]) ? db[t].slice() : db[t]; });
  const ctx = { db: copy, touched: {}, h: demoHost }, res = fn(ctx);
  return { res, db: demoApply(db, ctx) };
}
/* Rien ne part vraiment en démonstration, sauf les liens manuels (SMS, WhatsApp) qui s'ouvrent pour de bon. */
function demoSend(db, plan, label) {
  const rows = plan.map(m => {
    const ch = chanOf_(db, m.canal), manual = m.canal !== 'email' && ch.fournisseur === 'lien', withSecret = (m.secrets || []).some(x => x && m.texte.indexOf(x) >= 0);
    return normRow('outbox', { id: uid(), at: new Date().toISOString(), canal: m.canal, fournisseur: ch.fournisseur, to: m.to, nom: m.nom, event: m.event, statut: manual ? 'À envoyer' : 'Simulé', detail: manual ? 'Ouvrez le lien pour envoyer le message depuis un téléphone.' : 'Mode démonstration : rien n’est réellement envoyé.', texte: (m.secrets || []).reduce((t, x) => x ? t.split(x).join('••••••') : t, m.texte).slice(0, 600), lien: manual && !withSecret ? manualLink_(m.canal, m.to, m.texte) : '' });
  });
  return { db: { ...db, outbox: [...db.outbox, ...rows], audit: [...db.audit, { id: uid(), at: new Date().toISOString(), user: label.user, action: 'créé', table: 'outbox', rowId: '', detail: label.text + ' : ' + rows.length + ' message(s)' }] }, rows };
}
const Demo = {
  register(db, form, me) {
    const r = demoRun(db, ctx => {
      const out = registerCore_(ctx, form, me);
      ctx.db.users = ctx.db.users.slice();
      return out;
    });
    let next = r.db, plan = [];
    const par = r.res.parent;
    plan = plan.concat(planMessages_(next, 'inscription_recue', [{ nom: fullName_(par), tel: par.tel, email: par.email, canaux: r.res.user.canaux }], { parent: fullName_(par), eleve: r.res.admissions.map(a => a.prenom + ' ' + a.nom).join(' et '), ref: r.res.refs.join(', '), identifiant: r.res.user.login || r.res.user.email }));
    const tplOn = tplOf_(next, 'inscription_recue').actif; if (!tplOn) plan = [];
    r.res.admitted.forEach(a => { plan = plan.concat(admissionPlan_(next, a)); });
    next = demoSend(next, plan, { user: 'Inscription en ligne', text: 'Messages d’inscription' }).db;
    const comptes = []; r.res.admitted.forEach(a => a.comptes.forEach(x => { if (x.nouveau && x.pwd) comptes.push({ role: x.role, nom: x.nom, login: x.login, pwd: x.pwd }); }));
    const user = next.users.find(u => u.id === r.res.user.id);
    next = { ...next, audit: [...next.audit, { id: uid(), at: new Date().toISOString(), user: 'Inscription en ligne', action: 'créé', table: 'admissions', rowId: '', detail: r.res.refs.join(', ') }] };
    return { db: next, out: { ok: true, refs: r.res.refs, admis: r.res.admitted.length, comptes, user } };
  },
  admit(db, admissionId, classId, no, actor) {
    const r = demoRun(db, ctx => admitCore_(ctx, admissionId, { classId, admission: no }));
    let next = demoSend(r.db, admissionPlan_(r.db, r.res), { user: actor, text: 'Message d’admission' }).db;
    next = { ...next, audit: [...next.audit, { id: uid(), at: new Date().toISOString(), user: actor, action: 'créé', table: 'students', rowId: r.res.student.id, detail: 'Admission de ' + fullName_(r.res.student) }] };
    return { db: next, out: { student: r.res.student, parent: r.res.parent, classe: r.res.classe.nom, comptes: r.res.comptes } };
  },
  broadcast(db, spec, actor) { const b = broadcastPlan_(db, spec), s = demoSend(db, b.plan, { user: actor, text: 'Envoi groupé' }); if (!b.plan.length) throw new Error('Aucun destinataire joignable avec ces canaux. Vérifiez les numéros et adresses, et les préférences de contact.'); const sum = summarize_(s.rows.map(r => r.statut === 'Simulé' ? { ...r, statut: 'Envoyé' } : r)); sum.destinataires = b.recs.length; sum.simule = true; return { db: s.db, out: sum }; },
  remind(db, ids, actor) { const plan = remindPlan_(db, ids); if (!plan.length) throw new Error('Aucun destinataire joignable avec ces canaux. Vérifiez les numéros et adresses, et les préférences de contact.'); const s = demoSend(db, plan, { user: actor, text: 'Rappels de mensualité' }); const sum = summarize_(s.rows.map(r => r.statut === 'Simulé' ? { ...r, statut: 'Envoyé' } : r)); sum.simule = true; return { db: s.db, out: sum }; }
};

/* ===== Scolaria : composants d'interface ===== */
const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const ICONS = {
  dash: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  users: C(9, 8, 3.5) + ' M2 20c0-3.5 3-6 7-6s7 2.5 7 6 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14.5c2.5.6 4 2.5 4 5.5',
  user: C(12, 8, 4) + ' M4 21c0-4 3.5-7 8-7s8 3 8 7',
  book: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  cal: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  clock: C(12, 12, 9) + ' M12 7v5l3 2',
  check: 'M5 12l5 5 9-10',
  cash: 'M3 7h18v10H3z ' + C(12, 12, 2.5) + ' M6 10v4 M18 10v4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h6',
  bell: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4',
  box: 'M3 8l9-5 9 5v9l-9 5-9-5z M3 8l9 5 9-5 M12 13v9',
  sliders: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 ' + C(16, 7, 2) + ' ' + C(8, 17, 2),
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: C(11, 11, 6) + ' M16 16l5 5',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  x: 'M6 6l12 12 M18 6L6 18',
  printer: 'M7 8V3h10v5 M5 8h14v8H5z M7 14h10v7H7z',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  award: C(12, 9, 5) + ' M8.5 13.5L7 21l5-3 5 3-1.5-7.5',
  school: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  clip: 'M8 4h8v3H8z M6 5H5v16h14V5h-1 M9 12h6 M9 16h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  swap: 'M4 8h14l-3-3 M20 16H6l3 3',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  chev: 'M9 6l6 6-6 6',
  send: 'M3 11l18-8-8 18-2-8z',
  tool: 'M14 6a4 4 0 0 0 5 5l-9 9a2.5 2.5 0 0 1-4-4z M14 6l-1-3 3 1',
  help: C(12, 12, 9) + ' M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7 M12 17v.5'
};
function Icon({ n, s = 18 }) {
  return html`<svg className="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[n] || ICONS.file} /></svg>`;
}
const Btn = ({ children, tone, sm, icon, ...p }) => html`<button type="button" className=${'btn' + (tone ? ' ' + tone : '') + (sm ? ' sm' : '')} ...${p}>${icon && html`<${Icon} n=${icon} s=${sm ? 15 : 17} />`}${children}</button>`;
const Badge = ({ tone = 'mute', children }) => html`<span className=${'badge ' + tone}>${children}</span>`;
function PageHead({ title, sub, children }) {
  const app = useContext(Ctx), row = app && app.cur && app.cur !== 'home' ? (app.db.modules.find(x => x.id === app.cur) || {}) : {};
  const t = row.label || title, d = row.sub || sub;
  return html`<header className="page-head"><div><h1>${t}</h1>${d && html`<p className="sub">${d}</p>`}</div><div className="head-actions">${children}</div></header>`;
}
const Empty = ({ icon = 'file', title, children }) => html`<div className="empty"><${Icon} n=${icon} s=${28} /><strong>${title}</strong><span>${children}</span></div>`;
const Kpi = ({ l, v, sub, tone, icon }) => html`<div className=${'kpi ' + (tone || '')}><div className="kpi-top"><span>${l}</span>${icon && html`<${Icon} n=${icon} s=${16} />`}</div><strong className="mono">${v}</strong>${sub && html`<small>${sub}</small>`}</div>`;

function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return html`<div className="modal-back" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div className="modal-head"><h2>${title}</h2><button type="button" className="icon-btn" onClick=${onClose} aria-label="Fermer"><${Icon} n="x" /></button></div>
      <div className="modal-body">${children}</div>
      ${foot && html`<div className="modal-foot">${foot}</div>`}
    </div></div>`;
}

/* ---------- Champs de formulaire pilotés par configuration ---------- */
function Field({ f, values, set, db, error }) {
  const v = values[f.k], id = 'f-' + f.k;
  const c = { id, disabled: !!f.ro, 'aria-invalid': !!error };
  let input;
  if (f.t === 'area') input = html`<textarea ...${c} rows=${f.rows || 3} value=${v ?? ''} onChange=${e => set(f.k, e.target.value)}></textarea>`;
  else if (f.t === 'select' || f.t === 'ref') {
    let o;
    if (f.t === 'ref') o = db[f.ref].filter(r => !f.fl || f.fl(r, values, db)).map(r => ({ v: r.id, l: LABEL[f.ref](r, db) })).sort((a, b) => a.l.localeCompare(b.l, 'fr'));
    else o = (typeof f.o === 'function' ? f.o(values, db) : f.o).map(x => typeof x === 'string' ? { v: x, l: x } : x);
    if (v && !o.some(x => x.v === v)) o = [{ v, l: v }, ...o];       // une valeur qui n'est plus dans la liste (liste modifiée) reste visible
    input = html`<select ...${c} value=${v ?? ''} onChange=${e => set(f.k, e.target.value)}><option value="">—</option>${o.map(x => html`<option key=${x.v} value=${x.v}>${x.l}</option>`)}</select>`;
  }
  else if (f.t === 'bool') input = html`<label className="check"><input ...${c} type="checkbox" checked=${!!v} onChange=${e => set(f.k, e.target.checked)} /> <span>${f.cl || 'Oui'}</span></label>`;
  else if (f.t === 'num') input = html`<input ...${c} type="number" step=${f.step || 1} min=${f.min} max=${f.max} value=${v ?? ''} onChange=${e => set(f.k, e.target.value === '' ? '' : Number(e.target.value))} />`;
  else if (f.t === 'file') input = html`<div className="filepick"><input ...${c} type="file" onChange=${e => { const fl = e.target.files && e.target.files[0]; set(f.k, fl ? fl.name : v); }} />${v && html`<span className="mono small">${v}</span>`}</div>`;
  else {
    const list = f.list ? f.list(db) : null;
    input = html`<input ...${c} type=${f.t || 'text'} value=${v ?? ''} placeholder=${f.ph} list=${list ? id + '-l' : undefined} onChange=${e => set(f.k, e.target.value)} />${list && html`<datalist id=${id + '-l'}>${list.map(x => html`<option key=${x} value=${x} />`)}</datalist>`}`;
  }
  return html`<div className=${'field' + (f.w === 'full' || f.t === 'area' ? ' full' : '') + (error ? ' has-err' : '')}>
    <label htmlFor=${id}>${f.l}${f.req && html`<span className="req"> *</span>`}</label>${input}
    ${error ? html`<small className="err">${error}</small>` : f.hint && html`<small className="hint">${typeof f.hint === 'function' ? f.hint(values, db) : f.hint}</small>`}
  </div>`;
}
function validateFields(fields, values, db, editing) {
  const errs = {};
  fields.forEach(f => {
    if (f.show && !f.show(values)) return;
    const v = values[f.k];
    if (f.req && (v === '' || v === undefined || v === null)) { errs[f.k] = 'Champ obligatoire'; return; }
    if (f.t === 'num' && v !== '' && v !== undefined) { if (f.min !== undefined && v < f.min) { errs[f.k] = 'Minimum : ' + f.min; return; } if (f.max !== undefined && v > f.max) { errs[f.k] = 'Maximum : ' + f.max; return; } }
    if (f.t === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { errs[f.k] = 'Adresse e-mail invalide'; return; }
    if (f.check) { const m = f.check(v, values, db, editing); if (m) errs[f.k] = m; }
  });
  return errs;
}
function FormFields({ fields, values, set, db, errors }) {
  return html`<div className="form-grid">${fields.filter(f => !f.show || f.show(values)).map(f => html`<${Field} key=${f.k} f=${f} values=${values} set=${set} db=${db} error=${errors[f.k]} />`)}</div>`;
}

/* Boîte de dialogue générique : formulaire ou confirmation (remplace prompt/confirm) */
function AskDialog({ cfg, db, onDone }) {
  const [values, setValues] = useState(cfg.initial || {});
  const [errors, setErrors] = useState({});
  const [formErr, setFormErr] = useState('');
  const fields = cfg.fields || [];
  const set = (k, v) => setValues(prev => { let nv = { ...prev, [k]: v }; if (cfg.onChange) nv = { ...nv, ...(cfg.onChange(nv, k, db) || {}) }; return nv; });
  const submit = e => {
    if (e) e.preventDefault();
    const errs = validateFields(fields, values, db, cfg.editing); setErrors(errs);
    if (Object.keys(errs).length) return;
    const m = cfg.validate ? cfg.validate(values, db) : ''; if (m) { setFormErr(m); return; }
    onDone(values);
  };
  const foot = html`${cfg.secondary && html`<${Btn} tone=${cfg.secondary.tone || 'ghost'} onClick=${() => onDone({ __action: cfg.secondary.value })}>${cfg.secondary.l}<//>`}<span className="grow"></span>${!cfg.noCancel && html`<${Btn} onClick=${() => onDone(null)}>Annuler<//>`}<${Btn} tone=${cfg.danger ? 'danger solid' : 'primary'} onClick=${submit}>${cfg.submit || 'Enregistrer'}<//>`;
  return html`<${Modal} title=${cfg.title} onClose=${() => onDone(null)} wide=${cfg.wide} foot=${foot}>
    <form onSubmit=${submit}>
      ${cfg.message && html`<p className="dlg-msg">${cfg.message}</p>`}
      ${fields.length > 0 && html`<${FormFields} fields=${fields} values=${values} set=${set} db=${db} errors=${errors} />`}
      ${cfg.extra && cfg.extra(values, db)}
      ${formErr && html`<p className="form-err" role="alert">${formErr}</p>`}
      <button type="submit" hidden></button>
    </form></${Modal}>`;
}

/* ---------- Graphiques ---------- */
function Bars({ data, h = 150, fmt = num, label }) {
  const max = Math.max(1, ...data.map(d => d.v)), step = Math.max(46, 560 / Math.max(1, data.length)), w = step * data.length;
  return html`<div className="chartwrap"><svg viewBox=${`0 0 ${w} ${h + 28}`} className="chart" style=${{ minWidth: Math.min(w, 520) }} role="img" aria-label=${label || 'Histogramme'}>
    ${[0, .5, 1].map(t => html`<line key=${t} x1="0" x2=${w} y1=${h - t * (h - 16)} y2=${h - t * (h - 16)} className="grid" />`)}
    ${data.map((d, i) => { const bw = Math.min(30, step - 14), x = i * step + (step - bw) / 2, bh = d.v / max * (h - 18); return html`<g key=${i}><rect x=${x} y=${h - bh} width=${bw} height=${Math.max(bh, 1)} rx="3" className=${'bar ' + (d.tone || '')} /><text x=${x + bw / 2} y=${h - bh - 5} textAnchor="middle" className="val">${fmt(d.v)}</text><text x=${x + bw / 2} y=${h + 17} textAnchor="middle" className="lbl">${d.l}</text></g>`; })}
  </svg></div>`;
}
function Line({ data, h = 140, unit = '%', label }) {
  if (!data.length) return null;
  const w = 560, lo = Math.max(0, Math.floor(Math.min(...data.map(d => d.v)) - 6)), hi = 100, pl = 40, pr = 24, pt = 16, pb = 26;
  const X = i => pl + (data.length === 1 ? 0 : i * (w - pl - pr) / (data.length - 1)), Y = v => pt + (hi - v) / (hi - lo) * (h - pt - pb);
  const pts = data.map((d, i) => X(i) + ',' + Y(d.v)).join(' '), last = data[data.length - 1];
  return html`<div className="chartwrap"><svg viewBox=${`0 0 ${w} ${h}`} className="chart" role="img" aria-label=${label || 'Courbe'}>
    ${[lo, Math.round((lo + hi) / 2), hi].map(t => html`<g key=${t}><line x1=${pl} x2=${w - pr} y1=${Y(t)} y2=${Y(t)} className="grid" /><text x=${pl - 5} y=${Y(t) + 3} textAnchor="end" className="lbl">${t}${unit}</text></g>`)}
    <polygon points=${pl + ',' + Y(lo) + ' ' + pts + ' ' + X(data.length - 1) + ',' + Y(lo)} className="area" />
    <polyline points=${pts} className="line" fill="none" />
    ${data.map((d, i) => html`<text key=${i} x=${X(i)} y=${h - 8} textAnchor="middle" className="lbl">${d.l}</text>`)}
    <circle cx=${X(data.length - 1)} cy=${Y(last.v)} r="4" className="dot" />
    <text x=${X(data.length - 1)} y=${Y(last.v) - 9} textAnchor="end" className="val">${dec(last.v, 1)}${unit}</text>
  </svg></div>`;
}

/* ===== Scolaria : moteur de pages CRUD et configuration des modules ===== */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);
const B = (tone, t) => html`<${Badge} tone=${tone}>${t}<//>`;
const SEXE = [{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }];
const PHONE = v => v && !/^(70|75|76|77|78|33|30)[ .]?\d{3}[ .]?\d{2}[ .]?\d{2}$/.test(v.trim()) ? 'Numéro attendu : 77 123 45 67' : '';
const daysTo = d => Math.round((new Date(d + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 864e5);
const yearOf = db => ((db.settings[0] || {}).annee || '').slice(0, 4) || String(new Date().getFullYear());
const nextSeq = (rows, key) => rows.reduce((m, r) => { const x = /(\d+)$/.exec(r[key] || ''); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
const nextAdmission = db => nextAdmission_(db);
const nextReceipt = db => 'REC-' + yearOf(db) + '-' + pad(nextSeq(db.payments, 'recu'), 4);
const stockQty = (db, s) => s.initial + db.stockTx.filter(t => t.itemId === s.id).reduce((a, t) => a + (t.type === 'Entrée' ? t.quantite : -t.quantite), 0);
const SLA = { Urgente: 4, Haute: 24, Normale: 72, Basse: 168 };
function slaInfo(t) {
  if (t.statut === 'Résolu' || t.statut === 'Fermé') return { txt: 'Traité', tone: 'mute' };
  const d = new Date(t.cree).getTime() + SLA[t.priorite] * 3600e3 - Date.now(), h = Math.abs(d) / 3600e3;
  const f = h < 48 ? Math.max(1, Math.round(h)) + ' h' : Math.round(h / 24) + ' j';
  return d < 0 ? { txt: 'Dépassé de ' + f, tone: 'bad' } : { txt: 'Reste ' + f, tone: d < 6 * 3600e3 ? 'warn' : 'ok' };
}
function expInfo(d) {
  if (!d) return { txt: 'Sans échéance', tone: 'mute' };
  const n = daysTo(d);
  if (n < 0) return { txt: 'Expiré depuis ' + (-n) + ' j', tone: 'bad' };
  return n <= 30 ? { txt: 'Expire dans ' + n + ' j', tone: 'warn' } : { txt: fmtDate(d), tone: 'ok' };
}
/* Listes de choix modifiables depuis « Modules » */
const LISTF = key => (v, db) => listOf_(db, key), LISTD = key => db => listOf_(db, key);
/* Champs personnalisés : stockés en JSON dans la colonne « extra » ; dans les formulaires, ils s'appellent x_<clé> */
function custFields(db, key) {
  return customDefs_(db, key).map(d => ({ k: 'x_' + d.k, l: d.l, t: d.t === 'text' ? undefined : d.t, o: d.o || [], req: d.req && d.t !== 'bool', cl: 'Oui', w: d.t === 'area' ? 'full' : undefined, custom: true }));
}
const unpackExtra = (row, db, key) => { const x = parseJson_(row.extra, {}), o = {}; customDefs_(db, key).forEach(d => { o['x_' + d.k] = x[d.k] === undefined ? (d.t === 'bool' ? false : '') : x[d.k]; }); return o; };
function packExtra(v, db, key) {
  const raw = {}; customDefs_(db, key).forEach(d => { raw[d.k] = v['x_' + d.k]; });
  const out = { ...v }; Object.keys(out).forEach(k => { if (k.indexOf('x_') === 0) delete out[k]; });
  if (TYPES[key] && TYPES[key].extra !== undefined) out.extra = cleanExtra_(customDefs_(db, key), raw);
  return out;
}
const customCols = (db, key) => customDefs_(db, key).filter(d => d.liste).map(d => ({ l: d.l, v: r => { const x = parseJson_(r.extra, {})[d.k]; return x === undefined || x === '' ? '' : d.t === 'bool' ? (x ? 'Oui' : 'Non') : d.t === 'date' ? fmtDate(x) : x; } }));
const teacherOptions = db => db.teachers.map(t => ({ v: t.id, l: fullName(t) }));

function colFromField(f, db) {
  if (!f) return { l: '?', v: () => '' };
  return {
    l: f.l, num: f.t === 'num',
    v: r => f.t === 'ref' ? refLabel(db, f.ref, r[f.k]) : f.t === 'date' ? fmtDate(r[f.k]) : f.t === 'bool' ? (r[f.k] ? 'Oui' : 'Non') : r[f.k]
  };
}

function CrudPage({ cfg }) {
  const app = useApp(); const { db, can, save, remove, ask, notify } = app;
  const table = cfg.table || cfg.key, canNew = can(cfg.key, 'create'), canEdit = can(cfg.key, 'modify'), canDel = can(cfg.key, 'delete') && cfg.canDelete !== false, canWrite = canNew || canEdit;
  const [q, setQ] = useState(''), [flt, setFlt] = useState({}), [limit, setLimit] = useState(60);
  const baseFields = typeof cfg.fields === 'function' ? cfg.fields(app) : cfg.fields, hasCust = cfg.custom !== false && TYPES[table] && TYPES[table].extra !== undefined;
  const fields = hasCust ? [...baseFields, ...custFields(db, cfg.key)] : baseFields;
  const cols = [...cfg.cols.map(c => typeof c === 'string' ? colFromField(baseFields.find(f => f.k === c), db) : c), ...(hasCust ? customCols(db, cfg.key) : [])];
  let rows = cfg.scope ? cfg.scope(db[table], app) : db[table];
  rows = rows.filter(r => (cfg.filters || []).every(f => !flt[f.k] || r[f.k] === flt[f.k]));
  if (q.trim()) { const s = q.trim().toLowerCase(); rows = rows.filter(r => cols.some(c => String(c.v(r, db) ?? '').toLowerCase().includes(s))); }
  if (cfg.sort) rows = [...rows].sort(cfg.sort);

  const openForm = async row => {
    const initial = row ? { ...row, ...(hasCust ? unpackExtra(row, db, cfg.key) : {}) } : { ...(cfg.defaults ? cfg.defaults(db, app) : {}), ...(hasCust ? unpackExtra({}, db, cfg.key) : {}) };
    const v = await ask({ title: row ? 'Modifier — ' + (cfg.rowTitle ? cfg.rowTitle(row, db) : cfg.singular) : cfg.nl, fields, initial, editing: row, onChange: cfg.onChange, validate: cfg.validate ? (vals, d) => cfg.validate(vals, d, row, app) : null, wide: fields.length > 8 });
    if (!v) return;
    const packed = hasCust ? packExtra(v, db, cfg.key) : v;
    const out = cfg.beforeSave ? cfg.beforeSave({ ...packed }, db, app, row) : packed;
    const saved = await save(table, out);
    notify(row ? 'Modifications enregistrées' : 'Enregistrement ajouté');
    if (cfg.afterSave) cfg.afterSave(saved, db, app, v);
  };
  const del = async row => {
    const ok = await ask({ title: 'Supprimer cet enregistrement ?', message: cfg.delMsg || 'Cette action est définitive.', submit: 'Supprimer', danger: true });
    if (!ok) return; await remove(table, [row.id]); notify('Enregistrement supprimé');
  };
  const acts = (cfg.rowActions || []).filter(a => a.open || canWrite);
  const rowActs = r => html`${acts.filter(a => !a.show || a.show(r, app)).map(a => html`<button type="button" key=${a.l} className="icon-btn txt" title=${a.l} onClick=${() => a.run(r, app)}><${Icon} n=${a.i || 'check'} s=${15} /><span>${a.l}</span></button>`)}${canEdit && !cfg.noEdit && html`<button type="button" className="icon-btn" title="Modifier" aria-label="Modifier" onClick=${() => openForm(r)}><${Icon} n="edit" s=${16} /></button>`}${canDel && html`<button type="button" className="icon-btn danger" title="Supprimer" aria-label="Supprimer" onClick=${() => del(r)}><${Icon} n="trash" s=${16} /></button>`}`;
  const showActs = (canEdit && !cfg.noEdit) || canDel || acts.length > 0;

  return html`<section>
    <${PageHead} title=${cfg.title} sub=${cfg.sub}>${cfg.headExtra && cfg.headExtra(app)}${canNew && html`<${Btn} tone="primary" icon="plus" onClick=${() => openForm()}>${cfg.nl}<//>`}<//>
    ${cfg.topView && cfg.topView(app)}
    <div className="card flush">
      <div className="toolbar">
        <label className="search"><${Icon} n="search" s=${16} /><input type="search" id=${'q-' + cfg.key} placeholder="Rechercher…" value=${q} onChange=${e => { setQ(e.target.value); setLimit(60); }} aria-label="Rechercher" /></label>
        ${(cfg.filters || []).map(f => {
    const o = f.t === 'ref' ? db[f.ref].map(r => ({ v: r.id, l: LABEL[f.ref](r, db) })).sort((a, b) => a.l.localeCompare(b.l, 'fr')) : (typeof f.o === 'function' ? f.o(db) : f.o).map(x => typeof x === 'string' ? { v: x, l: x } : x);
    return html`<select key=${f.k} id=${'flt-' + cfg.key + '-' + f.k} aria-label=${f.l} value=${flt[f.k] || ''} onChange=${e => { setFlt({ ...flt, [f.k]: e.target.value }); setLimit(60); }}><option value="">${f.l} : tous</option>${o.map(x => html`<option key=${x.v} value=${x.v}>${x.l}</option>`)}</select>`;
  })}
        <span className="grow"></span><span className="count">${rows.length} ${rows.length > 1 ? 'résultats' : 'résultat'}</span>
      </div>
      ${rows.length === 0 ? html`<${Empty} icon=${cfg.icon || 'file'} title="Aucun enregistrement">${q || Object.values(flt).some(Boolean) ? 'Aucun résultat pour ces critères.' : canNew ? 'Utilisez le bouton « ' + cfg.nl + ' » pour commencer.' : 'Rien à afficher pour le moment.'}<//>`
      : cfg.card ? html`<div className="cards">${rows.slice(0, limit).map(r => html`<article key=${r.id} className="note">${cfg.card(r, db, app)}<div className="note-actions">${showActs && rowActs(r)}</div></article>`)}</div>`
        : html`<div className="tablewrap"><table className="t stack">
          <thead><tr>${cols.map((c, i) => html`<th key=${i} className=${c.num ? 'num' : ''}>${c.l}</th>`)}${showActs && html`<th className="actions"><span className="sr">Actions</span></th>`}</tr></thead>
          <tbody>${rows.slice(0, limit).map(r => html`<tr key=${r.id}>${cols.map((c, i) => html`<td key=${i} className=${(c.num ? 'num ' : '') + (c.mono ? 'mono' : '')} data-l=${c.l}>${c.r ? c.r(r, db, app) : (c.v(r, db) === '' || c.v(r, db) == null ? '—' : c.v(r, db))}</td>`)}${showActs && html`<td className="actions">${rowActs(r)}</td>`}</tr>`)}</tbody>
        </table></div>`}
      ${rows.length > limit && html`<div className="more"><${Btn} onClick=${() => setLimit(limit + 60)}>Afficher plus (${rows.length - limit} restants)<//></div>`}
    </div></section>`;
}

/* ---------- Configurations des modules ---------- */
const CFG = {};
const dateF = (k, l, extra) => ({ k, l, t: 'date', req: true, ...extra });

CFG.students = {
  key: 'students', icon: 'users', title: 'Élèves', sub: 'Dossiers des élèves inscrits, classes et responsables.', nl: 'Nouvel élève', singular: 'élève', rowTitle: s => fullName(s),
  fields: [
    { k: 'admission', l: 'N° d’admission', req: true, ph: 'ADM-2026-031', hint: 'Format ADM-AAAA-NNN, unique pour chaque élève.', check: (v, vals, db, ed) => !/^ADM-\d{4}-\d{3,5}$/.test(v) ? 'Format attendu : ADM-2026-031' : db.students.some(s => s.admission === v && (!ed || s.id !== ed.id)) ? 'Ce numéro est déjà attribué' : '' },
    { k: 'statut', l: 'Statut', t: 'select', o: ['Actif', 'Transféré', 'Sorti'], req: true },
    { k: 'prenom', l: 'Prénom', req: true }, { k: 'nom', l: 'Nom', req: true },
    { k: 'sexe', l: 'Sexe', t: 'select', o: SEXE, req: true }, dateF('naissance', 'Date de naissance'),
    { k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true }, { k: 'parentId', l: 'Parent ou tuteur', t: 'ref', ref: 'parents' },
    { k: 'tel', l: 'Téléphone', t: 'tel', check: PHONE }, { k: 'adresse', l: 'Adresse / quartier' },
    { k: 'nin', l: 'N° d’identité (NIN)', hint: '13 chiffres, facultatif.', check: v => v && !/^\d{13}$/.test(v) ? 'Le NIN comporte 13 chiffres' : '' }],
  defaults: db => ({ admission: nextAdmission(db), statut: 'Actif' }),
  cols: [{ l: 'Admission', v: s => s.admission, mono: true }, { l: 'Élève', v: s => fullName(s) }, 'classId', { l: 'Parent', v: (s, db) => refLabel(db, 'parents', s.parentId) }, { l: 'Statut', v: s => s.statut, r: s => B(s.statut === 'Actif' ? 'ok' : 'mute', s.statut) }],
  filters: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes' }, { k: 'statut', l: 'Statut', t: 'select', o: ['Actif', 'Transféré', 'Sorti'] }],
  sort: byName, delMsg: 'Les notes, présences et paiements de cet élève resteront dans l’historique.'
};

CFG.parents = {
  key: 'parents', icon: 'users', title: 'Parents et tuteurs', sub: 'Responsables légaux et liens avec les élèves.', nl: 'Nouveau parent', singular: 'parent', rowTitle: p => fullName(p),
  fields: [{ k: 'prenom', l: 'Prénom', req: true }, { k: 'nom', l: 'Nom', req: true }, { k: 'lien', l: 'Lien avec l’élève', t: 'select', o: LISTF('parents.lien'), req: true },
    { k: 'tel', l: 'Téléphone', t: 'tel', req: true, ph: '77 123 45 67', check: PHONE }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'profession', l: 'Profession' }, { k: 'adresse', l: 'Adresse / quartier', w: 'full' }],
  cols: [{ l: 'Responsable', v: p => fullName(p) }, 'lien', 'tel', { l: 'Enfants scolarisés', v: (p, db) => db.students.filter(s => s.parentId === p.id).map(s => s.prenom).join(', ') || '—' }, 'profession'],
  sort: byName,
  rowActions: [{ l: 'Lier un élève', i: 'link', run: async (p, app) => { const v = await app.ask({ title: 'Lier un élève à ' + fullName(p), fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true }], submit: 'Lier' }); if (!v) return; const s = app.db.students.find(x => x.id === v.studentId); await app.save('students', { ...s, parentId: p.id }); app.notify(fullName(s) + ' est lié(e) à ' + fullName(p)); } }]
};

CFG.admissions = {
  key: 'admissions', icon: 'clip', title: 'Admissions', sub: 'Candidatures reçues en ligne ou au guichet. Admettre un candidat crée son dossier élève, la fiche du parent et les comptes de connexion.', nl: 'Nouvelle candidature', singular: 'candidature', rowTitle: a => fullName(a),
  headExtra: app => app.regOpen && html`<${Btn} icon="link" onClick=${app.openPublicForm}>Voir le formulaire public<//>`,
  fields: [{ k: 'ref', l: 'Référence', ro: true, show: v => !!v.id }, dateF('date', 'Date de la demande'), { k: 'statut', l: 'Décision', t: 'select', o: ['En attente', 'Refusé'], req: true, hint: 'Pour admettre, utilisez le bouton « Admettre » de la liste.' },
    { k: 'prenom', l: 'Prénom du candidat', req: true }, { k: 'nom', l: 'Nom du candidat', req: true }, { k: 'sexe', l: 'Sexe', t: 'select', o: SEXE, req: true }, dateF('naissance', 'Date de naissance'),
    { k: 'classId', l: 'Classe demandée', t: 'ref', ref: 'classes', req: true },
    { k: 'parentPrenom', l: 'Prénom du parent', req: true }, { k: 'parentNom', l: 'Nom du parent', req: true }, { k: 'parentTel', l: 'Téléphone du parent', t: 'tel', req: true, check: PHONE }, { k: 'parentEmail', l: 'E-mail du parent', t: 'email', hint: 'Sert d’identifiant de connexion et reçoit les messages.' }, { k: 'lien', l: 'Lien', t: 'select', o: LISTF('parents.lien') }, { k: 'remarque', l: 'Remarque', w: 'full' }],
  defaults: () => ({ date: todayStr(), statut: 'En attente' }),
  cols: [{ l: 'Réf.', v: a => a.ref, mono: true }, { l: 'Date', v: a => fmtDate(a.date) }, { l: 'Candidat', v: a => fullName(a) }, 'classId', { l: 'Parent', v: a => a.parentPrenom + ' ' + a.parentNom + ' · ' + a.parentTel }, { l: 'Origine', v: a => a.source, r: a => a.source === 'en ligne' ? B('info', 'En ligne') : B('mute', 'Guichet') }, { l: 'Décision', v: a => a.statut, r: a => B(a.statut === 'Admis' ? 'ok' : a.statut === 'Refusé' ? 'bad' : 'warn', a.statut) }],
  filters: [{ k: 'statut', l: 'Décision', t: 'select', o: ['En attente', 'Admis', 'Refusé'] }, { k: 'source', l: 'Origine', t: 'select', o: [{ v: 'en ligne', l: 'En ligne' }, { v: 'secrétariat', l: 'Guichet' }] }],
  sort: (a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref),
  rowActions: [{
    l: 'Admettre', i: 'check', show: a => a.statut !== 'Admis',
    run: async (a, app) => {
      const db = app.db;
      const v = await app.ask({
        title: 'Admettre ' + fullName(a), message: 'Le dossier élève et la fiche du parent sont créés. Les comptes de connexion sont créés automatiquement si cette option est active dans « Modules ».',
        fields: [{ k: 'classId', l: 'Classe d’affectation', t: 'ref', ref: 'classes', req: true }, { k: 'admission', l: 'N° d’admission', req: true, check: v => !/^ADM-\d{4}-\d{3,5}$/.test(v) ? 'Format attendu : ADM-2026-031' : db.students.some(s => s.admission === v) ? 'Numéro déjà attribué' : '' }],
        initial: { classId: a.classId, admission: nextAdmission(db) }, submit: 'Admettre',
        validate: (vals, d) => { const c = d.classes.find(x => x.id === vals.classId); const eff = d.students.filter(s => s.classId === vals.classId && s.statut === 'Actif').length; return c && eff >= c.effectifMax ? 'La classe ' + c.nom + ' est complète (' + eff + '/' + c.effectifMax + ').' : ''; }
      });
      if (!v) return;
      try { const r = await app.admit(a.id, v.classId, v.admission); app.notify(fullName(a) + ' est admis(e) en ' + r.classe); if (r.comptes.some(c => c.pwd)) await app.showCredentials(r.comptes, 'Accès créés pour ' + fullName(a)); } catch (e) { app.notify(e.message, 'bad'); }
    }
  }]
};

CFG.classes = {
  key: 'classes', icon: 'school', title: 'Classes et sections', sub: 'Organisation des classes, titulaires et effectifs.', nl: 'Nouvelle classe', singular: 'classe', rowTitle: c => c.nom,
  fields: [{ k: 'nom', l: 'Nom de la classe', req: true, ph: '6ème A' }, { k: 'niveau', l: 'Niveau', t: 'select', o: LISTF('classes.niveau'), req: true }, { k: 'section', l: 'Section', ph: 'A' },
    { k: 'titulaireId', l: 'Professeur principal', t: 'ref', ref: 'teachers' }, { k: 'effectifMax', l: 'Effectif maximum', t: 'num', min: 1, req: true }, { k: 'salle', l: 'Salle' }],
  defaults: () => ({ effectifMax: 40 }),
  cols: ['nom', 'niveau', { l: 'Professeur principal', v: (c, db) => refLabel(db, 'teachers', c.titulaireId) }, { l: 'Effectif', v: (c, db) => db.students.filter(s => s.classId === c.id && s.statut === 'Actif').length + ' / ' + c.effectifMax, mono: true }, 'salle'],
  sort: (a, b) => a.nom.localeCompare(b.nom, 'fr'), delMsg: 'Les élèves de cette classe ne seront pas supprimés mais n’auront plus de classe valide.'
};

CFG.subjects = {
  key: 'subjects', icon: 'book', title: 'Matières', sub: 'Disciplines enseignées et coefficients utilisés pour les moyennes.', nl: 'Nouvelle matière', singular: 'matière', rowTitle: s => s.nom,
  fields: [{ k: 'nom', l: 'Matière', req: true }, { k: 'code', l: 'Code', req: true, ph: 'MATH' }, { k: 'coef', l: 'Coefficient', t: 'num', min: 1, max: 10, req: true }],
  defaults: () => ({ coef: 2 }), cols: ['nom', 'code', { l: 'Coefficient', v: s => s.coef, num: true }], sort: (a, b) => a.nom.localeCompare(b.nom, 'fr')
};

CFG.teachers = {
  key: 'teachers', icon: 'users', title: 'Enseignants', sub: 'Équipe pédagogique et matières enseignées.', nl: 'Nouvel enseignant', singular: 'enseignant', rowTitle: t => fullName(t),
  fields: [{ k: 'matricule', l: 'Matricule', req: true, ph: 'ENS-009', check: (v, vals, db, ed) => db.teachers.some(t => t.matricule === v && (!ed || t.id !== ed.id)) ? 'Matricule déjà utilisé' : '' }, { k: 'statut', l: 'Statut', t: 'select', o: LISTF('teachers.statut'), req: true },
    { k: 'prenom', l: 'Prénom', req: true }, { k: 'nom', l: 'Nom', req: true }, { k: 'sexe', l: 'Sexe', t: 'select', o: SEXE }, { k: 'specialite', l: 'Spécialité' },
    { k: 'tel', l: 'Téléphone', t: 'tel', check: PHONE }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'embauche', l: 'Date d’embauche', t: 'date' }],
  defaults: db => ({ matricule: 'ENS-' + pad(nextSeq(db.teachers, 'matricule')), statut: 'Permanent' }),
  cols: [{ l: 'Matricule', v: t => t.matricule, mono: true }, { l: 'Enseignant', v: t => fullName(t) }, 'specialite', { l: 'Classes', v: (t, db) => [...new Set(db.assignments.filter(a => a.teacherId === t.id).map(a => clsName(db, a.classId)))].join(', ') || '—' }, { l: 'Statut', v: t => t.statut, r: t => B(t.statut === 'Permanent' ? 'ok' : 'info', t.statut) }, 'tel'],
  sort: byName
};

CFG.assignments = {
  key: 'assignments', icon: 'swap', title: 'Affectations', sub: 'Qui enseigne quelle matière dans quelle classe, et pour combien d’heures par semaine.', nl: 'Nouvelle affectation', singular: 'affectation', rowTitle: () => 'affectation',
  fields: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true }, { k: 'subjectId', l: 'Matière', t: 'ref', ref: 'subjects', req: true }, { k: 'teacherId', l: 'Enseignant', t: 'ref', ref: 'teachers', req: true }, { k: 'heures', l: 'Heures par semaine', t: 'num', min: 1, max: 12, req: true }],
  validate: (v, db, ed) => db.assignments.some(a => a.classId === v.classId && a.subjectId === v.subjectId && (!ed || a.id !== ed.id)) ? 'Cette matière a déjà un enseignant dans cette classe. Modifiez l’affectation existante.' : '',
  cols: ['classId', 'subjectId', 'teacherId', { l: 'Heures / sem.', v: a => a.heures, num: true }],
  filters: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes' }, { k: 'teacherId', l: 'Enseignant', t: 'ref', ref: 'teachers' }],
  sort: (a, b) => a.classId.localeCompare(b.classId)
};

const SRC_LABEL = { inscription: 'Inscription en ligne', admission: 'Admission', manuel: 'Créé par la direction', installation: 'Installation' };
CFG.users = {
  key: 'users', icon: 'shield', title: 'Utilisateurs et rôles', sub: 'Comptes du personnel, des élèves, des parents et des familles candidates. Les droits de chaque rôle se règlent dans « Autorisations ».', nl: 'Nouvel utilisateur', singular: 'utilisateur', rowTitle: u => u.nom, custom: false,
  headExtra: app => html`<${Btn} icon="shield" onClick=${() => app.go('perms')}>Autorisations<//>`,
  fields: [{ k: 'nom', l: 'Nom complet', req: true },
    { k: 'email', l: 'E-mail', t: 'email', hint: 'Facultatif si vous indiquez un identifiant.' },
    { k: 'login', l: 'Identifiant de connexion', hint: 'Laissez vide pour utiliser l’e-mail. Peut être un numéro de téléphone ou un n° d’admission.', check: (v, vals, db, ed) => { const key = loginKey_(v || vals.email); if (!key) return 'Indiquez un e-mail ou un identifiant'; return db.users.some(u => u.id !== (ed && ed.id) && (u.login === key || u.email === key)) ? 'Cet identifiant a déjà un compte' : ''; } },
    { k: 'role', l: 'Rôle', t: 'select', o: ROLES.map(([v, l]) => ({ v, l })), req: true },
    { k: 'linkId', l: 'Fiche liée', t: 'select', show: v => ['enseignant', 'eleve', 'parent'].includes(v.role), hint: 'Relie le compte à l’enseignant, l’élève ou le parent concerné.', o: (v, db) => v.role === 'enseignant' ? teacherOptions(db) : v.role === 'eleve' ? db.students.map(s => ({ v: s.id, l: LABEL.students(s, db) })) : v.role === 'parent' ? db.parents.map(p => ({ v: p.id, l: fullName(p) })) : [] },
    { k: 'tel', l: 'Téléphone', t: 'tel' }, { k: 'actif', l: 'Compte', t: 'bool', cl: 'Actif' },
    { k: 'pwd', l: 'Mot de passe provisoire', t: 'text', req: true, show: v => IN_GAS && !v.id, hint: '8 caractères minimum. La personne devra le changer à sa première connexion.', check: x => x && x.length < 8 ? 'Au moins 8 caractères' : '' }],
  defaults: () => ({ role: 'enseignant', actif: true }),
  beforeSave: (v, db, app, row) => { const o = { ...v }; delete o.pwd; o.email = String(o.email || '').trim().toLowerCase(); o.login = loginKey_(o.login || o.email); o.source = row ? row.source : 'manuel'; return o; },
  afterSave: async (saved, db, app, v) => { if (IN_GAS && v.pwd) { try { await Api.setPassword(saved.id, v.pwd); app.notify('Mot de passe provisoire défini pour ' + saved.nom); } catch (e) { app.notify(e.message, 'bad'); } } },
  cols: ['nom', { l: 'Identifiant', v: u => u.login || u.email, mono: true }, { l: 'Rôle', v: u => ROLE_LABEL[u.role], r: u => B(u.role === 'admin' ? 'accent' : u.role === 'candidat' ? 'warn' : 'info', ROLE_LABEL[u.role]) }, { l: 'Origine', v: u => SRC_LABEL[u.source] || '', r: u => html`${SRC_LABEL[u.source] || '—'}${u.mustChange && html` ${B('warn', 'Mot de passe provisoire')}`}` }, { l: 'Compte', v: u => u.actif ? 'Actif' : 'Désactivé', r: u => B(u.actif ? 'ok' : 'mute', u.actif ? 'Actif' : 'Désactivé') }],
  filters: [{ k: 'role', l: 'Rôle', t: 'select', o: ROLES.map(([v, l]) => ({ v, l })) }],
  sort: byName, delMsg: 'Cet utilisateur ne pourra plus ouvrir l’application.',
  rowActions: IN_GAS ? [{ l: 'Mot de passe', i: 'shield', run: async (u, app) => { const v = await app.ask({ title: 'Nouveau mot de passe provisoire pour ' + u.nom, message: 'Communiquez ce mot de passe à la personne. Elle devra le remplacer par un mot de passe de son choix dès sa première connexion.', fields: [{ k: 'pwd', l: 'Mot de passe provisoire', t: 'text', req: true, hint: '8 caractères minimum.', check: x => x && x.length < 8 ? 'Au moins 8 caractères' : '' }], submit: 'Enregistrer' }); if (!v) return; try { await Api.setPassword(u.id, v.pwd); await app.reload(); app.notify('Mot de passe provisoire défini pour ' + u.nom); } catch (e) { app.notify(e.message, 'bad'); } } }] : []
};

CFG.exams = {
  key: 'exams', icon: 'clip', title: 'Examens et évaluations', sub: 'Programmation des devoirs et compositions, classe par classe.', nl: 'Nouvelle épreuve', singular: 'épreuve', rowTitle: (e, db) => LABEL.exams(e, db),
  fields: [{ k: 'session', l: 'Session', req: true, ph: 'Composition 1 – T1', hint: 'Les épreuves d’une même session sont regroupées dans les résultats et les convocations.', list: db => [...new Set(db.exams.map(e => e.session))] },
    { k: 'type', l: 'Type', t: 'select', o: LISTF('exams.type'), req: true },
    { k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true }, { k: 'subjectId', l: 'Matière', t: 'ref', ref: 'subjects', req: true },
    dateF('date', 'Date'), { k: 'heure', l: 'Heure', t: 'time', req: true }, { k: 'duree', l: 'Durée (minutes)', t: 'num', min: 15, req: true }, { k: 'salle', l: 'Salle' },
    { k: 'noteMax', l: 'Barème (note maximale)', t: 'num', min: 1, req: true }, { k: 'trimestre', l: 'Trimestre', t: 'select', o: ['T1', 'T2', 'T3'], req: true }],
  defaults: () => ({ type: 'Devoir', heure: '08:00', duree: 60, noteMax: 20, trimestre: 'T1', date: todayStr() }),
  onChange: (v, k, db) => k === 'classId' && !v.salle ? { salle: (db.classes.find(c => c.id === v.classId) || {}).salle || '' } : null,
  validate: (v, db, ed) => db.exams.some(e => e.classId === v.classId && e.subjectId === v.subjectId && e.session === v.session && (!ed || e.id !== ed.id)) ? 'Cette matière est déjà programmée pour cette classe dans cette session.' : '',
  cols: [{ l: 'Session', v: e => e.session }, 'classId', 'subjectId', { l: 'Date', v: e => fmtDate(e.date) + ' · ' + e.heure, mono: true }, { l: 'Durée', v: e => e.duree + ' min', mono: true }, 'salle', { l: 'Notes saisies', v: (e, db) => db.marks.filter(m => m.examId === e.id).length, num: true }],
  filters: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes' }, { k: 'session', l: 'Session', t: 'select', o: db => [...new Set(db.exams.map(e => e.session))] }],
  sort: (a, b) => b.date.localeCompare(a.date) || a.classId.localeCompare(b.classId), delMsg: 'Les notes saisies pour cette épreuve seront conservées mais ne seront plus rattachées à une épreuve.'
};

const scopeTeacher = (rows, app) => app.me.role === 'enseignant' ? rows.filter(r => r.teacherId === app.me.linkId) : rows;
const teacherField = app => ({ k: 'teacherId', l: 'Enseignant', t: 'ref', ref: 'teachers', req: true, ro: app.me.role === 'enseignant' });
CFG.lessons = {
  key: 'lessons', icon: 'book', title: 'Plan de cours', sub: 'Séances préparées par les enseignants : objectifs, date et état d’avancement.', nl: 'Nouvelle séance', singular: 'séance', rowTitle: l => l.titre,
  fields: app => [teacherField(app), { k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true }, { k: 'subjectId', l: 'Matière', t: 'ref', ref: 'subjects', req: true }, { k: 'statut', l: 'Avancement', t: 'select', o: ['Prévu', 'Fait', 'Reporté'], req: true },
    { k: 'titre', l: 'Titre de la séance', req: true, w: 'full' }, { k: 'objectifs', l: 'Objectifs', t: 'area' }, dateF('date', 'Date'), { k: 'duree', l: 'Durée (minutes)', t: 'num', min: 15, req: true }],
  defaults: (db, app) => ({ teacherId: app.me.role === 'enseignant' ? app.me.linkId : '', date: todayStr(), duree: 60, statut: 'Prévu' }),
  scope: scopeTeacher,
  cols: [{ l: 'Date', v: l => fmtDate(l.date) }, { l: 'Séance', v: l => l.titre }, 'classId', 'subjectId', 'teacherId', { l: 'Avancement', v: l => l.statut, r: l => B(l.statut === 'Fait' ? 'ok' : l.statut === 'Reporté' ? 'warn' : 'info', l.statut) }],
  filters: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes' }, { k: 'statut', l: 'Avancement', t: 'select', o: ['Prévu', 'Fait', 'Reporté'] }],
  sort: (a, b) => b.date.localeCompare(a.date)
};
CFG.logbook = {
  key: 'logbook', icon: 'book', title: 'Cahier de textes', sub: 'Ce qui a été enseigné chaque jour et les devoirs donnés.', nl: 'Nouvelle entrée', singular: 'entrée', rowTitle: l => fmtDate(l.date),
  fields: app => [dateF('date', 'Date'), teacherField(app), { k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true }, { k: 'subjectId', l: 'Matière', t: 'ref', ref: 'subjects', req: true }, { k: 'contenu', l: 'Contenu de la séance', t: 'area', req: true }, { k: 'devoirs', l: 'Devoirs à faire', t: 'area' }],
  defaults: (db, app) => ({ teacherId: app.me.role === 'enseignant' ? app.me.linkId : '', date: todayStr() }),
  scope: scopeTeacher,
  cols: [{ l: 'Date', v: l => fmtDate(l.date) }, 'classId', 'subjectId', 'teacherId', { l: 'Contenu', v: l => l.contenu }, { l: 'Devoirs', v: l => l.devoirs }],
  filters: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes' }], sort: (a, b) => b.date.localeCompare(a.date)
};
CFG.substitutes = {
  key: 'substitutes', icon: 'swap', title: 'Remplacements', sub: 'Affectation d’un enseignant remplaçant lorsqu’un titulaire est absent.', nl: 'Nouveau remplacement', singular: 'remplacement', rowTitle: () => 'remplacement',
  fields: [dateF('date', 'Date'), { k: 'periodId', l: 'Période', t: 'ref', ref: 'periods', req: true, fl: p => !p.pause }, { k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true },
    { k: 'absentId', l: 'Enseignant absent', t: 'ref', ref: 'teachers', req: true }, { k: 'substituteId', l: 'Remplaçant', t: 'ref', ref: 'teachers', req: true }, { k: 'motif', l: 'Motif', w: 'full' }],
  defaults: () => ({ date: todayStr() }),
  validate: (v, db) => {
    if (v.absentId === v.substituteId) return 'Le remplaçant doit être différent de l’enseignant absent.';
    const j = dow(v.date), busy = db.timetable.find(t => t.teacherId === v.substituteId && t.jour === j && t.periodId === v.periodId);
    return busy ? 'Ce remplaçant donne déjà cours en ' + clsName(db, busy.classId) + ' à cette période.' : '';
  },
  cols: [{ l: 'Date', v: s => fmtDate(s.date) }, 'periodId', 'classId', { l: 'Absent', v: (s, db) => refLabel(db, 'teachers', s.absentId) }, { l: 'Remplaçant', v: (s, db) => refLabel(db, 'teachers', s.substituteId) }, 'motif'],
  sort: (a, b) => b.date.localeCompare(a.date)
};

const CONDUCT_TONE = { 'Éloge': 'ok', 'Avertissement': 'warn', 'Retenue': 'warn', 'Blâme': 'bad', 'Exclusion temporaire': 'bad' };
CFG.conduct = {
  key: 'conduct', icon: 'shield', title: 'Conduite et discipline', sub: 'Éloges, avertissements et sanctions inscrits au dossier de l’élève.', nl: 'Nouvelle mention', singular: 'mention', rowTitle: () => 'mention de conduite',
  fields: app => [dateF('date', 'Date'), { k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full' }, { k: 'type', l: 'Nature', t: 'select', o: Object.keys(CONDUCT_TONE), req: true }, { k: 'gravite', l: 'Gravité', t: 'select', o: ['Faible', 'Moyenne', 'Grave'], req: true }, { k: 'description', l: 'Description', t: 'area', req: true }, { k: 'signalePar', l: 'Signalé par', req: true }],
  defaults: (db, app) => ({ date: todayStr(), gravite: 'Faible', signalePar: app.me.nom }),
  cols: [{ l: 'Date', v: c => fmtDate(c.date) }, { l: 'Élève', v: (c, db) => refLabel(db, 'students', c.studentId) }, { l: 'Nature', v: c => c.type, r: c => B(CONDUCT_TONE[c.type] || 'mute', c.type) }, 'gravite', { l: 'Description', v: c => c.description }, { l: 'Signalé par', v: c => c.signalePar }],
  filters: [{ k: 'type', l: 'Nature', t: 'select', o: Object.keys(CONDUCT_TONE) }], sort: (a, b) => b.date.localeCompare(a.date)
};
CFG.activities = {
  key: 'activities', icon: 'award', title: 'Activités extrascolaires', sub: 'Sport, culture, clubs et concours auxquels participent les élèves.', nl: 'Nouvelle activité', singular: 'activité', rowTitle: a => a.activite,
  fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full' }, { k: 'activite', l: 'Activité', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: LISTF('activities.categorie'), req: true }, dateF('date', 'Date de début'), { k: 'resultat', l: 'Rôle ou résultat' }],
  defaults: () => ({ date: todayStr() }),
  cols: [{ l: 'Élève', v: (a, db) => refLabel(db, 'students', a.studentId) }, 'activite', 'categorie', { l: 'Début', v: a => fmtDate(a.date) }, { l: 'Rôle / résultat', v: a => a.resultat }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: LISTD('activities.categorie') }], sort: (a, b) => b.date.localeCompare(a.date)
};

const myKids = app => app.db.students.filter(s => app.me.role === 'eleve' ? s.id === app.me.linkId : s.parentId === app.me.linkId);
CFG.ptm = {
  key: 'ptm', icon: 'cal', title: 'Réunions parents-professeurs', sub: 'Créneaux de rencontre proposés par les enseignants. Les parents réservent un créneau libre.', nl: 'Nouveau créneau', singular: 'créneau', rowTitle: r => fmtDate(r.date) + ' ' + r.heure,
  fields: [dateF('date', 'Date'), { k: 'heure', l: 'Heure', t: 'time', req: true }, { k: 'teacherId', l: 'Enseignant', t: 'ref', ref: 'teachers', req: true }, { k: 'statut', l: 'Statut', t: 'select', o: ['Libre', 'Réservé', 'Terminé'], req: true },
    { k: 'parentId', l: 'Parent', t: 'ref', ref: 'parents', show: v => v.statut !== 'Libre' }, { k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', show: v => v.statut !== 'Libre' }, { k: 'motif', l: 'Motif', show: v => v.statut !== 'Libre', w: 'full' }],
  defaults: () => ({ date: todayStr(), heure: '15:00', statut: 'Libre' }),
  scope: (rows, app) => app.me.role === 'parent' ? rows.filter(r => r.statut === 'Libre' || r.parentId === app.me.linkId) : app.me.role === 'enseignant' ? rows.filter(r => r.teacherId === app.me.linkId) : rows,
  cols: [{ l: 'Date', v: r => fmtDate(r.date) + ' · ' + r.heure, mono: true }, 'teacherId', { l: 'Statut', v: r => r.statut, r: r => B(r.statut === 'Libre' ? 'ok' : r.statut === 'Réservé' ? 'info' : 'mute', r.statut) }, { l: 'Parent', v: (r, db) => refLabel(db, 'parents', r.parentId) }, { l: 'Élève', v: (r, db) => refLabel(db, 'students', r.studentId) }, 'motif'],
  filters: [{ k: 'statut', l: 'Statut', t: 'select', o: ['Libre', 'Réservé', 'Terminé'] }], sort: (a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure),
  rowActions: [
    {
      l: 'Réserver', i: 'cal', open: true, show: (r, app) => r.statut === 'Libre' && ['parent', 'admin', 'secretaire'].includes(app.me.role),
      run: async (r, app) => {
        const kids = app.me.role === 'parent' ? myKids(app) : app.db.students;
        const v = await app.ask({ title: 'Réserver le ' + fmtDate(r.date) + ' à ' + r.heure, fields: [{ k: 'studentId', l: 'Élève concerné', t: 'select', o: kids.map(s => ({ v: s.id, l: LABEL.students(s, app.db) })), req: true }, { k: 'motif', l: 'Motif de la rencontre', req: true }], submit: 'Réserver' });
        if (!v) return; const st = app.db.students.find(s => s.id === v.studentId);
        await app.save('ptm', { ...r, statut: 'Réservé', parentId: st.parentId || (app.me.role === 'parent' ? app.me.linkId : ''), studentId: st.id, motif: v.motif }); app.notify('Créneau réservé');
      }
    },
    { l: 'Libérer', i: 'x', open: true, show: (r, app) => r.statut === 'Réservé' && (app.me.role !== 'parent' || r.parentId === app.me.linkId) && app.me.role !== 'eleve', run: async (r, app) => { await app.save('ptm', { ...r, statut: 'Libre', parentId: '', studentId: '', motif: '' }); app.notify('Créneau libéré'); } }]
};

CFG.notices = {
  key: 'notices', icon: 'bell', title: 'Avis et annonces', sub: 'Tableau d’affichage de l’école. Chaque avis s’adresse à un public précis.', nl: 'Nouvel avis', singular: 'avis', rowTitle: n => n.titre,
  fields: app => [{ k: 'titre', l: 'Titre', req: true, w: 'full' }, { k: 'contenu', l: 'Message', t: 'area', req: true, rows: 5 }, dateF('date', 'Date de publication'), { k: 'cible', l: 'Destinataires', t: 'select', o: ['Tous', 'Parents', 'Élèves', 'Enseignants', 'Personnel'], req: true }, { k: 'epingle', l: 'Mise en avant', t: 'bool', cl: 'Épingler en haut' }, { k: 'auteur', l: 'Auteur' }],
  defaults: (db, app) => ({ date: todayStr(), cible: 'Tous', auteur: app.me.nom }),
  scope: (rows, app) => { const r = app.me.role; if (r === 'admin' || r === 'secretaire') return rows; const tg = { enseignant: ['Tous', 'Enseignants', 'Personnel'], surveillant: ['Tous', 'Personnel'], eleve: ['Tous', 'Élèves'], parent: ['Tous', 'Parents'] }[r] || ['Tous']; return rows.filter(n => tg.includes(n.cible)); },
  sort: (a, b) => (b.epingle - a.epingle) || b.date.localeCompare(a.date),
  cols: ['titre'],
  card: n => html`<header><h3>${n.epingle && html`<${Icon} n="bell" s=${15} />`} ${n.titre}</h3><div>${B('info', n.cible)}</div></header><p>${n.contenu}</p><footer><span>${fmtDate(n.date)}</span><span>${n.auteur}</span></footer>`
};

CFG.events = {
  key: 'events', icon: 'cal', title: 'Calendrier scolaire', sub: 'Examens, réunions, fêtes et vacances de l’année.', nl: 'Nouvel événement', singular: 'événement', rowTitle: e => e.titre,
  fields: [{ k: 'titre', l: 'Événement', req: true, w: 'full' }, dateF('date', 'Début'), { k: 'fin', l: 'Fin', t: 'date', check: (v, vals) => v && vals.date && v < vals.date ? 'La fin précède le début' : '' }, { k: 'categorie', l: 'Catégorie', t: 'select', o: LISTF('events.categorie'), req: true }, { k: 'lieu', l: 'Lieu' }],
  defaults: () => ({ date: todayStr(), categorie: 'Réunion' }),
  topView: app => html`<${MonthGrid} />`,
  cols: ['titre', { l: 'Dates', v: e => fmtDate(e.date) + (e.fin && e.fin !== e.date ? ' → ' + fmtDate(e.fin) : '') }, { l: 'Catégorie', v: e => e.categorie, r: e => B(EVT_TONE[e.categorie] || 'mute', e.categorie) }, 'lieu'],
  sort: (a, b) => a.date.localeCompare(b.date)
};
const EVT_TONE = { Examen: 'bad', Réunion: 'info', Fête: 'ok', Vacances: 'warn', Autre: 'mute' };

CFG.tickets = {
  key: 'tickets', icon: 'help', title: 'Assistance', sub: 'Demandes d’intervention et incidents, avec suivi des délais de traitement.', nl: 'Nouvelle demande', singular: 'demande', rowTitle: t => t.titre,
  fields: [{ k: 'titre', l: 'Objet', req: true, w: 'full' }, { k: 'description', l: 'Détails', t: 'area' }, { k: 'priorite', l: 'Priorité', t: 'select', req: true, o: Object.keys(SLA), hint: (v) => v.priorite ? 'Délai de traitement : ' + (SLA[v.priorite] < 48 ? SLA[v.priorite] + ' heures' : SLA[v.priorite] / 24 + ' jours') : '' }, { k: 'statut', l: 'Statut', t: 'select', o: ['Ouvert', 'En cours', 'Résolu', 'Fermé'], req: true }, { k: 'assigneId', l: 'Assigné à', t: 'ref', ref: 'users', fl: u => u.role !== 'eleve' && u.role !== 'parent' }],
  defaults: () => ({ priorite: 'Normale', statut: 'Ouvert' }),
  beforeSave: (v, db, app, row) => row ? v : { ...v, cree: new Date().toISOString(), creePar: app.me.nom },
  cols: [{ l: 'Créée', v: t => fmtDT(t.cree) }, { l: 'Objet', v: t => t.titre }, { l: 'Priorité', v: t => t.priorite, r: t => B({ Urgente: 'bad', Haute: 'warn', Normale: 'info', Basse: 'mute' }[t.priorite], t.priorite) }, { l: 'Statut', v: t => t.statut, r: t => B(t.statut === 'Résolu' || t.statut === 'Fermé' ? 'ok' : t.statut === 'En cours' ? 'info' : 'warn', t.statut) }, { l: 'Délai', v: t => slaInfo(t).txt, r: t => B(slaInfo(t).tone, slaInfo(t).txt) }, { l: 'Assigné à', v: (t, db) => refLabel(db, 'users', t.assigneId) }, { l: 'Par', v: t => t.creePar }],
  filters: [{ k: 'statut', l: 'Statut', t: 'select', o: ['Ouvert', 'En cours', 'Résolu', 'Fermé'] }, { k: 'priorite', l: 'Priorité', t: 'select', o: Object.keys(SLA) }],
  sort: (a, b) => b.cree.localeCompare(a.cree)
};

CFG.documents = {
  key: 'documents', icon: 'file', title: 'Documents', sub: 'Pièces des dossiers élèves : dépôt, vérification et alertes d’expiration.', nl: 'Nouveau document', singular: 'document', rowTitle: d => d.titre,
  fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full' }, { k: 'type', l: 'Type de pièce', t: 'select', o: LISTF('documents.type'), req: true }, { k: 'titre', l: 'Intitulé', req: true }, { k: 'fichier', l: 'Fichier', t: 'file', hint: 'Seul le nom du fichier est enregistré dans la feuille de calcul.' }, { k: 'expiration', l: 'Date d’expiration', t: 'date' }, { k: 'verifie', l: 'Vérification', t: 'bool', cl: 'Document vérifié' }],
  defaults: () => ({ verifie: false }),
  onChange: (v, k, db) => k === 'type' && !v.titre ? { titre: v.type } : null,
  cols: [{ l: 'Intitulé', v: d => d.titre }, { l: 'Élève', v: (d, db) => refLabel(db, 'students', d.studentId) }, { l: 'Fichier', v: d => d.fichier, mono: true }, { l: 'Vérifié', v: d => d.verifie ? 'Oui' : 'Non', r: d => B(d.verifie ? 'ok' : 'warn', d.verifie ? 'Vérifié' : 'À vérifier') }, { l: 'Échéance', v: d => expInfo(d.expiration).txt, r: d => B(expInfo(d.expiration).tone, expInfo(d.expiration).txt) }],
  filters: [{ k: 'type', l: 'Type', t: 'select', o: LISTD('documents.type') }],
  sort: (a, b) => (a.expiration || '9999').localeCompare(b.expiration || '9999'),
  rowActions: [{ l: 'Vérifier', i: 'check', show: d => !d.verifie, run: async (d, app) => { await app.save('documents', { ...d, verifie: true }); app.notify('Document marqué comme vérifié'); } }]
};

CFG.assets = {
  key: 'assets', icon: 'tool', title: 'Équipements', sub: 'Registre des biens de l’école et historique d’entretien.', nl: 'Nouvel équipement', singular: 'équipement', rowTitle: a => a.nom,
  fields: [{ k: 'tag', l: 'Code d’inventaire', req: true, ph: 'IMM-007', check: (v, vals, db, ed) => db.assets.some(a => a.tag === v && (!ed || a.id !== ed.id)) ? 'Code déjà utilisé' : '' }, { k: 'nom', l: 'Désignation', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: LISTF('assets.categorie'), req: true }, { k: 'lieu', l: 'Emplacement' },
    { k: 'achat', l: 'Date d’achat', t: 'date' }, { k: 'valeur', l: 'Valeur d’achat (FCFA)', t: 'num', min: 0, step: 1000 }, { k: 'etat', l: 'État', t: 'select', o: ['Bon', 'Passable', 'Usagé', 'En panne'], req: true }, { k: 'responsable', l: 'Responsable' }],
  defaults: db => ({ tag: 'IMM-' + pad(nextSeq(db.assets, 'tag')), etat: 'Bon' }),
  cols: [{ l: 'Code', v: a => a.tag, mono: true }, 'nom', 'categorie', 'lieu', { l: 'Valeur', v: a => money(a.valeur), num: true }, { l: 'État', v: a => a.etat, r: a => B({ Bon: 'ok', Passable: 'info', Usagé: 'warn', 'En panne': 'bad' }[a.etat], a.etat) }, { l: 'Dernier entretien', v: (a, db) => { const m = db.maintenance.filter(x => x.assetId === a.id).sort((p, q) => q.date.localeCompare(p.date))[0]; return m ? fmtDate(m.date) : '—'; } }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: LISTD('assets.categorie') }, { k: 'etat', l: 'État', t: 'select', o: ['Bon', 'Passable', 'Usagé', 'En panne'] }],
  sort: (a, b) => a.tag.localeCompare(b.tag),
  rowActions: [
    { l: 'Entretien', i: 'tool', run: async (a, app) => { const v = await app.ask({ title: 'Enregistrer un entretien — ' + a.nom, fields: [dateF('date', 'Date'), { k: 'type', l: 'Type', t: 'select', o: ['Préventive', 'Corrective'], req: true }, { k: 'description', l: 'Intervention', req: true, w: 'full' }, { k: 'cout', l: 'Coût (FCFA)', t: 'num', min: 0, step: 500 }, { k: 'technicien', l: 'Technicien' }], initial: { date: todayStr(), type: 'Préventive' }, submit: 'Enregistrer' }); if (!v) return; await app.save('maintenance', { ...v, assetId: a.id }); app.notify('Entretien enregistré'); } },
    { l: 'Historique', i: 'clock', open: true, run: (a, app) => app.ask({ title: 'Historique — ' + a.nom, noCancel: true, submit: 'Fermer', extra: () => { const h = app.db.maintenance.filter(m => m.assetId === a.id).sort((p, q) => q.date.localeCompare(p.date)); return h.length ? html`<div className="tablewrap"><table className="t"><thead><tr><th>Date</th><th>Type</th><th>Intervention</th><th className="num">Coût</th></tr></thead><tbody>${h.map(m => html`<tr key=${m.id}><td>${fmtDate(m.date)}</td><td>${m.type}</td><td>${m.description}</td><td className="num mono">${money(m.cout)}</td></tr>`)}</tbody></table></div>` : html`<p className="muted">Aucun entretien enregistré pour cet équipement.</p>`; } }) }]
};
CFG.maintenance = {
  key: 'maintenance', icon: 'tool', title: 'Entretien et maintenance', sub: 'Toutes les interventions réalisées sur les équipements.', nl: 'Nouvelle intervention', singular: 'intervention', rowTitle: () => 'intervention',
  fields: [{ k: 'assetId', l: 'Équipement', t: 'ref', ref: 'assets', req: true, w: 'full' }, dateF('date', 'Date'), { k: 'type', l: 'Type', t: 'select', o: ['Préventive', 'Corrective'], req: true }, { k: 'description', l: 'Intervention', req: true, w: 'full' }, { k: 'cout', l: 'Coût (FCFA)', t: 'num', min: 0, step: 500 }, { k: 'technicien', l: 'Technicien' }],
  defaults: () => ({ date: todayStr(), type: 'Préventive' }),
  cols: [{ l: 'Date', v: m => fmtDate(m.date) }, { l: 'Équipement', v: (m, db) => refLabel(db, 'assets', m.assetId) }, 'type', 'description', { l: 'Coût', v: m => money(m.cout), num: true }, 'technicien'],
  filters: [{ k: 'type', l: 'Type', t: 'select', o: ['Préventive', 'Corrective'] }], sort: (a, b) => b.date.localeCompare(a.date)
};

CFG.stock = {
  key: 'stock', icon: 'box', title: 'Stock', sub: 'Fournitures et consommables. Les quantités se calculent à partir des mouvements.', nl: 'Nouvel article', singular: 'article', rowTitle: s => s.nom,
  fields: [{ k: 'code', l: 'Code article', req: true, check: (v, vals, db, ed) => db.stock.some(s => s.code === v && (!ed || s.id !== ed.id)) ? 'Code déjà utilisé' : '' }, { k: 'nom', l: 'Désignation', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: LISTF('stock.categorie'), req: true }, { k: 'unite', l: 'Unité', req: true, ph: 'pièce, boîte, ramette…' },
    { k: 'initial', l: 'Quantité initiale', t: 'num', min: 0, req: true }, { k: 'seuil', l: 'Seuil de réapprovisionnement', t: 'num', min: 0, req: true }, { k: 'prix', l: 'Prix unitaire (FCFA)', t: 'num', min: 0, step: 50 }],
  defaults: () => ({ initial: 0, seuil: 5, unite: 'pièce' }),
  cols: [{ l: 'Code', v: s => s.code, mono: true }, 'nom', 'categorie', { l: 'Quantité', v: (s, db) => stockQty(db, s) + ' ' + s.unite, num: true }, { l: 'Seuil', v: s => s.seuil, num: true }, { l: 'Valeur', v: (s, db) => money(stockQty(db, s) * s.prix), num: true }, { l: 'Statut', v: (s, db) => stockQty(db, s) <= 0 ? 'Rupture' : stockQty(db, s) <= s.seuil ? 'À réapprovisionner' : 'Suffisant', r: (s, db) => { const q = stockQty(db, s); return q <= 0 ? B('bad', 'Rupture') : q <= s.seuil ? B('warn', 'À réapprovisionner') : B('ok', 'Suffisant'); } }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: LISTD('stock.categorie') }],
  sort: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
  rowActions: ['Entrée', 'Sortie'].map(type => ({
    l: type, i: type === 'Entrée' ? 'plus' : 'swap',
    run: async (s, app) => {
      const v = await app.ask({ title: type + ' de stock — ' + s.nom, fields: [dateF('date', 'Date'), { k: 'quantite', l: 'Quantité (' + s.unite + ')', t: 'num', min: 1, req: true }, { k: 'motif', l: 'Motif', req: true, w: 'full' }], initial: { date: todayStr() }, submit: 'Enregistrer', validate: vals => type === 'Sortie' && vals.quantite > stockQty(app.db, s) ? 'Stock insuffisant : il reste ' + stockQty(app.db, s) + ' ' + s.unite + '.' : '' });
      if (!v) return; await app.save('stockTx', { ...v, itemId: s.id, type }); app.notify(type + ' enregistrée');
    }
  }))
};
CFG.stockTx = {
  key: 'stockTx', icon: 'swap', title: 'Mouvements de stock', sub: 'Entrées et sorties, de la plus récente à la plus ancienne.', nl: 'Nouveau mouvement', singular: 'mouvement', rowTitle: () => 'mouvement',
  fields: [{ k: 'itemId', l: 'Article', t: 'ref', ref: 'stock', req: true, w: 'full' }, dateF('date', 'Date'), { k: 'type', l: 'Sens', t: 'select', o: ['Entrée', 'Sortie'], req: true }, { k: 'quantite', l: 'Quantité', t: 'num', min: 1, req: true }, { k: 'motif', l: 'Motif', req: true }],
  defaults: () => ({ date: todayStr(), type: 'Sortie' }),
  validate: (v, db, ed) => { if (v.type !== 'Sortie') return ''; const it = db.stock.find(s => s.id === v.itemId); const dispo = it ? stockQty(db, it) + (ed && ed.itemId === v.itemId && ed.type === 'Sortie' ? ed.quantite : 0) : 0; return it && v.quantite > dispo ? 'Stock insuffisant : il reste ' + dispo + ' ' + it.unite + '.' : ''; },
  cols: [{ l: 'Date', v: t => fmtDate(t.date) }, { l: 'Article', v: (t, db) => refLabel(db, 'stock', t.itemId) }, { l: 'Sens', v: t => t.type, r: t => B(t.type === 'Entrée' ? 'ok' : 'warn', t.type) }, { l: 'Quantité', v: t => t.quantite, num: true }, 'motif'],
  filters: [{ k: 'type', l: 'Sens', t: 'select', o: ['Entrée', 'Sortie'] }, { k: 'itemId', l: 'Article', t: 'ref', ref: 'stock' }], sort: (a, b) => b.date.localeCompare(a.date)
};

CFG.feeStructure = {
  key: 'feeStructure', icon: 'cash', title: 'Frais de scolarité', sub: 'Montants en francs CFA par classe. Ils servent de base à l’encaissement et au suivi des impayés.', nl: 'Nouveau barème', singular: 'barème', rowTitle: (f, db) => clsName(db, f.classId),
  fields: [{ k: 'classId', l: 'Classe', t: 'ref', ref: 'classes', req: true, check: (v, vals, db, ed) => db.feeStructure.some(f => f.classId === v && (!ed || f.id !== ed.id)) ? 'Cette classe a déjà un barème' : '' }, { k: 'inscription', l: 'Inscription', t: 'num', min: 0, step: 500, req: true }, { k: 'mensualite', l: 'Mensualité', t: 'num', min: 0, step: 500, req: true }, { k: 'transport', l: 'Transport (mensuel)', t: 'num', min: 0, step: 500 }, { k: 'cantine', l: 'Cantine (mensuelle)', t: 'num', min: 0, step: 500 }],
  defaults: () => ({ inscription: 35000, mensualite: 22000, transport: 12000, cantine: 15000 }),
  cols: ['classId', { l: 'Inscription', v: f => money(f.inscription), num: true }, { l: 'Mensualité', v: f => money(f.mensualite), num: true }, { l: 'Transport', v: f => money(f.transport), num: true }, { l: 'Cantine', v: f => money(f.cantine), num: true }, { l: 'Coût annuel (9 mois)', v: f => money(f.inscription + 9 * f.mensualite), num: true }],
  sort: (a, b) => a.classId.localeCompare(b.classId)
};

CFG.payments = {
  key: 'payments', icon: 'receipt', title: 'Encaissement', sub: 'Paiements reçus à la caisse : espèces, Wave, Orange Money, virement ou chèque. Un reçu numéroté est généré.', nl: 'Nouvel encaissement', singular: 'paiement', rowTitle: p => p.recu,
  fields: [dateF('date', 'Date'), { k: 'mode', l: 'Mode de paiement', t: 'select', o: LISTF('payments.mode'), req: true }, { k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full', fl: s => s.statut === 'Actif' },
    { k: 'type', l: 'Nature', t: 'select', o: ['Inscription', 'Mensualité', 'Transport', 'Cantine', 'Autre'], req: true },
    { k: 'mois', l: 'Mois concerné', t: 'select', o: MOIS, show: v => ['Mensualité', 'Transport', 'Cantine'].includes(v.type), check: (v, vals) => vals.type === 'Mensualité' && !v ? 'Précisez le mois' : '' },
    { k: 'montant', l: 'Montant (FCFA)', t: 'num', min: 1, step: 500, req: true, hint: (v, db) => { const s = db.students.find(x => x.id === v.studentId); return s ? 'Reste dû à ce jour pour cet élève : ' + money(studentDues(db, s).reste) : ''; } },
    { k: 'remarque', l: 'Remarque', w: 'full' }],
  defaults: () => ({ date: todayStr(), mode: 'Espèces' }),
  onChange: (v, k, db) => {
    if ((k !== 'studentId' && k !== 'type') || !v.studentId) return null;
    const s = db.students.find(x => x.id === v.studentId), fee = s && db.feeStructure.find(f => f.classId === s.classId); if (!fee) return null;
    const patch = {}, amt = { Inscription: fee.inscription, Mensualité: fee.mensualite, Transport: fee.transport, Cantine: fee.cantine }[v.type];
    if (amt) patch.montant = amt;
    if (v.type === 'Mensualité' && (k === 'studentId' || !v.mois)) { const d = studentDues(db, s), nx = d.byMonth.find(b => b.paid < d.fee.mensualite); if (nx) patch.mois = nx.m; }
    return patch;
  },
  beforeSave: (v, db, app, row) => row ? v : { ...v, recu: nextReceipt(db), caissier: app.me.nom },
  cols: [{ l: 'Reçu', v: p => p.recu, mono: true }, { l: 'Date', v: p => fmtDate(p.date) }, { l: 'Élève', v: (p, db) => refLabel(db, 'students', p.studentId) }, { l: 'Nature', v: p => p.type + (p.mois ? ' · ' + p.mois : '') }, { l: 'Montant', v: p => money(p.montant), num: true }, { l: 'Mode', v: p => p.mode }],
  filters: [{ k: 'type', l: 'Nature', t: 'select', o: ['Inscription', 'Mensualité', 'Transport', 'Cantine', 'Autre'] }, { k: 'mode', l: 'Mode', t: 'select', o: LISTD('payments.mode') }, { k: 'mois', l: 'Mois', t: 'select', o: MOIS }],
  sort: (a, b) => b.date.localeCompare(a.date) || b.recu.localeCompare(a.recu),
  delMsg: 'Supprimer un encaissement efface aussi son numéro de reçu. Préférez une correction par écriture contraire si le reçu a déjà été remis.',
  rowActions: [{ l: 'Reçu', i: 'receipt', open: true, run: (p, app) => app.ask({ title: 'Reçu ' + p.recu, wide: true, noCancel: true, submit: 'Fermer', extra: () => html`<${Receipt} p=${p} />` }) }]
};

/* ===== Scolaria : pages spécialisées ===== */
const sortedClasses = db => [...db.classes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
const activeIn = (db, cid) => db.students.filter(s => s.classId === cid && s.statut === 'Actif').sort(byName);
const printBtn = () => IN_GAS ? html`<${Btn} icon="printer" onClick=${() => window.print()}>Imprimer<//>` : null;
const ClassSelect = ({ id, classes, value, onChange, label = 'Classe' }) => html`<div className="inline-field"><label htmlFor=${id}>${label}</label><select id=${id} value=${value} onChange=${e => onChange(e.target.value)}>${classes.map(c => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select></div>`;

/* ---------- Calendrier (vue mensuelle) ---------- */
function MonthGrid() {
  const { db } = useApp(); const [off, setOff] = useState(0);
  const b = new Date(), first = new Date(b.getFullYear(), b.getMonth() + off, 1);
  const start = (first.getDay() + 6) % 7, dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), t = todayStr();
  const cells = []; for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(ymd(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  const on = day => db.events.filter(e => e.date <= day && day <= (e.fin || e.date));
  return html`<div className="card cal">
    <div className="cal-head"><strong className="cap">${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong><span className="grow"></span>
      <button type="button" className="icon-btn" onClick=${() => setOff(off - 1)} aria-label="Mois précédent"><${Icon} n="chev" s=${16} /></button><${Btn} sm onClick=${() => setOff(0)}>Aujourd’hui<//><button type="button" className="icon-btn" onClick=${() => setOff(off + 1)} aria-label="Mois suivant"><${Icon} n="chev" s=${16} /></button></div>
    <div className="cal-grid">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => html`<div key=${d} className="cal-dow">${d}</div>`)}
      ${cells.map((d, i) => d ? html`<div key=${i} className=${'cal-day' + (d === t ? ' today' : '') + (dow(d) === 0 || dow(d) === 6 ? ' off' : '')}><span className="n">${+d.slice(8)}</span>${on(d).slice(0, 2).map(e => html`<span key=${e.id} className=${'ev ' + (EVT_TONE[e.categorie] || 'mute')} title=${e.titre}>${e.titre}</span>`)}${on(d).length > 2 && html`<span className="more-ev">+${on(d).length - 2}</span>`}</div>` : html`<div key=${i} className="cal-day blank"></div>`)}</div>
  </div>`;
}

/* ---------- Reçu de paiement ---------- */
function Receipt({ p }) {
  const { db } = useApp(), s = db.students.find(x => x.id === p.studentId), st = db.settings[0] || {};
  return html`<div>
    <div className="receipt" id="print-area">
      <div className="rc-head"><div><strong className="brand-name">${st.ecole}</strong><div className="small muted">${st.adresse} · Tél. ${st.tel}</div></div><div className="rc-no"><span className="small muted">Reçu n°</span><strong className="mono">${p.recu}</strong><span className="small">${fmtDate(p.date)}</span></div></div>
      <dl className="rc-body">
        <div><dt>Reçu de</dt><dd>${s ? fullName(s) : '—'} <span className="muted">(${s ? s.admission : ''})</span></dd></div>
        <div><dt>Classe</dt><dd>${s ? clsName(db, s.classId) : '—'} · Année ${st.annee}</dd></div>
        <div><dt>Objet</dt><dd>${p.type}${p.mois ? ' — ' + p.mois : ''}</dd></div>
        <div><dt>Mode</dt><dd>${p.mode}</dd></div>
      </dl>
      <div className="rc-amount"><strong className="mono">${num(p.montant)} FCFA</strong><span>Arrêté le présent reçu à la somme de <em>${enLettres(p.montant)} francs CFA</em>.</span></div>
      <div className="rc-sign"><span>Le parent</span><span>La caisse : ${p.caissier || '—'}</span></div>
    </div>
    <div className="no-print dlg-actions">${printBtn()}</div>
  </div>`;
}

/* ---------- Tableau de bord ---------- */
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function Dashboard() {
  const app = useApp(); const { db, can, go } = app, t = todayStr();
  const actifs = db.students.filter(s => s.statut === 'Actif');
  const since = addDays(t, -7), att = db.attendance.filter(a => a.date >= since), here = att.filter(a => a.statut === 'Présent' || a.statut === 'Retard').length;
  const money_ = can('payments', 'view');
  const enc = db.payments.filter(p => p.date.startsWith(t.slice(0, 7))).reduce((a, p) => a + p.montant, 0);
  const reste = money_ ? actifs.reduce((a, s) => a + studentDues(db, s).reste, 0) : 0;
  const debiteurs = money_ ? actifs.filter(s => studentDues(db, s).reste > 0).length : 0;
  const byClass = sortedClasses(db).map(c => ({ l: c.nom, v: db.students.filter(s => s.classId === c.id && s.statut === 'Actif').length }));
  const order = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6], cm = new Date().getMonth() + 1, upto = order.includes(cm) ? order.slice(0, order.indexOf(cm) + 1) : order;
  const monthly = upto.map(m => ({ l: MOIS_COURTS[m - 1], v: db.payments.filter(p => +p.date.slice(5, 7) === m).reduce((a, p) => a + p.montant, 0) }));
  const dates = [...new Set(db.attendance.map(a => a.date))].sort().slice(-10);
  const trend = dates.map(d => { const r = db.attendance.filter(a => a.date === d); return { l: d.slice(8) + '/' + d.slice(5, 7), v: r.length ? r.filter(a => a.statut === 'Présent' || a.statut === 'Retard').length / r.length * 100 : 0 }; });
  const todo = [
    { n: db.tickets.filter(x => (x.statut === 'Ouvert' || x.statut === 'En cours') && slaInfo(x).tone === 'bad').length, l: 'demandes d’assistance hors délai', k: 'tickets', tone: 'bad' },
    { n: db.admissions.filter(a => a.statut === 'En attente').length, l: 'candidatures en attente', k: 'admissions', tone: 'warn' },
    { n: db.stock.filter(s => stockQty(db, s) <= s.seuil).length, l: 'articles à réapprovisionner', k: 'stock', tone: 'warn' },
    { n: db.documents.filter(d => d.expiration && daysTo(d.expiration) <= 30).length, l: 'documents expirés ou bientôt expirés', k: 'documents', tone: 'warn' },
    { n: db.complaints.filter(c => c.statut === 'Nouvelle').length, l: 'plaintes à traiter', k: 'complaints', tone: 'info' }
  ].filter(x => x.n > 0 && can(x.k, 'view'));
  const next = db.events.filter(e => (e.fin || e.date) >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  return html`<section>
    <${PageHead} title="Tableau de bord" sub=${'Année scolaire ' + ((db.settings[0] || {}).annee || '') + ' · ' + fmtLong(t)} />
    <div className="kpis">
      <${Kpi} l="Élèves inscrits" v=${actifs.length} sub=${db.classes.length + ' classes'} icon="users" />
      <${Kpi} l="Enseignants" v=${db.teachers.length} sub=${db.teachers.filter(x => x.statut === 'Permanent').length + ' permanents'} icon="user" />
      <${Kpi} l="Présence sur 7 jours" v=${att.length ? dec(here / att.length * 100, 1) + ' %' : '—'} sub=${att.length ? (att.length - here) + ' absences enregistrées' : 'Aucune donnée'} tone=${att.length && here / att.length < .9 ? 'warn' : 'ok'} icon="check" />
      ${money_ && html`<${Kpi} l="Encaissé ce mois" v=${num(enc) + ' F'} sub=${'Reste à recouvrer : ' + num(reste) + ' F'} icon="cash" />`}
      ${money_ && html`<${Kpi} l="Retards de paiement" v=${debiteurs} sub=${'sur ' + actifs.length + ' élèves'} tone=${debiteurs ? 'warn' : 'ok'} icon="alert" />`}
    </div>
    <div className="grid2">
      <div className="card"><h2 className="card-title">Effectifs par classe</h2><${Bars} data=${byClass} label="Effectifs par classe" /></div>
      <div className="card"><h2 className="card-title">Présence quotidienne</h2><${Line} data=${trend} label="Taux de présence par jour" /></div>
      ${money_ && html`<div className="card"><h2 className="card-title">Encaissements par mois <small>(en milliers de FCFA)</small></h2><${Bars} data=${monthly} fmt=${v => num(Math.round(v / 1000))} label="Encaissements par mois" /></div>`}
      <div className="card"><h2 className="card-title">À traiter</h2>
        ${todo.length ? html`<ul className="todo">${todo.map(x => html`<li key=${x.k}><button type="button" onClick=${() => go(x.k)}>${B(x.tone, x.n)}<span>${x.l}</span><${Icon} n="chev" s=${15} /></button></li>`)}</ul>` : html`<p className="muted">Rien d’urgent pour le moment.</p>`}
        <h2 className="card-title sp">Prochains événements</h2>
        ${next.length ? html`<ul className="evlist">${next.map(e => html`<li key=${e.id}><span className="mono">${fmtDate(e.date)}</span><span>${e.titre}</span>${B(EVT_TONE[e.categorie] || 'mute', e.categorie)}</li>`)}</ul>` : html`<p className="muted">Aucun événement à venir.</p>`}
      </div>
    </div>
  </section>`;
}

/* ---------- Résultats ---------- */
function computeResults(db, classId, session) {
  const exams = db.exams.filter(e => e.classId === classId && e.session === session);
  const rows = activeIn(db, classId).map(s => {
    let pts = 0, cf = 0; const notes = {};
    exams.forEach(e => {
      const m = db.marks.find(x => x.examId === e.id && x.studentId === s.id), sub = db.subjects.find(x => x.id === e.subjectId), c = sub ? sub.coef : 1;
      if (m && !m.abs && m.note !== '') { const n20 = m.note * 20 / (e.noteMax || 20); notes[e.subjectId] = n20; pts += n20 * c; cf += c; }
    });
    return { s, notes, moy: cf ? pts / cf : null };
  });
  const ranked = rows.filter(r => r.moy !== null).sort((a, b) => b.moy - a.moy);
  rows.forEach(r => { r.rang = r.moy === null ? null : ranked.findIndex(x => x.moy === r.moy) + 1; });
  return { exams, rows, ranked, subjects: [...new Set(exams.map(e => e.subjectId))].map(id => db.subjects.find(s => s.id === id)).filter(Boolean) };
}
const sessionsOf = (db, cid) => [...new Set(db.exams.filter(e => e.classId === cid).sort((a, b) => b.date.localeCompare(a.date)).map(e => e.session))];
const sessionsWithMarks = (db, cid) => sessionsOf(db, cid).filter(s => db.exams.some(e => e.classId === cid && e.session === s && db.marks.some(m => m.examId === e.id)));

function ResultsPage() {
  const app = useApp(); const { db, me } = app;
  const kids = me.role === 'eleve' || me.role === 'parent' ? myKids(app) : null;
  const classes = kids ? [...new Set(kids.map(k => k.classId))].map(id => db.classes.find(c => c.id === id)).filter(Boolean) : sortedClasses(db);
  const [cid, setCid] = useState((classes[0] || {}).id || ''); const [sess, setSess] = useState('');
  const list = sessionsWithMarks(db, cid), session = list.includes(sess) ? sess : list[0] || '';
  const res = useMemo(() => session ? computeResults(db, cid, session) : null, [db, cid, session]);
  const shown = res ? (kids ? res.rows.filter(r => kids.some(k => k.id === r.s.id)) : [...res.rows].sort((a, b) => (a.rang || 999) - (b.rang || 999))) : [];
  const cl = res ? res.rows.filter(r => r.moy !== null) : [], avg = cl.length ? cl.reduce((a, r) => a + r.moy, 0) / cl.length : null;
  const bulletin = r => app.ask({
    title: 'Bulletin — ' + fullName(r.s), wide: true, noCancel: true, submit: 'Fermer',
    extra: () => html`<div className="tablewrap"><table className="t"><thead><tr><th>Matière</th><th className="num">Coef.</th><th className="num">Note /20</th><th>Mention</th></tr></thead><tbody>${res.subjects.map(s => { const n = r.notes[s.id]; return html`<tr key=${s.id}><td>${s.nom}</td><td className="num mono">${s.coef}</td><td className="num mono">${n === undefined ? 'Abs.' : dec(n)}</td><td>${n === undefined ? '—' : B(mention(n)[2], mention(n)[1])}</td></tr>`; })}</tbody><tfoot><tr><td colSpan="2"><strong>Moyenne générale</strong></td><td className="num mono"><strong>${r.moy === null ? '—' : dec(r.moy)}</strong></td><td>${r.moy === null ? '' : B(mention(r.moy)[2], mention(r.moy)[1])} ${r.rang ? html`<span className="muted"> · ${r.rang}${r.rang === 1 ? 'er' : 'e'} sur ${res.ranked.length}</span>` : ''}</td></tr></tfoot></table></div>`
  });
  return html`<section>
    <${PageHead} title="Résultats" sub="Moyennes pondérées par les coefficients, rang et mention (notes ramenées sur 20)." />
    <div className="card flush"><div className="toolbar">
      <${ClassSelect} id="res-class" classes=${classes} value=${cid} onChange=${v => { setCid(v); setSess(''); }} />
      <div className="inline-field"><label htmlFor="res-sess">Session</label><select id="res-sess" value=${session} onChange=${e => setSess(e.target.value)}>${list.map(s => html`<option key=${s} value=${s}>${s}</option>`)}</select></div>
      <span className="grow"></span>${avg !== null && html`<span className="count">Moyenne de classe : <strong className="mono">${dec(avg)}</strong></span>`}</div>
    ${!res ? html`<${Empty} icon="chart" title="Pas encore de résultats">Aucune note n’a été saisie pour cette classe.<//>` : html`<div className="tablewrap"><table className="t">
      <thead><tr><th className="num">Rang</th><th>Élève</th>${res.subjects.map(s => html`<th key=${s.id} className="num" title=${s.nom + ' (coef. ' + s.coef + ')'}>${s.code}</th>`)}<th className="num">Moyenne</th><th>Mention</th></tr></thead>
      <tbody>${shown.map(r => html`<tr key=${r.s.id}><td className="num mono">${r.rang || '—'}</td><td><button type="button" className="linkbtn" onClick=${() => bulletin(r)}>${fullName(r.s)}</button></td>${res.subjects.map(s => html`<td key=${s.id} className=${'num mono' + (r.notes[s.id] !== undefined && r.notes[s.id] < 10 ? ' low' : '')}>${r.notes[s.id] === undefined ? '—' : dec(r.notes[s.id], 1)}</td>`)}<td className="num mono"><strong>${r.moy === null ? '—' : dec(r.moy)}</strong></td><td>${r.moy === null ? '—' : B(mention(r.moy)[2], mention(r.moy)[1])}</td></tr>`)}</tbody>
      ${!kids && html`<tfoot><tr><td></td><td><strong>Moyenne de la classe</strong></td>${res.subjects.map(s => { const v = cl.map(r => r.notes[s.id]).filter(x => x !== undefined); return html`<td key=${s.id} className="num mono">${v.length ? dec(v.reduce((a, b) => a + b, 0) / v.length, 1) : '—'}</td>`; })}<td className="num mono"><strong>${avg === null ? '—' : dec(avg)}</strong></td><td></td></tr></tfoot>`}
    </table></div>`}
    </div>
    <details className="card scale"><summary>Barème des mentions</summary><div className="scale-row">${MENTIONS.map(m => html`<span key=${m[1]}>${B(m[2], m[1])} <small className="mono">${m[0] === 0 ? '< 8' : '≥ ' + m[0]}</small></span>`)}</div></details>
  </section>`;
}

/* ---------- Saisie des notes ---------- */
function MarksPage() {
  const app = useApp(); const { db, can, saveMany, notify } = app, edit = can('marks', 'edit');
  const classes = sortedClasses(db); const [cid, setCid] = useState((classes[0] || {}).id || ''); const [eid, setEid] = useState('');
  const exams = db.exams.filter(e => e.classId === cid).sort((a, b) => b.date.localeCompare(a.date) || a.session.localeCompare(b.session));
  const exam = exams.find(e => e.id === eid) || exams[0];
  const studs = activeIn(db, cid);
  const existing = useMemo(() => { const m = {}; if (exam) db.marks.filter(x => x.examId === exam.id).forEach(x => { m[x.studentId] = x; }); return m; }, [db.marks, exam && exam.id]);
  const [draft, setDraft] = useState({}), [err, setErr] = useState('');
  useEffect(() => { setDraft({}); setErr(''); }, [exam && exam.id]);
  const val = s => draft[s.id] || { note: existing[s.id] ? existing[s.id].note : '', abs: existing[s.id] ? existing[s.id].abs : false };
  const setV = (s, patch) => setDraft(d => ({ ...d, [s.id]: { ...val(s), ...patch } }));
  const max = exam ? exam.noteMax : 20;
  const vals = studs.map(s => ({ s, ...val(s) })), filled = vals.filter(v => !v.abs && v.note !== '' && !Number.isNaN(Number(v.note)));
  const stats = filled.length ? { avg: filled.reduce((a, v) => a + Number(v.note), 0) / filled.length, min: Math.min(...filled.map(v => Number(v.note))), max: Math.max(...filled.map(v => Number(v.note))), pass: filled.filter(v => Number(v.note) * 20 / max >= 10).length / filled.length * 100 } : null;
  const submit = async () => {
    const bad = vals.find(v => !v.abs && v.note !== '' && (Number(v.note) < 0 || Number(v.note) > max || Number.isNaN(Number(v.note))));
    if (bad) { setErr('La note de ' + fullName(bad.s) + ' doit être comprise entre 0 et ' + max + '.'); return; }
    setErr('');
    const rows = vals.filter(v => v.abs || v.note !== '' || existing[v.s.id]).map(v => ({ ...(existing[v.s.id] || {}), examId: exam.id, studentId: v.s.id, note: v.abs || v.note === '' ? '' : Number(v.note), abs: !!v.abs }));
    await saveMany('marks', rows); setDraft({}); notify(rows.length + ' notes enregistrées');
  };
  return html`<section>
    <${PageHead} title="Notes" sub="Saisie groupée des notes d’une épreuve. La mention est calculée automatiquement."><${Btn} tone="primary" icon="check" disabled=${!edit || !exam} onClick=${submit}>Enregistrer les notes<//><//>
    <div className="card flush"><div className="toolbar">
      <${ClassSelect} id="mk-class" classes=${classes} value=${cid} onChange=${v => { setCid(v); setEid(''); }} />
      <div className="inline-field"><label htmlFor="mk-exam">Épreuve</label><select id="mk-exam" value=${exam ? exam.id : ''} onChange=${e => setEid(e.target.value)}>${exams.map(e => html`<option key=${e.id} value=${e.id}>${(db.subjects.find(s => s.id === e.subjectId) || {}).nom} · ${e.session}</option>`)}</select></div>
      <span className="grow"></span>
      ${stats && html`<span className="count">Moy. <strong className="mono">${dec(stats.avg)}</strong> · min <span className="mono">${dec(stats.min, 1)}</span> · max <span className="mono">${dec(stats.max, 1)}</span> · réussite <span className="mono">${dec(stats.pass, 0)} %</span></span>`}</div>
    ${err && html`<p className="form-err inset" role="alert">${err}</p>`}
    ${!exam ? html`<${Empty} icon="clip" title="Aucune épreuve">Programmez d’abord une épreuve dans le module Examens.<//>` : html`<div className="tablewrap"><table className="t">
      <thead><tr><th>Élève</th><th className="num">Note / ${max}</th><th>Absent</th><th>Sur 20</th><th>Mention</th></tr></thead>
      <tbody>${vals.map(v => { const ok = !v.abs && v.note !== '' && !Number.isNaN(Number(v.note)), n20 = ok ? Number(v.note) * 20 / max : null; return html`<tr key=${v.s.id}><td>${fullName(v.s)}</td>
        <td className="num"><input className="cellinput mono" id=${'m-' + v.s.id} type="number" step="0.25" min="0" max=${max} disabled=${!edit || v.abs} value=${v.note} aria-label=${'Note de ' + fullName(v.s)} onChange=${e => setV(v.s, { note: e.target.value === '' ? '' : e.target.value })} /></td>
        <td><label className="check"><input type="checkbox" id=${'a-' + v.s.id} disabled=${!edit} checked=${!!v.abs} aria-label=${'Absent : ' + fullName(v.s)} onChange=${e => setV(v.s, { abs: e.target.checked })} /></label></td>
        <td className="mono">${ok ? dec(n20, 1) : '—'}</td><td>${ok ? B(mention(n20)[2], mention(n20)[1]) : v.abs ? B('mute', 'Absent') : '—'}</td></tr>`; })}</tbody></table></div>`}
    </div></section>`;
}

/* ---------- Présences ---------- */
const STATUTS = [['Présent', 'ok'], ['Absent', 'bad'], ['Retard', 'warn'], ['Excusé', 'info']];
function AttendancePage() {
  const app = useApp(); const { db, can, saveMany, notify } = app, edit = can('attendance', 'edit');
  const classes = sortedClasses(db); const [cid, setCid] = useState((classes[0] || {}).id || ''); const [date, setDate] = useState(todayStr());
  const studs = activeIn(db, cid);
  const existing = useMemo(() => { const m = {}; db.attendance.filter(a => a.classId === cid && a.date === date).forEach(a => { m[a.studentId] = a; }); return m; }, [db.attendance, cid, date]);
  const [draft, setDraft] = useState({});
  useEffect(() => setDraft({}), [cid, date]);
  const st = s => draft[s.id] || (existing[s.id] ? existing[s.id].statut : 'Présent');
  const count = k => studs.filter(s => st(s) === k).length;
  const submit = async () => {
    const rows = studs.map(s => ({ ...(existing[s.id] || {}), date, classId: cid, studentId: s.id, statut: st(s), note: existing[s.id] ? existing[s.id].note : '' }));
    await saveMany('attendance', rows); setDraft({}); notify('Présences du ' + fmtDate(date) + ' enregistrées');
  };
  const log = [...new Set(db.attendance.filter(a => a.classId === cid).map(a => a.date))].sort().reverse().slice(0, 8).map(d => { const r = db.attendance.filter(a => a.classId === cid && a.date === d); return { d, n: r.length, abs: r.filter(a => a.statut === 'Absent').length, ret: r.filter(a => a.statut === 'Retard').length, exc: r.filter(a => a.statut === 'Excusé').length }; });
  return html`<section>
    <${PageHead} title="Présences" sub="Appel par classe et par jour, enregistré en une fois."><${Btn} tone="primary" icon="check" disabled=${!edit || !studs.length} onClick=${submit}>Enregistrer l’appel<//><//>
    <div className="split">
      <div className="card flush"><div className="toolbar">
        <${ClassSelect} id="att-class" classes=${classes} value=${cid} onChange=${setCid} />
        <div className="inline-field"><label htmlFor="att-date">Date</label><input id="att-date" type="date" value=${date} onChange=${e => e.target.value && setDate(e.target.value)} /></div>
        <${Btn} sm disabled=${!edit} onClick=${() => setDraft(Object.fromEntries(studs.map(s => [s.id, 'Présent'])))}>Tout le monde présent<//>
        <span className="grow"></span><span className="count">${STATUTS.map(([k, t]) => html`<span key=${k} className="mini">${B(t, count(k))} ${k}</span>`)}</span></div>
        ${(dow(date) === 0 || dow(date) === 6) && html`<p className="form-err inset warn" role="status">Ce jour n’est pas un jour de classe habituel.</p>`}
        ${!studs.length ? html`<${Empty} icon="users" title="Aucun élève">Cette classe n’a pas d’élève actif.<//>` : html`<div className="tablewrap"><table className="t"><thead><tr><th>Élève</th><th>Statut</th></tr></thead>
          <tbody>${studs.map(s => html`<tr key=${s.id}><td>${fullName(s)}</td><td><div className="seg" role="radiogroup" aria-label=${'Statut de ' + fullName(s)}>${STATUTS.map(([k, t]) => html`<button type="button" key=${k} role="radio" aria-checked=${st(s) === k} disabled=${!edit} className=${st(s) === k ? 'on ' + t : ''} onClick=${() => setDraft(d => ({ ...d, [s.id]: k }))}>${k}</button>`)}</div></td></tr>`)}</tbody></table></div>`}
      </div>
      <div className="card flush"><h2 className="card-title pad">Derniers appels</h2>
        ${log.length ? html`<div className="tablewrap"><table className="t compact"><thead><tr><th>Date</th><th className="num">Abs.</th><th className="num">Ret.</th><th className="num">Exc.</th></tr></thead><tbody>${log.map(l => html`<tr key=${l.d}><td><button type="button" className="linkbtn" onClick=${() => setDate(l.d)}>${fmtDate(l.d)}</button></td><td className="num mono">${l.abs}</td><td className="num mono">${l.ret}</td><td className="num mono">${l.exc}</td></tr>`)}</tbody></table></div>` : html`<p className="muted pad">Aucun appel enregistré.</p>`}
      </div>
    </div></section>`;
}

/* ---------- Emploi du temps ---------- */
const teacherBusy = (db, tid, jour, pid, exceptClass) => db.timetable.find(t => t.teacherId === tid && t.jour === jour && t.periodId === pid && t.classId !== exceptClass);
function PeriodsEditor({ onClose }) {
  const { db, saveMany, remove, notify } = useApp();
  const [rows, setRows] = useState(() => [...db.periods].sort((a, b) => a.ordre - b.ordre).map(p => ({ ...p }))), [err, setErr] = useState('');
  const upd = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const save = async () => {
    if (rows.some(r => !r.label.trim() || !/^\d\d:\d\d$/.test(r.debut) || !/^\d\d:\d\d$/.test(r.fin) || r.fin <= r.debut)) { setErr('Chaque période a besoin d’un nom, d’une heure de début et d’une heure de fin postérieure.'); return; }
    const keep = new Set(rows.filter(r => r.id).map(r => r.id)), gone = db.periods.filter(p => !keep.has(p.id)).map(p => p.id);
    if (gone.length) await remove('periods', gone);
    await saveMany('periods', rows.map((r, i) => ({ ...r, ordre: i + 1 }))); notify('Périodes enregistrées'); onClose();
  };
  const foot = html`<${Btn} icon="plus" onClick=${() => setRows(r => [...r, { id: '', ordre: r.length + 1, label: 'Cours ' + (r.length + 1), debut: '', fin: '', pause: false }])}>Ajouter une période<//><span className="grow"></span><${Btn} onClick=${onClose}>Annuler<//><${Btn} tone="primary" onClick=${save}>Enregistrer<//>`;
  return html`<${Modal} title="Périodes de la journée" onClose=${onClose} wide foot=${foot}>
    <div className="tablewrap"><table className="t compact"><thead><tr><th>Nom</th><th>Début</th><th>Fin</th><th>Pause</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => html`<tr key=${i}><td><input className="cellinput" id=${'pe-l-' + i} value=${r.label} aria-label="Nom" onChange=${e => upd(i, 'label', e.target.value)} /></td><td><input className="cellinput" id=${'pe-d-' + i} type="time" value=${r.debut} aria-label="Début" onChange=${e => upd(i, 'debut', e.target.value)} /></td><td><input className="cellinput" id=${'pe-f-' + i} type="time" value=${r.fin} aria-label="Fin" onChange=${e => upd(i, 'fin', e.target.value)} /></td><td><label className="check"><input type="checkbox" id=${'pe-p-' + i} checked=${r.pause} aria-label="Pause" onChange=${e => upd(i, 'pause', e.target.checked)} /></label></td><td><button type="button" className="icon-btn danger" aria-label="Retirer" onClick=${() => setRows(rs => rs.filter((_, j) => j !== i))}><${Icon} n="trash" s=${16} /></button></td></tr>`)}
    </tbody></table></div>${err && html`<p className="form-err" role="alert">${err}</p>`}
  </${Modal}>`;
}
function TimetablePage() {
  const app = useApp(); const { db, can, save, saveMany, remove, ask, notify, me } = app, edit = can('timetable', 'edit');
  const kids = me.role === 'eleve' || me.role === 'parent' ? myKids(app) : null;
  const classes = kids ? [...new Set(kids.map(k => k.classId))].map(id => db.classes.find(c => c.id === id)).filter(Boolean) : sortedClasses(db);
  const [mode, setMode] = useState('classe'), [cid, setCid] = useState((classes[0] || {}).id || ''), [tid, setTid] = useState(me.role === 'enseignant' ? me.linkId : (db.teachers[0] || {}).id), [per, setPer] = useState(false);
  const periods = [...db.periods].sort((a, b) => a.ordre - b.ordre);
  const entry = (j, p) => db.timetable.find(t => (mode === 'classe' ? t.classId === cid : t.teacherId === tid) && t.jour === j && t.periodId === p.id);
  const subIdx = id => Math.max(0, db.subjects.findIndex(s => s.id === id)) % 8;
  const editCell = async (j, p) => {
    const cur = entry(j, p);
    const v = await ask({
      title: JOURS[j - 1] + ' · ' + p.label + ' (' + p.debut + '–' + p.fin + ') — ' + clsName(db, cid),
      fields: [{ k: 'subjectId', l: 'Matière', t: 'ref', ref: 'subjects', req: true }, { k: 'teacherId', l: 'Enseignant', t: 'select', req: true, o: (vals, d) => { const pri = d.assignments.filter(a => a.classId === cid && a.subjectId === vals.subjectId).map(a => a.teacherId); return d.teachers.map(t => ({ v: t.id, l: fullName(t) + (pri.includes(t.id) ? ' (affecté à cette matière)' : '') })).sort((a, b) => (b.l.length > 0 && b.l.includes('affecté')) - (a.l.includes('affecté'))); } }, { k: 'salle', l: 'Salle' }],
      initial: cur ? { ...cur } : { salle: (db.classes.find(c => c.id === cid) || {}).salle || '' },
      onChange: (vals, k, d) => k === 'subjectId' ? { teacherId: (d.assignments.find(a => a.classId === cid && a.subjectId === vals.subjectId) || {}).teacherId || vals.teacherId } : null,
      validate: (vals, d) => { const b = teacherBusy(d, vals.teacherId, j, p.id, cid); return b ? refLabel(d, 'teachers', vals.teacherId) + ' enseigne déjà en ' + clsName(d, b.classId) + ' à cette heure.' : ''; },
      secondary: cur ? { l: 'Vider la case', tone: 'danger', value: 'clear' } : null, submit: 'Enregistrer'
    });
    if (!v) return;
    if (v.__action === 'clear') { await remove('timetable', [cur.id]); return; }
    await save('timetable', { ...(cur || {}), classId: cid, jour: j, periodId: p.id, subjectId: v.subjectId, teacherId: v.teacherId, salle: v.salle || '' });
  };
  const copy = async () => {
    const v = await ask({ title: 'Copier un emploi du temps', message: 'Les créneaux et matières de la classe source sont reportés sur la classe de destination, avec les enseignants affectés à cette classe. L’emploi du temps de destination est remplacé. Les créneaux où l’enseignant est déjà occupé sont ignorés.', fields: [{ k: 'from', l: 'Copier depuis', t: 'ref', ref: 'classes', req: true }, { k: 'to', l: 'Vers', t: 'ref', ref: 'classes', req: true }], initial: { from: cid, to: '' }, submit: 'Copier', validate: x => x.from === x.to ? 'Choisissez deux classes différentes.' : '' });
    if (!v) return;
    const old = db.timetable.filter(t => t.classId === v.to).map(t => t.id); if (old.length) await remove('timetable', old);
    const tmp = { ...db, timetable: db.timetable.filter(t => t.classId !== v.to) }, rows = []; let skipped = 0;
    db.timetable.filter(t => t.classId === v.from).forEach(t => {
      const a = db.assignments.find(x => x.classId === v.to && x.subjectId === t.subjectId);
      if (!a || teacherBusy(tmp, a.teacherId, t.jour, t.periodId, v.to) || rows.some(r => r.teacherId === a.teacherId && r.jour === t.jour && r.periodId === t.periodId)) { skipped++; return; }
      rows.push({ classId: v.to, jour: t.jour, periodId: t.periodId, subjectId: t.subjectId, teacherId: a.teacherId, salle: (db.classes.find(c => c.id === v.to) || {}).salle || '' });
    });
    await saveMany('timetable', rows); setCid(v.to); setMode('classe'); notify(rows.length + ' cours copiés' + (skipped ? ', ' + skipped + ' ignorés (conflit ou matière sans enseignant)' : ''));
  };
  const hours = db.timetable.filter(t => mode === 'classe' ? t.classId === cid : t.teacherId === tid).length;
  return html`<section>
    <${PageHead} title="Emploi du temps" sub="Grille hebdomadaire par classe ou par enseignant. Un enseignant ne peut pas être placé dans deux classes à la même heure.">
      ${edit && html`<${Btn} icon="clock" onClick=${() => setPer(true)}>Périodes<//><${Btn} icon="copy" onClick=${copy}>Copier vers une classe<//>`}${printBtn()}<//>
    <div className="card flush"><div className="toolbar">
      ${!kids && html`<div className="seg" role="radiogroup" aria-label="Vue"><button type="button" role="radio" aria-checked=${mode === 'classe'} className=${mode === 'classe' ? 'on' : ''} onClick=${() => setMode('classe')}>Par classe</button><button type="button" role="radio" aria-checked=${mode === 'ens'} className=${mode === 'ens' ? 'on' : ''} onClick=${() => setMode('ens')}>Par enseignant</button></div>`}
      ${mode === 'classe' ? html`<${ClassSelect} id="tt-class" classes=${classes} value=${cid} onChange=${setCid} />` : html`<div className="inline-field"><label htmlFor="tt-teacher">Enseignant</label><select id="tt-teacher" value=${tid} onChange=${e => setTid(e.target.value)}>${[...db.teachers].sort(byName).map(t => html`<option key=${t.id} value=${t.id}>${fullName(t)}</option>`)}</select></div>`}
      <span className="grow"></span><span className="count"><span className="mono">${hours}</span> heures par semaine</span></div>
    <div className="tablewrap"><table className="tt"><thead><tr><th></th>${JOURS.map(j => html`<th key=${j}>${j}</th>`)}</tr></thead><tbody>
      ${periods.map(p => p.pause ? html`<tr key=${p.id} className="pause"><th>${p.label}<small>${p.debut}–${p.fin}</small></th><td colSpan="5">${p.label}</td></tr>` : html`<tr key=${p.id}><th>${p.label}<small>${p.debut}–${p.fin}</small></th>${JOURS.map((_, i) => {
    const e = entry(i + 1, p), conflict = e && teacherBusy(db, e.teacherId, e.jour, e.periodId, e.classId);
    const body = e ? html`<strong>${(db.subjects.find(s => s.id === e.subjectId) || {}).nom || '?'}</strong><span>${mode === 'classe' ? refLabel(db, 'teachers', e.teacherId) : clsName(db, e.classId)}</span><small>${e.salle}</small>${conflict && html`<em className="warn-tag">Conflit</em>`}` : html`<span className="free">${edit && mode === 'classe' ? '+' : ''}</span>`;
    return html`<td key=${i}>${edit && mode === 'classe' ? html`<button type="button" className=${'cell s' + (e ? subIdx(e.subjectId) : 'x') + (conflict ? ' conflict' : '')} onClick=${() => editCell(i + 1, p)} aria-label=${JOURS[i] + ' ' + p.label + (e ? ' : modifier' : ' : ajouter un cours')}>${body}</button>` : html`<div className=${'cell s' + (e ? subIdx(e.subjectId) : 'x') + (conflict ? ' conflict' : '')}>${body}</div>`}</td>`;
  })}</tr>`)}
    </tbody></table></div></div>
    ${per && html`<${PeriodsEditor} onClose=${() => setPer(false)} />`}
  </section>`;
}

/* ---------- Convocations d'examen ---------- */
function HallTicketsPage() {
  const { db } = useApp(); const classes = sortedClasses(db), [cid, setCid] = useState((classes[0] || {}).id || ''), [sess, setSess] = useState('');
  const list = sessionsOf(db, cid), session = list.includes(sess) ? sess : list[0] || '';
  const exams = db.exams.filter(e => e.classId === cid && e.session === session).sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));
  const studs = activeIn(db, cid), st = db.settings[0] || {};
  return html`<section>
    <${PageHead} title="Convocations d’examen" sub="Une convocation individuelle par élève, avec le calendrier des épreuves de la session.">${printBtn()}<//>
    <div className="card flush no-print"><div className="toolbar">
      <${ClassSelect} id="ht-class" classes=${classes} value=${cid} onChange=${v => { setCid(v); setSess(''); }} />
      <div className="inline-field"><label htmlFor="ht-sess">Session</label><select id="ht-sess" value=${session} onChange=${e => setSess(e.target.value)}>${list.map(s => html`<option key=${s} value=${s}>${s}</option>`)}</select></div>
      <span className="grow"></span><span className="count">${studs.length} convocations</span></div>
      ${!IN_GAS && html`<p className="muted pad">L’impression est disponible une fois l’application déployée sur Google Apps Script.</p>`}</div>
    ${!exams.length ? html`<${Empty} icon="file" title="Aucune épreuve programmée">Ajoutez des épreuves à cette session dans le module Examens.<//>` : html`<div className="tickets">${studs.map(s => html`<article key=${s.id} className="ticket">
      <header><div><strong className="brand-name">${st.ecole}</strong><small>Année scolaire ${st.annee}</small></div><span className="tk-title">CONVOCATION<small>${session}</small></span></header>
      <dl><div><dt>Candidat</dt><dd>${fullName(s)}</dd></div><div><dt>Classe</dt><dd>${clsName(db, cid)}</dd></div><div><dt>N° d’admission</dt><dd className="mono">${s.admission}</dd></div></dl>
      <table><thead><tr><th>Date</th><th>Heure</th><th>Épreuve</th><th>Salle</th></tr></thead><tbody>${exams.map(e => html`<tr key=${e.id}><td>${fmtDate(e.date)}</td><td className="mono">${e.heure} (${e.duree} min)</td><td>${(db.subjects.find(x => x.id === e.subjectId) || {}).nom}</td><td>${e.salle}</td></tr>`)}</tbody></table>
      <footer><span>Se présenter 15 minutes avant l’épreuve avec cette convocation.</span><span>Le directeur : ${st.responsable}</span></footer></article>`)}</div>`}
  </section>`;
}

/* ---------- Mensualités ---------- */
function DuesPage() {
  const app = useApp(); const { db, me, can, ask, notify } = app, kids = me.role === 'parent' ? myKids(app) : null;
  const [cid, setCid] = useState(''), [q, setQ] = useState(''), [only, setOnly] = useState(false), [busy, setBusy] = useState(false);
  let studs = db.students.filter(s => s.statut === 'Actif' && (!kids || kids.some(k => k.id === s.id)) && (!cid || s.classId === cid)).sort(byName);
  if (q.trim()) studs = studs.filter(s => fullName(s).toLowerCase().includes(q.trim().toLowerCase()));
  let rows = studs.map(s => ({ s, d: studentDues(db, s) })); if (only) rows = rows.filter(r => r.d.reste > 0);
  const total = rows.reduce((a, r) => a + r.d.reste, 0), n = monthsElapsed();
  const lab = { ok: 'Payé', part: 'Partiel', no: 'Impayé', fut: 'À venir' };
  const debtors = rows.filter(r => r.d.reste > 0);
  const remind = async () => {
    const ok = await ask({ title: 'Relancer les parents ?', message: debtors.length + ' élève(s) affiché(s) ont un reste à payer. Un message de rappel part aux parents par les canaux cochés dans « Canaux de communication » (message « Rappel de mensualité »). Les parents qui ont choisi de ne pas recevoir un canal sont ignorés.', submit: 'Envoyer les rappels' });
    if (!ok) return; setBusy(true);
    try { const r = await app.remind(debtors.map(x => x.s.id)); await ask({ title: 'Rappels préparés', noCancel: true, submit: 'Fermer', extra: () => html`<${SendSummary} r=${r} />` }); } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  return html`<section>
    <${PageHead} title="Suivi des mensualités" sub=${'Situation de chaque élève, mois par mois (' + MOIS[0] + ' à ' + MOIS[8] + '). Les mois à venir ne comptent pas encore dans le reste dû.'}>${!kids && can('messages', 'create') && debtors.length > 0 && html`<${Btn} icon="send" disabled=${busy} onClick=${remind}>Relancer les parents (${debtors.length})<//>`}<//>
    <div className="card flush"><div className="toolbar">
      <label className="search"><${Icon} n="search" s=${16} /><input type="search" id="dues-q" placeholder="Rechercher un élève…" value=${q} onChange=${e => setQ(e.target.value)} aria-label="Rechercher" /></label>
      ${!kids && html`<select id="dues-class" aria-label="Classe" value=${cid} onChange=${e => setCid(e.target.value)}><option value="">Classe : toutes</option>${sortedClasses(db).map(c => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select>`}
      <label className="check"><input type="checkbox" id="dues-only" checked=${only} onChange=${e => setOnly(e.target.checked)} /> <span>Seulement les impayés</span></label>
      <span className="grow"></span><span className="count">Reste dû : <strong className="mono">${money(total)}</strong></span></div>
    <div className="legend">${['ok', 'part', 'no', 'fut'].map(k => html`<span key=${k}><i className=${'mcell ' + k}></i>${lab[k]}</span>`)}</div>
    ${!rows.length ? html`<${Empty} icon="cash" title="Aucun élève à afficher">Aucun élève ne correspond à ces critères.<//>` : html`<div className="tablewrap"><table className="t dues"><thead><tr><th>Élève</th><th>Classe</th><th>Inscr.</th>${MOIS.map(m => html`<th key=${m} title=${m}>${m.slice(0, 3)}.</th>`)}<th className="num">Reste dû</th></tr></thead>
      <tbody>${rows.map(({ s, d }) => html`<tr key=${s.id}><td>${fullName(s)}</td><td>${clsName(db, s.classId)}</td>
        <td><span className=${'mcell ' + (d.inscPaid >= d.fee.inscription ? 'ok' : d.inscPaid > 0 ? 'part' : 'no')} title=${'Inscription : ' + money(d.inscPaid) + ' sur ' + money(d.fee.inscription)}></span></td>
        ${d.byMonth.map(b => html`<td key=${b.m}><span className=${'mcell ' + b.status} title=${b.m + ' : ' + lab[b.status] + (b.status === 'fut' ? '' : ' (' + money(b.paid) + ' sur ' + money(d.fee.mensualite) + ')')}></span></td>`)}
        <td className=${'num mono' + (d.reste > 0 ? ' due' : '')}>${d.reste > 0 ? money(d.reste) : '—'}</td></tr>`)}</tbody></table></div>`}
    </div></section>`;
}

/* ---------- Caisse du jour ---------- */
function CashPage() {
  const { db } = useApp(); const [date, setDate] = useState(todayStr());
  const day = db.payments.filter(p => p.date === date).sort((a, b) => a.recu.localeCompare(b.recu));
  const sum = a => a.reduce((x, p) => x + p.montant, 0), total = sum(day);
  const group = key => [...new Set(day.map(p => p[key]))].map(k => ({ k, n: day.filter(p => p[key] === k).length, v: sum(day.filter(p => p[key] === k)) })).sort((a, b) => b.v - a.v);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)).map(d => ({ l: d.slice(8) + '/' + d.slice(5, 7), v: sum(db.payments.filter(p => p.date === d)) }));
  const cash = sum(day.filter(p => p.mode === 'Espèces'));
  return html`<section>
    <${PageHead} title="Caisse du jour" sub="Récapitulatif des encaissements par mode de paiement et par nature.">${printBtn()}<//>
    <div className="card flush"><div className="toolbar"><div className="inline-field"><label htmlFor="cash-date">Journée</label><input id="cash-date" type="date" value=${date} onChange=${e => e.target.value && setDate(e.target.value)} /></div><${Btn} sm onClick=${() => setDate(todayStr())}>Aujourd’hui<//><span className="grow"></span><span className="count">${fmtLong(date)}</span></div></div>
    <div className="kpis">
      <${Kpi} l="Total encaissé" v=${money(total)} sub=${day.length + ' reçus'} icon="cash" />
      <${Kpi} l="Espèces à remettre" v=${money(cash)} sub="À compter en caisse" icon="receipt" />
      <${Kpi} l="Paiements mobiles" v=${money(sum(day.filter(p => p.mode === 'Wave' || p.mode === 'Orange Money')))} sub="Wave et Orange Money" icon="send" />
    </div>
    <div className="grid2">
      <div className="card"><h2 className="card-title">Par mode de paiement</h2>${group('mode').length ? html`<table className="t compact"><tbody>${group('mode').map(g => html`<tr key=${g.k}><td>${g.k}</td><td className="num mono">${g.n}</td><td className="num mono">${money(g.v)}</td></tr>`)}</tbody><tfoot><tr><td>Total</td><td></td><td className="num mono">${money(total)}</td></tr></tfoot></table>` : html`<p className="muted">Aucun encaissement ce jour-là.</p>`}
        <h2 className="card-title sp">Par nature</h2>${group('type').length ? html`<table className="t compact"><tbody>${group('type').map(g => html`<tr key=${g.k}><td>${g.k}</td><td className="num mono">${g.n}</td><td className="num mono">${money(g.v)}</td></tr>`)}</tbody></table>` : html`<p className="muted">—</p>`}</div>
      <div className="card"><h2 className="card-title">Sept derniers jours <small>(en milliers de FCFA)</small></h2><${Bars} data=${week} fmt=${v => num(Math.round(v / 1000))} label="Encaissements sur sept jours" /></div>
    </div>
    <div className="card flush"><h2 className="card-title pad">Reçus du jour</h2>${day.length ? html`<div className="tablewrap"><table className="t compact"><thead><tr><th>Reçu</th><th>Élève</th><th>Nature</th><th>Mode</th><th className="num">Montant</th></tr></thead><tbody>${day.map(p => html`<tr key=${p.id}><td className="mono">${p.recu}</td><td>${refLabel(db, 'students', p.studentId)}</td><td>${p.type}${p.mois ? ' · ' + p.mois : ''}</td><td>${p.mode}</td><td className="num mono">${money(p.montant)}</td></tr>`)}</tbody></table></div>` : html`<p className="muted pad">Aucun reçu émis.</p>`}</div>
  </section>`;
}

/* ---------- Rapports de classe ---------- */
function ReportsPage() {
  const app = useApp(); const { db, can, ask, notify } = app;
  const classes = sortedClasses(db), [cid, setCid] = useState((classes[0] || {}).id || '');
  const studs = activeIn(db, cid), list = sessionsWithMarks(db, cid), session = list[0] || '';
  const res = session ? computeResults(db, cid, session) : null, graded = res ? res.rows.filter(r => r.moy !== null) : [];
  const avg = graded.length ? graded.reduce((a, r) => a + r.moy, 0) / graded.length : null;
  const pass = graded.length ? graded.filter(r => r.moy >= 10).length / graded.length * 100 : null;
  const since = addDays(todayStr(), -30), att = db.attendance.filter(a => a.classId === cid && a.date >= since), here = att.filter(a => a.statut === 'Présent' || a.statut === 'Retard').length;
  const top = [...graded].sort((a, b) => b.moy - a.moy).slice(0, 3), weak = graded.filter(r => r.moy < 8);
  const dues = can('payments', 'view') ? studs.map(s => ({ s, d: studentDues(db, s) })).filter(x => x.d.reste > 0) : [];
  const seeConduct = can('conduct', 'view'), conduct = seeConduct ? db.conduct.filter(c => studs.some(s => s.id === c.studentId)) : [];
  const girls = studs.filter(s => s.sexe === 'F').length;
  const body = () => '<h2>Rapport de classe — ' + clsName(db, cid) + '</h2><ul><li>Effectif : ' + studs.length + ' (' + girls + ' filles, ' + (studs.length - girls) + ' garçons)</li><li>Présence sur 30 jours : ' + (att.length ? dec(here / att.length * 100, 1) + ' %' : 'n/d') + '</li><li>Moyenne de classe (' + (session || 'aucune session') + ') : ' + (avg === null ? 'n/d' : dec(avg)) + '</li><li>Taux de réussite : ' + (pass === null ? 'n/d' : dec(pass, 0) + ' %') + '</li><li>Élèves en grande difficulté (< 8) : ' + weak.length + '</li><li>Élèves avec impayés : ' + dues.length + '</li></ul>';
  const email = async () => {
    if (!IN_GAS) { await ask({ title: 'Envoi par e-mail', noCancel: true, submit: 'Compris', message: 'L’envoi automatique des rapports est disponible une fois l’application déployée sur Google Apps Script. Le rapport est alors envoyé à la direction depuis votre compte Google.' }); return; }
    try { await Api.email('Rapport de classe — ' + clsName(db, cid), body()); notify('Rapport envoyé à la direction'); } catch (e) { notify('Envoi impossible : ' + e.message, 'bad'); }
  };
  return html`<section>
    <${PageHead} title="Rapports de classe" sub="Vue d’ensemble d’une classe : effectifs, assiduité, résultats, conduite et impayés.">${can('reports', 'modify') && html`<${Btn} icon="mail" onClick=${email}>Envoyer par e-mail<//>`}${printBtn()}<//>
    <div className="card flush"><div className="toolbar"><${ClassSelect} id="rp-class" classes=${classes} value=${cid} onChange=${setCid} /><span className="grow"></span><span className="count">${session ? 'Dernière session notée : ' + session : 'Aucune note saisie'}</span></div></div>
    <div className="kpis">
      <${Kpi} l="Effectif" v=${studs.length} sub=${girls + ' filles · ' + (studs.length - girls) + ' garçons'} icon="users" />
      <${Kpi} l="Présence (30 jours)" v=${att.length ? dec(here / att.length * 100, 1) + ' %' : '—'} sub=${(att.length - here) + ' absences'} icon="check" />
      <${Kpi} l="Moyenne de classe" v=${avg === null ? '—' : dec(avg)} sub=${session || ''} icon="chart" />
      <${Kpi} l="Taux de réussite" v=${pass === null ? '—' : dec(pass, 0) + ' %'} sub="Moyenne ≥ 10" tone=${pass !== null && pass < 60 ? 'warn' : 'ok'} icon="award" />
    </div>
    <div className="grid2">
      <div className="card"><h2 className="card-title">Meilleurs résultats</h2>${top.length ? html`<ol className="rank">${top.map(r => html`<li key=${r.s.id}><span>${fullName(r.s)}</span><strong className="mono">${dec(r.moy)}</strong>${B(mention(r.moy)[2], mention(r.moy)[1])}</li>`)}</ol>` : html`<p className="muted">Pas encore de résultats.</p>`}
        <h2 className="card-title sp">En grande difficulté <small>(moyenne ${'<'} 8)</small></h2>${weak.length ? html`<ol className="rank">${weak.map(r => html`<li key=${r.s.id}><span>${fullName(r.s)}</span><strong className="mono">${dec(r.moy)}</strong></li>`)}</ol>` : html`<p className="muted">Aucun élève sous 8 de moyenne.</p>`}</div>
      <div className="card"><h2 className="card-title">Vie de classe</h2><ul className="facts">${seeConduct && html`<li><span>Mentions de conduite</span><strong className="mono">${conduct.length}</strong></li><li><span>Sanctions (retenue, blâme, exclusion)</span><strong className="mono">${conduct.filter(c => ['Retenue', 'Blâme', 'Exclusion temporaire'].includes(c.type)).length}</strong></li><li><span>Éloges</span><strong className="mono">${conduct.filter(c => c.type === 'Éloge').length}</strong></li>`}${can('payments', 'view') && html`<li><span>Élèves avec impayés</span><strong className="mono">${dues.length}</strong></li><li><span>Montant à recouvrer</span><strong className="mono">${money(dues.reduce((a, x) => a + x.d.reste, 0))}</strong></li>`}</ul></div>
    </div></section>`;
}

/* ---------- Plaintes anonymes ---------- */
CFG.complaints = {
  key: 'complaints', icon: 'shield', title: 'Plaintes anonymes', sub: 'Signalements déposés sans nom. La direction suit leur traitement et répond ici.', nl: 'Nouvelle plainte', singular: 'plainte', rowTitle: () => 'plainte',
  fields: [dateF('date', 'Date'), { k: 'categorie', l: 'Catégorie', t: 'select', o: LISTF('complaints.categorie'), req: true }, { k: 'message', l: 'Message', t: 'area', req: true, rows: 4 }, { k: 'statut', l: 'Traitement', t: 'select', o: ['Nouvelle', 'En cours', 'Résolue'], req: true }, { k: 'reponse', l: 'Réponse de l’école', t: 'area' }],
  defaults: () => ({ date: todayStr(), statut: 'Nouvelle' }),
  cols: [{ l: 'Date', v: c => fmtDate(c.date) }, 'categorie', { l: 'Message', v: c => c.message }, { l: 'Traitement', v: c => c.statut, r: c => B(c.statut === 'Résolue' ? 'ok' : c.statut === 'En cours' ? 'info' : 'warn', c.statut) }, { l: 'Réponse', v: c => c.reponse }],
  filters: [{ k: 'statut', l: 'Traitement', t: 'select', o: ['Nouvelle', 'En cours', 'Résolue'] }], sort: (a, b) => b.date.localeCompare(a.date)
};
function ComplaintsPage() {
  const app = useApp(); const { can, ask, save, notify } = app;
  if (can('complaints', 'modify')) return html`<${CrudPage} cfg=${CFG.complaints} />`;
  const send = async () => {
    const v = await ask({ title: 'Déposer une plainte anonyme', message: 'Aucun nom, compte ou adresse n’est enregistré avec ce message.', fields: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: CFG.complaints.fields[1].o, req: true }, { k: 'message', l: 'Votre message', t: 'area', req: true, rows: 5 }], submit: 'Envoyer' });
    if (!v) return; await save('complaints', { date: todayStr(), categorie: v.categorie, message: v.message, statut: 'Nouvelle', reponse: '' }); notify('Votre message a été transmis à la direction');
  };
  return html`<section><${PageHead} title="Plaintes anonymes" sub="Signalez un problème à la direction sans vous identifier." />
    <div className="card center"><${Icon} n="shield" s=${32} /><h2 className="card-title">Votre message reste anonyme</h2><p className="muted">Cantine, discipline, sécurité, transport : décrivez la situation. La direction lit chaque signalement et y répond. Pour une urgence, contactez directement l’école.</p><${Btn} tone="primary" icon="send" onClick=${send}>Écrire un message<//></div></section>`;
}

/* ---------- Mon espace (élèves et parents) ---------- */
const ADM_TXT = { 'En attente': ['warn', 'En cours d’examen'], 'Admis': ['ok', 'Admis'], 'Refusé': ['bad', 'Non retenu'] };
function MyApplications() {
  const app = useApp(); const { db, me } = app, mine = db.admissions.filter(a => a.userId === me.id).sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
  if (!mine.length && !app.regOpen) return null;
  return html`<div className="card"><h2 className="card-title">Mes demandes d’inscription</h2>
    ${mine.length ? html`<div className="tablewrap"><table className="t compact stack"><thead><tr><th>Référence</th><th>Enfant</th><th>Classe demandée</th><th>Décision</th></tr></thead><tbody>${mine.map(a => html`<tr key=${a.id}><td className="mono" data-l="Référence">${a.ref}</td><td data-l="Enfant">${fullName(a)}</td><td data-l="Classe demandée">${clsName(db, a.classId)}</td><td data-l="Décision">${B(ADM_TXT[a.statut][0], ADM_TXT[a.statut][1])}</td></tr>`)}</tbody></table></div>` : html`<p className="muted">Aucune demande pour le moment.</p>`}
    ${app.regOpen && FAMILY_ROLES.indexOf(me.role) >= 0 && html`<div className="form-foot left"><${Btn} icon="plus" onClick=${app.addChild}>Inscrire un enfant<//></div>`}</div>`;
}
function FamilyHome() {
  const app = useApp(); const { db, me, go } = app, kids = myKids(app), t = todayStr(), cand = me.role === 'candidat', st = db.settings[0] || {};
  const notices = CFG.notices.scope(db.notices, app).sort(CFG.notices.sort).slice(0, 3);
  const next = db.events.filter(e => (e.fin || e.date) >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return html`<section>
    <${PageHead} title=${'Bonjour ' + (me.nom || '').split(' ')[0]} sub=${cand ? 'Suivez l’examen de votre demande d’inscription.' : me.role === 'parent' ? 'Le suivi de la scolarité de vos enfants.' : 'Votre scolarité en un coup d’œil.'} />
    ${cand && html`<div className="card note-info"><${Icon} n="bell" s=${20} /><div><strong>Votre dossier est entre les mains du secrétariat.</strong><p className="muted">Dès que l’admission est prononcée, vous recevez un message et cet espace s’ouvre : emploi du temps, notes, présences et paiements de votre enfant. ${(st.tel || st.email) ? 'Une question ? ' + [st.tel, st.email].filter(Boolean).join(' · ') : ''}</p></div></div>`}
    ${!cand && !kids.length && html`<${Empty} icon="users" title="Aucun élève lié à ce compte">Demandez au secrétariat de relier votre compte à la fiche élève.<//>`}
    <div className="kids">${kids.map(s => {
    const att = db.attendance.filter(a => a.studentId === s.id), here = att.filter(a => a.statut === 'Présent' || a.statut === 'Retard').length;
    const sess = sessionsWithMarks(db, s.classId)[0], r = sess ? computeResults(db, s.classId, sess).rows.find(x => x.s.id === s.id) : null, d = studentDues(db, s);
    const ex = db.exams.filter(e => e.classId === s.classId && e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    return html`<article key=${s.id} className="card kid"><header><div className="avatar">${(s.prenom[0] || '') + (s.nom[0] || '')}</div><div><h2>${fullName(s)}</h2><span className="muted">${clsName(db, s.classId)} · ${s.admission}</span></div></header>
      <dl><div><dt>Assiduité</dt><dd className="mono">${att.length ? dec(here / att.length * 100, 1) + ' %' : '—'}</dd></div>
      <div><dt>Moyenne ${sess ? '(' + sess + ')' : ''}</dt><dd className="mono">${r && r.moy !== null ? dec(r.moy) + ' · ' + r.rang + (r.rang === 1 ? 'er' : 'e') : '—'}</dd></div>
      ${app.can('dues', 'view') && html`<div><dt>Reste à payer</dt><dd className=${'mono' + (d.reste ? ' due' : '')}>${d.reste ? money(d.reste) : 'À jour'}</dd></div>`}
      <div><dt>Prochaine épreuve</dt><dd>${ex ? fmtDate(ex.date) + ' · ' + ((db.subjects.find(x => x.id === ex.subjectId) || {}).nom || '') : '—'}</dd></div></dl>
      <div className="kid-actions">${app.can('results', 'view') && html`<${Btn} sm onClick=${() => go('results')}>Résultats<//>`}${app.can('timetable', 'view') && html`<${Btn} sm onClick=${() => go('timetable')}>Emploi du temps<//>`}${app.can('dues', 'view') && html`<${Btn} sm onClick=${() => go('dues')}>Mensualités<//>`}</div></article>`;
  })}</div>
    <${MyApplications} />
    <div className="grid2"><div className="card"><h2 className="card-title">Avis de l’école</h2>${notices.length ? notices.map(n => html`<div key=${n.id} className="mininote"><strong>${n.titre}</strong><span className="muted">${fmtDate(n.date)}</span><p>${n.contenu}</p></div>`) : html`<p className="muted">Aucun avis.</p>`}</div>
      <div className="card"><h2 className="card-title">À venir</h2>${next.length ? html`<ul className="evlist">${next.map(e => html`<li key=${e.id}><span className="mono">${fmtDate(e.date)}</span><span>${e.titre}</span>${B(EVT_TONE[e.categorie] || 'mute', e.categorie)}</li>`)}</ul>` : html`<p className="muted">Aucun événement à venir.</p>`}</div></div>
  </section>`;
}

/* ---------- Paramètres, profil, journal d'audit ---------- */
const SETTINGS_FIELDS = [{ k: 'ecole', l: 'Nom de l’établissement', req: true, w: 'full' }, { k: 'slogan', l: 'Devise de l’école', w: 'full' }, { k: 'adresse', l: 'Adresse', w: 'full' }, { k: 'tel', l: 'Téléphone' }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'annee', l: 'Année scolaire', req: true, ph: '2026-2027', check: v => /^\d{4}-\d{4}$/.test(v) ? '' : 'Format attendu : 2026-2027' }, { k: 'responsable', l: 'Directeur ou directrice' }, { k: 'devise', l: 'Devise monétaire', req: true }, { k: 'notePassage', l: 'Note de passage (sur 20)', t: 'num', min: 0, max: 20, step: 0.5, req: true }, { k: 'indicatif', l: 'Indicatif téléphonique du pays', ph: '221', hint: 'Sert à écrire les numéros au format international pour les SMS et WhatsApp (221 = Sénégal).', check: v => /^\d{1,4}$/.test(v || '') ? '' : 'Chiffres seulement, par exemple 221' }];
function SettingsPage() {
  const app = useApp(); const { db, save, notify, resetDemo, ask } = app, [v, setV] = useState({ ...(db.settings[0] || { id: 'main', noteMax: 20 }), indicatif: (db.settings[0] || {}).indicatif || '221' }), [err, setErr] = useState({}), [per, setPer] = useState(false);
  const submit = async e => { e.preventDefault(); const er = validateFields(SETTINGS_FIELDS, v, db); setErr(er); if (Object.keys(er).length) return; await save('settings', { ...v, id: v.id || 'main' }); notify('Paramètres enregistrés'); };
  const reset = async () => { const ok = await ask({ title: 'Réinitialiser la démonstration ?', message: 'Toutes les modifications faites dans cette démonstration seront perdues et les données d’exemple reviendront.', submit: 'Réinitialiser', danger: true }); if (ok) { resetDemo(); notify('Données d’exemple restaurées'); } };
  return html`<section><${PageHead} title="Paramètres" sub="Identité de l’établissement, année scolaire et règles de notation." />
    <form className="card" onSubmit=${submit}><h2 className="card-title">Établissement</h2><${FormFields} fields=${SETTINGS_FIELDS} values=${v} set=${(k, x) => setV(p => ({ ...p, [k]: x }))} db=${db} errors=${err} /><div className="form-foot"><${Btn} tone="primary" onClick=${submit}>Enregistrer<//></div></form>
    <div className="card"><h2 className="card-title">Périodes de la journée</h2><p className="muted">${db.periods.length} périodes définies, dont ${db.periods.filter(p => p.pause).length} pause(s).</p><${Btn} icon="clock" onClick=${() => setPer(true)}>Modifier les périodes<//></div>
    ${IN_GAS && db.students.length === 0 && db.classes.length === 0 && html`<div className="card"><h2 className="card-title">Données d’exemple</h2><p className="muted">La base est vide. Vous pouvez y charger une école fictive (5 classes, 30 élèves, notes, paiements) pour essayer l’application, puis la remplacer par vos vraies données.</p><${Btn} icon="plus" onClick=${async () => { const ok = await ask({ title: 'Charger les données d’exemple ?', message: 'Les données fictives seront ajoutées à votre feuille Google Sheets.', submit: 'Charger' }); if (!ok) return; try { const n = await Api.importAll(buildSeed()); notify(n + ' lignes importées'); setTimeout(() => location.reload(), 900); } catch (e) { notify(e.message, 'bad'); } }}>Charger les données d’exemple<//></div>`}
    ${!IN_GAS && html`<div className="card"><h2 className="card-title">Démonstration</h2><p className="muted">Les données de cette démonstration sont gardées dans votre navigateur. Sur Google Apps Script, elles sont stockées dans votre feuille Google Sheets.</p><${Btn} tone="danger" onClick=${reset}>Réinitialiser les données d’exemple<//></div>`}
    ${per && html`<${PeriodsEditor} onClose=${() => setPer(false)} />`}</section>`;
}
const CH_ALL = ['email', 'sms', 'whatsapp'];
function ProfilePage() {
  const app = useApp(); const { db, me, save, notify } = app, rec = db.users.find(u => u.id === me.id) || me;
  const F_ = [{ k: 'nom', l: 'Nom complet', req: true }, { k: 'tel', l: 'Téléphone', t: 'tel', check: PHONE, hint: 'Utilisé pour les messages SMS et WhatsApp.' }];
  const pref = rec.canaux ? rec.canaux.split(',').filter(x => CH_ALL.includes(x)) : [];
  const [v, setV] = useState({ nom: rec.nom, tel: rec.tel || '' }), [err, setErr] = useState({}), [canaux, setCanaux] = useState(pref.length ? pref : CH_ALL);
  const linked = me.role === 'enseignant' ? db.teachers.find(t => t.id === me.linkId) : me.role === 'eleve' ? db.students.find(s => s.id === me.linkId) : me.role === 'parent' ? db.parents.find(p => p.id === me.linkId) : null;
  const toggle = c => setCanaux(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c]);
  const submit = async e => {
    e.preventDefault(); const er = validateFields(F_, v, db); if (!canaux.length) er.canaux = 'Gardez au moins un moyen de contact'; setErr(er); if (Object.keys(er).length) return;
    await save('users', { ...rec, ...v, canaux: canaux.length === CH_ALL.length ? '' : canaux.join(',') }); notify('Profil mis à jour');
  };
  return html`<section><${PageHead} title="Mon profil" sub="Vos informations personnelles, vos préférences de contact et votre rôle." />
    <div className="grid2"><form className="card" onSubmit=${submit}><h2 className="card-title">Modifier mes informations</h2><${FormFields} fields=${F_} values=${v} set=${(k, x) => setV(p => ({ ...p, [k]: x }))} db=${db} errors=${err} />
      <fieldset className="prefs"><legend>Comment l’école peut me joindre</legend>${CH_ALL.map(c => html`<label key=${c} className="check"><input type="checkbox" checked=${canaux.includes(c)} onChange=${() => toggle(c)} /> <span>${CHANNEL_DEFS[c].l}</span></label>`)}${err.canaux && html`<small className="err">${err.canaux}</small>`}<small className="hint">L’école n’utilise que les moyens cochés pour vos messages (rappels, avis, absences).</small></fieldset>
      <div className="form-foot"><${Btn} tone="primary" onClick=${submit}>Enregistrer<//></div></form>
      <div className="card"><h2 className="card-title">Compte</h2><ul className="facts"><li><span>Identifiant</span><strong>${rec.login || rec.email}</strong></li>${rec.email && rec.login !== rec.email && html`<li><span>E-mail</span><strong>${rec.email}</strong></li>`}<li><span>Rôle</span><strong>${B('accent', ROLE_LABEL[me.role])}</strong></li>${linked && html`<li><span>Fiche liée</span><strong>${fullName(linked)}</strong></li>`}${linked && linked.matricule && html`<li><span>Matricule</span><strong className="mono">${linked.matricule}</strong></li>`}${linked && linked.admission && html`<li><span>N° d’admission</span><strong className="mono">${linked.admission}</strong></li>`}</ul></div></div>
    ${IN_GAS && html`<div className="card"><h2 className="card-title">Mot de passe</h2><p className="muted">Choisissez un mot de passe que vous n’utilisez nulle part ailleurs.</p><${Btn} icon="shield" onClick=${async () => { const x = await app.ask({ title: 'Changer mon mot de passe', fields: [{ k: 'a', l: 'Mot de passe actuel', t: 'password', req: true }, { k: 'b', l: 'Nouveau mot de passe', t: 'password', req: true, hint: '8 caractères minimum.', check: y => y && y.length < 8 ? 'Au moins 8 caractères' : '' }], submit: 'Changer' }); if (!x) return; try { await Api.changePassword(x.a, x.b); notify('Mot de passe modifié'); } catch (e) { notify(e.message, 'bad'); } }}>Changer mon mot de passe<//></div>`}</section>`;
}
const TLAB = { payments: 'Encaissements', students: 'Élèves', parents: 'Parents', notices: 'Avis', marks: 'Notes', attendance: 'Présences', timetable: 'Emploi du temps', users: 'Utilisateurs', exams: 'Examens', tickets: 'Assistance', settings: 'Paramètres' };
function AuditPage() {
  const { db } = useApp(); const rows = [...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  return html`<section><${PageHead} title="Journal d’audit" sub="Qui a créé, modifié ou supprimé quoi, et quand. Les 300 dernières actions." />
    <div className="card flush">${rows.length ? html`<div className="tablewrap"><table className="t"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Module</th><th>Détail</th></tr></thead><tbody>${rows.map(a => html`<tr key=${a.id}><td className="mono">${fmtDT(a.at)}</td><td>${a.user}</td><td>${B(a.action === 'supprimé' ? 'bad' : a.action === 'créé' ? 'ok' : 'info', a.action)}</td><td>${TLAB[a.table] || a.table}</td><td>${a.detail}</td></tr>`)}</tbody></table></div>` : html`<${Empty} icon="shield" title="Journal vide">Les actions apparaîtront ici dès la première modification.<//>`}</div></section>`;
}

/* ===== Scolaria : panneau d'administration (modules, autorisations, canaux) et messages ===== */
const CH_LABEL = { email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' };
const slug_ = l => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 20) || 'champ';
const CF_LABEL = { text: 'Texte court', area: 'Texte long', num: 'Nombre', date: 'Date', select: 'Liste de choix', bool: 'Case à cocher' };
const isLinkOk = u => /^(https:\/\/wa\.me\/\d+\?text=|sms:\+?\d+\?body=)/.test(u || '');
const modRowOf = (db, k) => ({ id: k, label: '', sub: '', actif: true, ordre: 0, champs: '', listes: '', options: '', ...(db.modules.find(x => x.id === k) || {}) });

/* ---------- Résultat d'un envoi (messages, rappels) ---------- */
function SendSummary({ r }) {
  return html`<div className="sendsum">
    <ul className="facts"><li><span>Messages préparés</span><strong className="mono">${r.total}</strong></li>
      ${r.destinataires !== undefined && html`<li><span>Destinataires</span><strong className="mono">${r.destinataires}</strong></li>`}
      <li><span>${r.simule ? 'Envoyés (simulation)' : 'Envoyés'}</span><strong className="mono">${r.envoyes}</strong></li>
      ${r.aEnvoyer > 0 && html`<li><span>À envoyer vous-même (liens ci-dessous)</span><strong className="mono">${r.aEnvoyer}</strong></li>`}
      ${r.echecs > 0 && html`<li><span>Échecs (détail dans « Journal des envois »)</span><strong className="mono due">${r.echecs}</strong></li>`}</ul>
    ${r.simule && html`<p className="muted">Démonstration : rien n’est réellement envoyé par e-mail ou par une passerelle. Sur Google Apps Script, les envois partent vraiment.</p>`}
    ${r.liens && r.liens.length > 0 && html`<h3 className="mini-title">Envoi manuel</h3><p className="muted">Ouvrez chaque lien depuis un téléphone ou un ordinateur où WhatsApp ou la messagerie SMS est installé : le message est déjà écrit.</p>
      <ul className="links">${r.liens.map(l => html`<li key=${l.id}><span>${l.nom} <small className="muted">${CH_LABEL[l.canal]}</small></span>${isLinkOk(l.lien) && html`<a className="btn sm" href=${l.lien} target="_blank" rel="noopener noreferrer">Ouvrir</a>`}</li>`)}</ul>`}
  </div>`;
}

/* ---------- Identifiants créés à l'admission ---------- */
function CredentialsView({ comptes }) {
  const [done, setDone] = useState(false);
  const text = comptes.filter(c => c.pwd).map(c => (c.role === 'eleve' ? 'Élève' : 'Parent') + ' ' + c.nom + ' — identifiant : ' + c.login + ' — mot de passe provisoire : ' + c.pwd).join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); } catch (e) { setDone(false); } };
  return html`<div className="creds">
    <p className="dlg-msg">Ces mots de passe provisoires ne seront <strong>plus jamais affichés</strong>. Chaque personne devra choisir son propre mot de passe à sa première connexion.</p>
    ${comptes.map((c, i) => html`<div key=${i} className="cred"><strong>${c.role === 'eleve' ? 'Compte élève' : 'Compte parent'} — ${c.nom}</strong>
      <dl><dt>Identifiant</dt><dd className="mono">${c.login || '—'}</dd>${c.pwd ? html`<dt>Mot de passe provisoire</dt><dd className="mono pwd">${c.pwd}</dd>` : html`<dt>Mot de passe</dt><dd>${c.nouveau === false ? 'Compte déjà existant : mot de passe inchangé.' : '—'}</dd>`}</dl>
      ${c.note && html`<small className="hint">${c.note}</small>`}</div>`)}
    ${text && html`<${Btn} icon="copy" onClick=${copy}>${done ? 'Copié ✓' : 'Copier les accès'}<//>`}</div>`;
}

/* ---------- Page « Modules » : activer, renommer, personnaliser ---------- */
function ModuleEditor({ m, onClose }) {
  const app = useApp(); const { db, save, notify } = app, row = modRowOf(db, m.k);
  const listKeys = Object.keys(LIST_DEFS).filter(k => LIST_DEFS[k].mod === m.k);
  const [label, setLabel] = useState(row.label || ''), [sub, setSub] = useState(row.sub || ''), [ordre, setOrdre] = useState(row.ordre || 0);
  const [defs, setDefs] = useState(customDefs_(db, m.k).map(d => ({ ...d, o: (d.o || []).join(', ') })));
  const [lists, setLists] = useState(Object.fromEntries(listKeys.map(k => [k, listOf_(db, k).join('\n')])));
  const [opt, setOpt] = useState(modOpt_(db, m.k)), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const upd = (i, p) => setDefs(d => d.map((x, j) => j === i ? { ...x, ...p } : x));
  const submit = async () => {
    setErr('');
    const keys = new Set(), out = [];
    for (const d of defs) {
      if (!String(d.l || '').trim()) { setErr('Chaque champ personnalisé doit avoir un libellé.'); return; }
      let k = d.k || slug_(d.l), base = k, n = 2; while (keys.has(k)) k = base.slice(0, 17) + '_' + (n++); keys.add(k);
      const o = d.t === 'select' ? String(d.o || '').split(',').map(x => x.trim()).filter(Boolean) : undefined;
      if (d.t === 'select' && !o.length) { setErr('Le champ « ' + d.l + ' » est une liste de choix : indiquez au moins un choix, séparés par des virgules.'); return; }
      out.push({ k, l: d.l.trim(), t: d.t, req: !!d.req, liste: !!d.liste, o });
    }
    const outLists = {}; listKeys.forEach(k => { const a = lists[k].split('\n').map(x => x.trim()).filter(Boolean); if (a.length && a.join('|') !== LIST_DEFS[k].def.join('|')) outLists[k] = a; });
    setBusy(true);
    try {
      await save('modules', { id: m.k, label: label.trim() === m.l ? '' : label.trim(), sub: sub.trim(), actif: row.actif, ordre: Number(ordre) || 0, champs: out.length ? JSON.stringify(out) : '', listes: Object.keys(outLists).length ? JSON.stringify(outLists) : '', options: (OPTION_DEFS[m.k] || []).length ? JSON.stringify(opt) : '' });
      notify('Module « ' + (label.trim() || m.l) + ' » enregistré'); onClose();
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  const foot = html`<span className="grow"></span><${Btn} onClick=${onClose}>Annuler<//><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer<//>`;
  return html`<${Modal} title=${'Personnaliser — ' + m.l} onClose=${onClose} wide foot=${foot}>
    <div className="editor">
      <section className="ed-sec"><h3>Apparence</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="me-label">Nom affiché dans le menu</label><input id="me-label" value=${label} placeholder=${m.l} onChange=${e => setLabel(e.target.value)} /></div>
          <div className="field"><label htmlFor="me-ordre">Position dans son groupe</label><input id="me-ordre" type="number" min="0" max="99" value=${ordre} onChange=${e => setOrdre(e.target.value)} /><small className="hint">1 = en premier. 0 = ordre habituel.</small></div>
          <div className="field full"><label htmlFor="me-sub">Description sous le titre</label><input id="me-sub" value=${sub} placeholder="Texte d’aide affiché en haut de la page" onChange=${e => setSub(e.target.value)} /></div>
        </div></section>
      ${m.custom && html`<section className="ed-sec"><h3>Champs personnalisés</h3>
        <p className="muted">Ajoutez les informations propres à votre école. Elles apparaissent dans le formulaire de ce module${m.k === 'admissions' ? ' et dans le formulaire d’inscription en ligne' : ''}, et dans la liste si vous le demandez. Elles sont enregistrées dans la colonne « extra » de la feuille.</p>
        ${defs.map((d, i) => html`<div key=${i} className="cf-row">
          <div className="field"><label htmlFor=${'cf-l-' + i}>Libellé</label><input id=${'cf-l-' + i} value=${d.l || ''} onChange=${e => upd(i, { l: e.target.value })} placeholder="Ex. École précédente" /></div>
          <div className="field"><label htmlFor=${'cf-t-' + i}>Type</label><select id=${'cf-t-' + i} value=${d.t} onChange=${e => upd(i, { t: e.target.value })}>${Object.keys(CF_LABEL).map(t => html`<option key=${t} value=${t}>${CF_LABEL[t]}</option>`)}</select></div>
          ${d.t === 'select' && html`<div className="field"><label htmlFor=${'cf-o-' + i}>Choix (séparés par des virgules)</label><input id=${'cf-o-' + i} value=${d.o || ''} onChange=${e => upd(i, { o: e.target.value })} placeholder="Bus, À pied" /></div>`}
          <div className="cf-flags"><label className="check"><input type="checkbox" checked=${!!d.req} onChange=${e => upd(i, { req: e.target.checked })} /> <span>Obligatoire</span></label><label className="check"><input type="checkbox" checked=${!!d.liste} onChange=${e => upd(i, { liste: e.target.checked })} /> <span>Dans la liste</span></label>
            <button type="button" className="icon-btn danger" aria-label=${'Retirer le champ ' + (d.l || i + 1)} title="Retirer" onClick=${() => setDefs(x => x.filter((_, j) => j !== i))}><${Icon} n="trash" s=${16} /></button></div>
        </div>`)}
        ${defs.length < 15 ? html`<${Btn} icon="plus" sm onClick=${() => setDefs(x => [...x, { k: '', l: '', t: 'text', req: false, liste: false, o: '' }])}>Ajouter un champ<//>` : html`<p className="muted">15 champs au maximum par module.</p>`}
        ${defs.length > 0 && html`<p className="hint">Retirer un champ le masque ; les valeurs déjà saisies restent dans la feuille jusqu’à la prochaine modification de chaque fiche.</p>`}</section>`}
      ${listKeys.length > 0 && html`<section className="ed-sec"><h3>Listes de choix</h3><p className="muted">Une valeur par ligne. Les valeurs déjà utilisées restent affichées même si vous les retirez de la liste.</p>
        ${listKeys.map(k => html`<div key=${k} className="field full"><label htmlFor=${'ls-' + k}>${LIST_DEFS[k].l}</label><textarea id=${'ls-' + k} rows="5" value=${lists[k]} onChange=${e => setLists(x => ({ ...x, [k]: e.target.value }))}></textarea><div><button type="button" className="linkbtn" onClick=${() => setLists(x => ({ ...x, [k]: LIST_DEFS[k].def.join('\n') }))}>Rétablir les valeurs d’origine</button></div></div>`)}</section>`}
      ${(OPTION_DEFS[m.k] || []).length > 0 && html`<section className="ed-sec"><h3>Réglages</h3>
        ${OPTION_DEFS[m.k].map(d => html`<div key=${d.k} className="field full">${d.t === 'bool' ? html`<label className="check"><input id=${'op-' + d.k} type="checkbox" checked=${!!opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.checked }))} /> <span>${d.l}</span></label>`
          : html`<label htmlFor=${'op-' + d.k}>${d.l}</label>${d.t === 'select' ? html`<select id=${'op-' + d.k} value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value }))}>${d.o.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>` : d.t === 'num' ? html`<input id=${'op-' + d.k} type="number" min=${d.min} max=${d.max} value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value === '' ? '' : Number(e.target.value) }))} />` : html`<textarea id=${'op-' + d.k} rows="2" value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value }))}></textarea>`}`}</div>`)}
        ${m.k === 'admissions' && opt.mode === 'auto' && html`<p className="form-err">Attention : en validation automatique, n’importe qui peut occuper des places dans vos classes et créer des comptes sans contrôle humain. À réserver aux établissements qui surveillent le journal d’audit.</p>`}</section>`}
      ${err && html`<p className="form-err" role="alert">${err}</p>`}
    </div></${Modal}>`;
}
function ModulesPage() {
  const app = useApp(); const { db, save, notify } = app, [edit, setEdit] = useState(null);
  const toggle = async m => {
    const row = modRowOf(db, m.k), next = !row.actif;
    if (!next) { const ok = await app.ask({ title: 'Désactiver « ' + (row.label || m.l) + ' » ?', message: 'Le module disparaît du menu pour tout le monde et ses données ne sont plus envoyées aux utilisateurs. Rien n’est supprimé : vous pouvez le réactiver à tout moment.' + (m.k === 'admissions' ? ' Le formulaire d’inscription en ligne sera fermé.' : ''), submit: 'Désactiver', danger: true }); if (!ok) return; }
    try { await save('modules', { ...row, actif: next }); notify('Module ' + (next ? 'activé' : 'désactivé')); } catch (e) { notify(e.message, 'bad'); }
  };
  const groups = GROUPS.map(g => [g, MODS.filter(m => m.g === g && !m.sys && !m.fixed)]).filter(x => x[1].length);
  return html`<section><${PageHead} title="Modules" sub="Activez, renommez et personnalisez chaque module : champs supplémentaires, listes de choix, réglages. Les droits d’accès se règlent dans « Autorisations »." >${html`<${Btn} icon="shield" onClick=${() => app.go('perms')}>Autorisations<//>`}<//>
    ${groups.map(([g, mods]) => html`<div key=${g} className="card flush"><h2 className="card-title pad">${g}</h2><div className="tablewrap"><table className="t stack"><thead><tr><th>Module</th><th>Personnalisation</th><th>État</th><th className="actions"><span className="sr">Actions</span></th></tr></thead><tbody>
      ${mods.map(m => { const row = modRowOf(db, m.k), n = customDefs_(db, m.k).length, lists = Object.keys(parseJson_(row.listes, {})).length;
    return html`<tr key=${m.k} className=${row.actif ? '' : 'off'}><td data-l="Module"><strong>${row.label || m.l}</strong>${row.label && row.label !== m.l && html` <small className="muted">(${m.l})</small>`}</td>
      <td data-l="Personnalisation">${n > 0 && B('info', n + ' champ' + (n > 1 ? 's' : ''))} ${lists > 0 && B('info', lists + ' liste' + (lists > 1 ? 's' : ''))} ${m.custom || Object.keys(LIST_DEFS).some(k => LIST_DEFS[k].mod === m.k) || OPTION_DEFS[m.k] ? '' : html`<span className="muted">Nom et position</span>`}${n === 0 && lists === 0 && (m.custom || OPTION_DEFS[m.k]) && html`<span className="muted">Standard</span>`}</td>
      <td data-l="État">${B(row.actif ? 'ok' : 'mute', row.actif ? 'Actif' : 'Désactivé')}</td>
      <td className="actions"><button type="button" className="icon-btn txt" aria-label=${(row.actif ? 'Désactiver ' : 'Activer ') + (row.label || m.l)} onClick=${() => toggle(m)}><span>${row.actif ? 'Désactiver' : 'Activer'}</span></button><button type="button" className="icon-btn txt" aria-label=${'Personnaliser ' + (row.label || m.l)} onClick=${() => setEdit(m)}><${Icon} n="sliders" s=${15} /><span>Personnaliser</span></button></td></tr>`; })}
    </tbody></table></div></div>`)}
    ${edit && html`<${ModuleEditor} m=${edit} onClose=${() => setEdit(null)} />`}</section>`;
}

/* ---------- Matrice d'autorisations ---------- */
const VERB_L = { v: 'Voir', c: 'Créer', m: 'Modifier', s: 'Supprimer' };
function PermsPage() {
  const app = useApp(); const { db, save, remove, ask, notify } = app, [busy, setBusy] = useState(false);
  const roles = ROLE_IDS.slice(1);
  const ov = (role, k) => db.perms.find(p => p.role === role && p.module === k);
  const eff = (role, m) => { const o = ov(role, m.k); return normRights_(m, o ? o.droits : defRights_(role, m.k)); };
  const flip = async (role, m, verb) => {
    const set = new Set(eff(role, m).split('')); if (set.has(verb)) { set.delete(verb); if (verb === 'v') set.clear(); } else { set.add(verb); set.add('v'); }
    const droits = 'vcms'.split('').filter(c => set.has(c)).join('');
    setBusy(true); try { await save('perms', { role, module: m.k, droits }); } catch (e) { notify(e.message, 'bad'); } setBusy(false);
  };
  const reset = async role => {
    const ids = db.perms.filter(p => p.role === role).map(p => p.id); if (!ids.length) { notify('Ce rôle utilise déjà les droits standard'); return; }
    const ok = await ask({ title: 'Rétablir les droits standard ?', message: 'Les ' + ids.length + ' réglage(s) personnalisés du rôle « ' + ROLE_LABEL[role] + ' » sont effacés ; ses droits redeviennent ceux d’origine.', submit: 'Rétablir', danger: true }); if (!ok) return;
    await remove('perms', ids); notify('Droits standard rétablis pour ' + ROLE_LABEL[role]);
  };
  const groups = GROUPS.map(g => [g, MODS.filter(m => m.g === g && !m.sys && !m.fixed)]).filter(x => x[1].length);
  const nMod = db.perms.length;
  return html`<section><${PageHead} title="Autorisations" sub="Qui peut voir, créer, modifier ou supprimer dans chaque module. Un clic sur une lettre active ou retire le droit.">${html`<${Btn} icon="sliders" onClick=${() => app.go('modules')}>Modules<//>`}<//>
    <div className="card"><div className="perm-legend">${Object.keys(VERB_L).map(v => html`<span key=${v}><i className="vchip on">${v.toUpperCase()}</i>${VERB_L[v]}</span>`)}<span><i className="vchip on diff">V</i>Réglage modifié</span></div>
      <p className="muted">La direction a toujours tous les droits. Chaque module a un plafond de sécurité : par exemple, les paiements et le barème ne peuvent être confiés qu’au secrétariat, et les familles ne peuvent jamais modifier de données. ${nMod > 0 ? nMod + ' réglage(s) personnalisé(s) en vigueur.' : 'Tous les rôles utilisent les droits standard.'}</p></div>
    <div className="card flush"><div className="tablewrap perm"><table className="t perm-t"><thead><tr><th>Module</th>${roles.map(r => html`<th key=${r} className="rolecol"><span>${ROLE_LABEL[r]}</span><button type="button" className="linkbtn" aria-label=${'Rétablir les droits standard : ' + ROLE_LABEL[r]} onClick=${() => reset(r)}>Rétablir</button></th>`)}</tr></thead>
      <tbody>${groups.map(([g, mods]) => html`<${Fragment} key=${g}><tr className="grp-row"><th colSpan=${roles.length + 1}>${g}</th></tr>${mods.map(m => {
    const row = modRowOf(db, m.k), label = row.label || m.l;
    return html`<tr key=${m.k} className=${row.actif ? '' : 'off'}><th scope="row">${label}${!row.actif && html` <small className="muted">(désactivé)</small>`}</th>${roles.map(r => {
      if (m.el.indexOf(r) < 0) return html`<td key=${r} className="na" title="Ce rôle ne peut pas recevoir de droits sur ce module">—</td>`;
      const cur = eff(r, m), changed = !!ov(r, m.k) && ov(r, m.k).droits !== normRights_(m, defRights_(r, m.k));
      return html`<td key=${r}><div className="vchips">${m.verbs.split('').map(v => { const on = cur.indexOf(v) >= 0; return html`<button type="button" key=${v} disabled=${busy} className=${'vchip' + (on ? ' on' : '') + (on && changed ? ' diff' : '')} aria-pressed=${on} aria-label=${ROLE_LABEL[r] + ' — ' + label + ' — ' + VERB_L[v]} title=${VERB_L[v]} onClick=${() => flip(r, m, v)}>${v.toUpperCase()}</button>`; })}</div></td>`;
    })}</tr>`;
  })}<//>`)}</tbody></table></div></div></section>`;
}

/* ---------- Canaux de communication ---------- */
const SAMPLE_VARS = () => ({ ecole: (APP_DB.settings[0] || {}).ecole || 'Votre école', parent: 'Fatou Ndiaye', nom: 'Fatou Ndiaye', eleve: 'Awa Ndiaye', ref: 'INS-2026-0001', identifiant: 'fatou@exemple.sn', classe: '6ème A', admission: 'ADM-2026-031', acces: '', montant: '22 000 F', nature: 'Mensualité Octobre', recu: 'REC-2026-0042', date: fmtDate(todayStr()), reste: '44 000 F' });
let APP_DB = { settings: [] };
const PROVIDER_HELP = {
  gmail: 'Les e-mails partent du compte Google qui a déployé l’application (Gmail). Limite journalière : environ 100 destinataires avec un compte Gmail gratuit, 1 500 avec Google Workspace.',
  lien: 'Aucun envoi automatique : l’application prépare le message et un lien (WhatsApp ou SMS) que vous ouvrez depuis un téléphone. Gratuit, mais manuel.',
  twilio: 'Envoi automatique par votre compte Twilio (payant à l’usage). Indiquez le numéro expéditeur (ex. +1…, ou « whatsapp:+14155238886 » pour le bac à sable WhatsApp, ou l’identifiant d’un service de messagerie MG… pour les SMS). Pour WhatsApp, un message à un parent qui n’a pas écrit à l’école depuis 24 h doit utiliser un modèle approuvé par WhatsApp : sinon Twilio refuse l’envoi.',
  webhook: 'Chaque message est envoyé en JSON { canal, to, nom, texte, event } à une adresse https que vous contrôlez (passerelle SMS locale, opérateur, Make, Zapier…). Un secret facultatif est transmis dans l’en-tête X-Scolaria-Secret.'
};
function ChannelCard({ c, status, onStatus }) {
  const app = useApp(); const { db, save, notify } = app, cur = chanOf_(db, c), def = CHANNEL_DEFS[c];
  const [actif, setActif] = useState(cur.actif), [prov, setProv] = useState(cur.fournisseur), [exp, setExp] = useState(cur.expediteur || ''), [from, setFrom] = useState(cur.options.from || ''), [sec, setSec] = useState({}), [to, setTo] = useState(''), [busy, setBusy] = useState(false);
  const names = (def.secrets || {})[prov] || [], has = (status[c] || {});
  const submit = async () => {
    setBusy(true);
    try { await save('channels', { id: c, actif, fournisseur: prov, expediteur: c === 'email' ? exp : '', options: prov === 'twilio' && from.trim() ? JSON.stringify({ from: from.trim() }) : '' }); notify(def.l + ' : réglages enregistrés'); } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  const saveSecret = async n => {
    if (!IN_GAS) { notify('Démonstration : les clés ne sont enregistrées que sur Google Apps Script.', 'bad'); return; }
    try { await Api.setSecret(c, n, sec[n] || ''); setSec(x => ({ ...x, [n]: '' })); notify(sec[n] ? 'Clé enregistrée (stockée hors de la feuille)' : 'Clé effacée'); onStatus(); } catch (e) { notify(e.message, 'bad'); }
  };
  const test = async () => {
    setBusy(true);
    try {
      if (!IN_GAS) notify('Démonstration : aucun message réel n’est envoyé.');
      else { const r = await Api.testChannel(c, to); notify(r.statut === 'Envoyé' ? 'Message d’essai envoyé' : r.statut === 'À envoyer' ? 'Lien d’essai prêt dans le journal des envois' : 'Échec : ' + r.detail, r.statut === 'Échec' ? 'bad' : ''); await app.reload(); }
    } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  return html`<article className="card ch-card" id=${'ch-' + c}><header><h2 className="card-title">${def.l}</h2><label className="check"><input type="checkbox" id=${'ch-actif-' + c} checked=${actif} onChange=${e => setActif(e.target.checked)} /> <span>Activé</span></label></header>
    <div className="form-grid">
      <div className="field"><label htmlFor=${'ch-prov-' + c}>Fournisseur</label><select id=${'ch-prov-' + c} value=${prov} onChange=${e => setProv(e.target.value)}>${def.providers.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>
      ${c === 'email' && html`<div className="field"><label htmlFor="ch-exp-email">Nom de l’expéditeur</label><input id="ch-exp-email" value=${exp} placeholder="Nom de l’école" onChange=${e => setExp(e.target.value)} /></div>`}
      ${prov === 'twilio' && html`<div className="field"><label htmlFor=${'ch-from-' + c}>Numéro ou service expéditeur</label><input id=${'ch-from-' + c} value=${from} placeholder=${c === 'whatsapp' ? 'whatsapp:+14155238886' : '+12025550123 ou MG…'} onChange=${e => setFrom(e.target.value)} /></div>`}
    </div>
    <p className="muted small">${PROVIDER_HELP[prov]}${c === 'email' && status.quota >= 0 ? ' Envois restants aujourd’hui : ' + status.quota + '.' : ''}</p>
    ${names.length > 0 && html`<div className="secrets"><h3 className="mini-title">Clés d’accès</h3><p className="muted small">Gardées dans les propriétés protégées du script, jamais dans la feuille. Une fois enregistrée, une clé ne s’affiche plus ; pour la remplacer, saisissez la nouvelle.</p>
      ${names.map(n => html`<div key=${n} className="secret-row"><div className="field"><label htmlFor=${'sec-' + c + '-' + n}>${SECRET_LABELS[n]}</label><input id=${'sec-' + c + '-' + n} type="password" autoComplete="off" value=${sec[n] || ''} placeholder=${has[n] ? '•••••••• (enregistrée)' : 'Non renseignée'} onChange=${e => setSec(x => ({ ...x, [n]: e.target.value }))} /></div>
        <${Btn} sm onClick=${() => saveSecret(n)}>${sec[n] ? 'Enregistrer' : has[n] ? 'Effacer' : 'Enregistrer'}<//>${has[n] && B('ok', 'Enregistrée')}</div>`)}</div>`}
    <div className="form-foot split"><div className="inline-test"><label className="sr" htmlFor=${'ch-test-' + c}>Destinataire de l’essai</label><input id=${'ch-test-' + c} value=${to} placeholder=${c === 'email' ? 'votre e-mail (vide = le vôtre)' : 'numéro, ex. 77 123 45 67'} onChange=${e => setTo(e.target.value)} /><${Btn} sm disabled=${busy} onClick=${test}>Envoyer un essai<//></div><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer ${def.l}<//></div></article>`;
}
function TemplateCard({ ev }) {
  const app = useApp(); const { db, save, remove, notify } = app, d = EVENTS[ev], cur = tplOf_(db, ev), custom = !!db.templates.find(x => x.id === ev);
  const [v, setV] = useState({ actif: cur.actif, email: cur.email, sms: cur.sms, whatsapp: cur.whatsapp, sujet: cur.sujet, texte: cur.texte }), [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await save('templates', { id: ev, ...v }); notify('Message « ' + d.l + ' » enregistré'); } catch (e) { notify(e.message, 'bad'); } setBusy(false); };
  const back = async () => { setV({ actif: d.def.actif, email: d.def.email, sms: d.def.sms, whatsapp: d.def.whatsapp, sujet: d.def.sujet, texte: d.def.texte }); if (custom) await remove('templates', [ev]); notify('Modèle d’origine rétabli'); };
  const chk = k => html`<label className="check"><input type="checkbox" id=${'tp-' + ev + '-' + k} checked=${!!v[k]} onChange=${e => setV({ ...v, [k]: e.target.checked })} /> <span>${CH_LABEL[k]}</span></label>`;
  return html`<article className="card tpl-card" id=${'tp-' + ev}><header><h3 className="card-title">${d.l}</h3><label className="check"><input type="checkbox" id=${'tp-' + ev + '-actif'} checked=${!!v.actif} onChange=${e => setV({ ...v, actif: e.target.checked })} /> <span>Envoi automatique</span></label></header>
    <div className="tpl-ch">${['email', 'sms', 'whatsapp'].map(k => html`<${Fragment} key=${k}>${chk(k)}<//>`)}</div>
    ${v.email && html`<div className="field"><label htmlFor=${'tp-' + ev + '-sujet'}>Objet de l’e-mail</label><input id=${'tp-' + ev + '-sujet'} value=${v.sujet} onChange=${e => setV({ ...v, sujet: e.target.value })} /></div>`}
    <div className="field"><label htmlFor=${'tp-' + ev + '-texte'}>Texte du message</label><textarea id=${'tp-' + ev + '-texte'} rows="4" value=${v.texte} onChange=${e => setV({ ...v, texte: e.target.value })}></textarea><small className="hint">Variables : ${d.vars.split(', ').map(x => '{' + x + '}').join(' ')}</small></div>
    <div className="preview"><small className="muted">Aperçu</small><p>${renderTpl_(v.texte, SAMPLE_VARS())}</p></div>
    <div className="form-foot split"><button type="button" className="linkbtn" onClick=${back}>Rétablir le modèle d’origine</button><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer<//></div></article>`;
}
function ChannelsPage() {
  const app = useApp(); const { db } = app; APP_DB = db;
  const [status, setStatus] = useState({ quota: -1 });
  const refresh = useCallback(() => { if (IN_GAS) Api.secretsStatus().then(setStatus).catch(() => { /* réservé à la direction */ }); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return html`<section><${PageHead} title="Canaux de communication" sub="E-mail, SMS et WhatsApp : fournisseur, clés d’accès et messages automatiques envoyés aux familles." />
    <div className="card note-info"><${Icon} n="send" s=${20} /><div><strong>Chaque famille garde la main.</strong><p className="muted">Depuis son profil, chacun choisit les moyens par lesquels l’école peut le joindre. Les messages ne partent que par les canaux activés ici ET acceptés par le destinataire. Vous pouvez aussi écrire à tout le monde depuis « Envoyer un message ».</p></div></div>
    ${!IN_GAS && html`<div className="card note-info"><${Icon} n="alert" s=${20} /><div><strong>Démonstration</strong><p className="muted">Les réglages sont enregistrés dans ce navigateur, mais aucun message réel n’est envoyé et les clés d’accès ne sont pas conservées.</p></div></div>`}
    <div className="chgrid">${CH_ALL.map(c => html`<${ChannelCard} key=${c + db.channels.length} c=${c} status=${status} onStatus=${refresh} />`)}</div>
    <h2 className="sec-title">Messages automatiques</h2>
    <div className="tplgrid">${Object.keys(EVENTS).filter(e => !EVENTS[e].hidden).map(e => html`<${TemplateCard} key=${e} ev=${e} />`)}</div></section>`;
}

/* ---------- Envoyer un message ---------- */
const AUDIENCES = [['classe', 'Les parents d’une classe'], ['parents', 'Tous les parents'], ['enseignants', 'Les enseignants'], ['personnel', 'Enseignants et personnel']];
function MessagesPage() {
  const app = useApp(); const { db, notify, ask } = app, active = CH_ALL.filter(c => chanOf_(db, c).actif);
  const [aud, setAud] = useState('classe'), [cid, setCid] = useState((sortedClasses(db)[0] || {}).id || ''), [canaux, setCanaux] = useState(active), [sujet, setSujet] = useState(''), [texte, setTexte] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null);
  const spec = { audience: aud, classId: cid, canaux, sujet, texte };
  let est = null; try { est = texte.trim() && canaux.length ? broadcastPlan_(db, spec).plan.length : null; } catch (e) { est = null; }
  const toggle = c => setCanaux(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c]);
  const send = async () => {
    if (!canaux.length) { notify('Choisissez au moins un canal', 'bad'); return; }
    if (!texte.trim()) { notify('Écrivez le message', 'bad'); return; }
    const ok = await ask({ title: 'Envoyer ce message ?', message: (est !== null ? 'Environ ' + est + ' message(s) vont être préparés' : 'Le message va être préparé') + ' (' + canaux.map(c => CH_LABEL[c]).join(', ') + '). Les destinataires qui n’acceptent pas un canal sont ignorés pour ce canal.', submit: 'Envoyer' }); if (!ok) return;
    setBusy(true); setRes(null);
    try { setRes(await app.broadcast(spec)); notify('Message traité'); } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  return html`<section><${PageHead} title="Envoyer un message" sub="Écrivez une fois, l’école l’envoie par e-mail, SMS ou WhatsApp selon les canaux activés et les préférences de chaque famille.">${app.can('outbox', 'view') && html`<${Btn} icon="mail" onClick=${() => app.go('outbox')}>Journal des envois<//>`}<//>
    ${!active.length ? html`<${Empty} icon="send" title="Aucun canal activé">La direction peut activer l’e-mail, les SMS ou WhatsApp dans « Canaux de communication ».<//>` : html`<div className="card"><div className="form-grid">
      <div className="field"><label htmlFor="ms-aud">Destinataires</label><select id="ms-aud" value=${aud} onChange=${e => setAud(e.target.value)}>${AUDIENCES.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>
      ${aud === 'classe' && html`<${ClassSelect} id="ms-class" classes=${sortedClasses(db)} value=${cid} onChange=${setCid} />`}
      <fieldset className="field full prefs"><legend>Canaux</legend>${CH_ALL.map(c => { const ch = chanOf_(db, c); return html`<label key=${c} className="check"><input type="checkbox" id=${'ms-ch-' + c} disabled=${!ch.actif} checked=${canaux.includes(c) && ch.actif} onChange=${() => toggle(c)} /> <span>${CH_LABEL[c]}${!ch.actif ? ' (désactivé)' : ch.fournisseur === 'lien' && c !== 'email' ? ' — liens manuels' : ''}</span></label>`; })}</fieldset>
      ${canaux.includes('email') && html`<div className="field full"><label htmlFor="ms-sujet">Objet de l’e-mail</label><input id="ms-sujet" value=${sujet} placeholder=${'Message de ' + ((db.settings[0] || {}).ecole || 'l’école')} onChange=${e => setSujet(e.target.value)} /></div>`}
      <div className="field full"><label htmlFor="ms-texte">Message</label><textarea id="ms-texte" rows="5" maxLength="600" value=${texte} onChange=${e => setTexte(e.target.value)}></textarea><small className="hint">${texte.length} / 600 caractères.${canaux.includes('sms') && texte.length > 160 ? ' Au-delà de 160 caractères, un SMS est facturé comme plusieurs messages.' : ''}${est !== null ? ' Environ ' + est + ' message(s) seront préparés.' : ''}</small></div>
    </div><div className="form-foot"><${Btn} tone="primary" icon="send" disabled=${busy} onClick=${send}>${busy ? 'Envoi…' : 'Envoyer'}<//></div></div>`}
    ${res && html`<div className="card" id="ms-result"><h2 className="card-title">Résultat</h2><${SendSummary} r=${res} /></div>`}</section>`;
}

/* ---------- Journal des envois ---------- */
const ST_TONE = { 'Envoyé': 'ok', 'Envoyé (manuel)': 'ok', 'Simulé': 'info', 'À envoyer': 'warn', 'Échec': 'bad', 'Non envoyé': 'bad' };
CFG.outbox = {
  key: 'outbox', icon: 'mail', title: 'Journal des envois', sub: 'Tous les messages préparés ou envoyés par l’école. Les mots de passe et clés n’y apparaissent jamais.', nl: '', singular: 'message', rowTitle: () => 'message', noEdit: true, custom: false,
  fields: [], cols: [{ l: 'Date', v: r => fmtDT(r.at) }, { l: 'Canal', v: r => CH_LABEL[r.canal] || r.canal }, { l: 'Destinataire', v: r => r.nom + ' · ' + r.to }, { l: 'Message', v: r => r.texte }, { l: 'Statut', v: r => r.statut, r: r => html`${B(ST_TONE[r.statut] || 'mute', r.statut)}${r.detail && html` <small className="muted">${r.detail}</small>`}` }],
  filters: [{ k: 'statut', l: 'Statut', t: 'select', o: db => [...new Set(db.outbox.map(r => r.statut))] }, { k: 'canal', l: 'Canal', t: 'select', o: CH_ALL.map(c => ({ v: c, l: CH_LABEL[c] })) }],
  sort: (a, b) => b.at.localeCompare(a.at), delMsg: 'Cette ligne du journal sera supprimée.',
  rowActions: [
    { l: 'Ouvrir', i: 'link', open: true, show: r => r.statut === 'À envoyer' && isLinkOk(r.lien), run: r => { window.open(r.lien, '_blank', 'noopener,noreferrer'); } },
    { l: 'Marquer envoyé', i: 'check', show: r => r.statut === 'À envoyer', run: async (r, app) => { try { await app.markSent(r.id); app.notify('Message marqué comme envoyé'); } catch (e) { app.notify(e.message, 'bad'); } } }]
};

/* ===== Scolaria : inscription en ligne sans connexion, changement du mot de passe provisoire ===== */
const REG_MAX_KIDS = 5;
const emptyKid = () => ({ prenom: '', nom: '', sexe: '', naissance: '', classId: '', remarque: '', extra: {} });
/* Même contenu que « apiStatus().registration » du serveur, calculé sur la base locale (démonstration, familles connectées). */
function regInfoOf(db) {
  const o = modOpt_(db, 'admissions');
  return { open: !!o.public && modActive_('admissions', db.modules), mode: o.mode, indicatif: (db.settings[0] || {}).indicatif || '221', consentement: o.consentement, classes: db.classes.map(c => ({ id: c.id, nom: c.nom, niveau: c.niveau })), champs: customDefs_(db, 'admissions'), liens: listOf_(db, 'parents.lien'), canaux: CH_ALL.filter(c => chanOf_(db, c).actif) };
}
const RF = ({ id, label, err, hint, full, children }) => html`<div className=${'field' + (full ? ' full' : '') + (err ? ' has-err' : '')}><label htmlFor=${id}>${label}</label>${children}${err ? html`<small className="err">${err}</small>` : hint && html`<small className="hint">${hint}</small>`}</div>`;

function CustomInput({ d, id, value, onChange, err }) {
  const label = d.l + (d.req && d.t !== 'bool' ? ' *' : '');
  if (d.t === 'bool') return html`<div className="field"><label className="check"><input id=${id} type="checkbox" checked=${!!value} onChange=${e => onChange(e.target.checked)} /> <span>${d.l}</span></label></div>`;
  return html`<${RF} id=${id} label=${label} err=${err} full=${d.t === 'area'}>${d.t === 'area' ? html`<textarea id=${id} rows="3" value=${value ?? ''} onChange=${e => onChange(e.target.value)}></textarea>`
    : d.t === 'select' ? html`<select id=${id} value=${value ?? ''} onChange=${e => onChange(e.target.value)}><option value="">—</option>${(d.o || []).map(x => html`<option key=${x} value=${x}>${x}</option>`)}</select>`
    : html`<input id=${id} type=${d.t === 'num' ? 'number' : d.t === 'date' ? 'date' : 'text'} value=${value ?? ''} onChange=${e => onChange(d.t === 'num' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />`}<//>`;
}

function KidFields({ i, k, set, info, errs, n }) {
  const p = 'k' + i + '-';
  return html`<div className="kid-form"><h3 className="mini-title">${n > 1 ? 'Enfant ' + (i + 1) : 'L’enfant à inscrire'}</h3><div className="form-grid">
    <${RF} id=${p + 'prenom'} label="Prénom *" err=${errs[p + 'prenom']}><input id=${p + 'prenom'} autoComplete="off" value=${k.prenom} onChange=${e => set({ prenom: e.target.value })} /><//>
    <${RF} id=${p + 'nom'} label="Nom *" err=${errs[p + 'nom']}><input id=${p + 'nom'} autoComplete="off" value=${k.nom} onChange=${e => set({ nom: e.target.value })} /><//>
    <${RF} id=${p + 'sexe'} label="Sexe *" err=${errs[p + 'sexe']}><select id=${p + 'sexe'} value=${k.sexe} onChange=${e => set({ sexe: e.target.value })}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></select><//>
    <${RF} id=${p + 'naissance'} label="Date de naissance *" err=${errs[p + 'naissance']}><input id=${p + 'naissance'} type="date" max=${todayStr()} value=${k.naissance} onChange=${e => set({ naissance: e.target.value })} /><//>
    <${RF} id=${p + 'classId'} label="Classe demandée *" err=${errs[p + 'classId']} full=${true}><select id=${p + 'classId'} value=${k.classId} onChange=${e => set({ classId: e.target.value })}><option value="">—</option>${info.classes.map(c => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>
    ${(info.champs || []).map(d => html`<${CustomInput} key=${d.k} d=${d} id=${p + 'x-' + d.k} value=${k.extra[d.k]} onChange=${v => set({ extra: { ...k.extra, [d.k]: v } })} err=${errs[p + 'x-' + d.k]} />`)}
    <${RF} id=${p + 'remarque'} label="Remarque pour le secrétariat" full=${true}><textarea id=${p + 'remarque'} rows="2" maxLength="200" value=${k.remarque} onChange=${e => set({ remarque: e.target.value })}></textarea><//>
  </div></div>`;
}

function validateRegistration(f, info, connected, ind) {
  const e = {};
  if (!connected) {
    const p = f.parent;
    if (!p.prenom.trim()) e['p-prenom'] = 'Champ obligatoire';
    if (!p.nom.trim()) e['p-nom'] = 'Champ obligatoire';
    if (!p.lien) e['p-lien'] = 'Choisissez votre lien avec l’enfant';
    if (!validPhone_(p.tel, ind)) e['p-tel'] = 'Numéro invalide (exemple : 77 123 45 67)';
    if (p.email.trim() && !validEmail_(p.email)) e['p-email'] = 'Adresse e-mail invalide';
    if (p.pwd.length < 8) e['p-pwd'] = 'Au moins 8 caractères'; else if (p.pwd !== p.pwd2) e['p-pwd2'] = 'Les deux mots de passe ne correspondent pas';
    if (!String(f.cans).trim()) e.cans = 'Répondez à la question';
  }
  f.enfants.forEach((k, i) => {
    const p = 'k' + i + '-';
    if (!k.prenom.trim()) e[p + 'prenom'] = 'Champ obligatoire';
    if (!k.nom.trim()) e[p + 'nom'] = 'Champ obligatoire';
    if (!k.sexe) e[p + 'sexe'] = 'Choisissez';
    if (!k.classId) e[p + 'classId'] = 'Choisissez une classe';
    if (!validDate_(k.naissance)) e[p + 'naissance'] = 'Date invalide'; else { const a = ageOn_(k.naissance, todayStr()); if (a < 2 || a > 25) e[p + 'naissance'] = 'L’âge doit être compris entre 2 et 25 ans'; }
    (info.champs || []).forEach(d => { if (d.req && d.t !== 'bool' && (k.extra[d.k] === undefined || k.extra[d.k] === '')) e[p + 'x-' + d.k] = 'Champ obligatoire'; });
  });
  if (!f.consent) e.consent = 'Veuillez accepter pour continuer';
  return e;
}

/* connected : une famille déjà connectée ajoute un enfant (pas de compte à créer). run(form) envoie la demande. */
function RegisterScreen({ info, connected, onBack, onEnter, run, makeChallenge, schoolName, indicatif }) {
  const [p, setP] = useState({ prenom: '', nom: '', lien: '', tel: '', email: '', pwd: '', pwd2: '' }), [kids, setKids] = useState([emptyKid()]);
  const [canaux, setCanaux] = useState(info.canaux || []), [consent, setConsent] = useState(false), [ans, setAns] = useState(''), [site, setSite] = useState('');
  const [chal, setChal] = useState(null), [errs, setErrs] = useState({}), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  const loadChal = useCallback(() => { if (!connected) makeChallenge().then(setChal).catch(e => setErr(e.message || String(e))); }, [connected]);
  useEffect(() => { loadChal(); }, [loadChal]);
  const setK = i => patch => setKids(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
  const setPf = k => e => setP(x => ({ ...x, [k]: e.target.value }));
  const toggleCh = c => setCanaux(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c]);
  const submit = async e => {
    e.preventDefault(); setErr('');
    const form = { cid: chal && chal.id, cans: ans, site, consent, canaux, parent: p, enfants: kids };
    const v = validateRegistration(form, info, connected, indicatif); setErrs(v);
    if (Object.keys(v).length) { setErr('Certains champs sont à corriger (en rouge ci-dessous).'); setTimeout(() => { const first = document.querySelector('.has-err input, .has-err select, .has-err textarea'); if (first) first.focus(); }, 0); return; }
    setBusy(true);
    try { const r = await run(form); setDone({ ...r, login: loginKey_(p.email || p.tel) }); }
    catch (x) { setErr(x.message || String(x)); if (/vérification|expiré|incorrecte/i.test(x.message || '')) { setAns(''); loadChal(); } }
    setBusy(false);
  };
  if (done) return html`<div className="boot"><div className="boot-card reg-done"><div className="logo-mark ok">✓</div><strong>Demande reçue</strong>
    <p className="muted">${done.refs.length > 1 ? 'Références des dossiers : ' : 'Référence du dossier : '}<span className="mono">${done.refs.join(', ')}</span></p>
    ${done.admis > 0 ? html`<p>${done.admis > 1 ? 'Les enfants sont admis.' : 'L’enfant est admis.'} Votre espace famille est ouvert.</p>` : html`<p>Le secrétariat examine votre demande. Vous serez prévenu${(info.canaux || []).length ? ' par message' : ''} dès qu’elle est traitée ; votre espace famille se complète alors automatiquement.</p>`}
    ${!connected && html`<p className="muted">Pour revenir plus tard, connectez-vous avec l’identifiant <strong className="mono">${done.login}</strong> et le mot de passe que vous venez de choisir.</p>`}
    ${done.comptes && done.comptes.length > 0 && html`<${CredentialsView} comptes=${done.comptes} />`}
    <${Btn} tone="primary" onClick=${onEnter}>Accéder à mon espace<//></div></div>`;
  return html`<div className="reg"><form className="reg-card" onSubmit=${submit} noValidate>
    <header className="reg-head"><div className="logo-mark">S</div><div><h1>Inscription en ligne</h1><p className="muted">${schoolName || ''}${connected ? ' — ajouter un enfant' : ' — aucun compte à créer avant : votre espace famille s’ouvre automatiquement.'}</p></div>${onBack && html`<${Btn} sm onClick=${onBack}>${connected ? 'Annuler' : 'Retour'}<//>`}</header>
    ${!connected && html`<fieldset className="card"><legend className="card-title">Parent ou tuteur</legend><div className="form-grid">
      <${RF} id="p-prenom" label="Prénom *" err=${errs['p-prenom']}><input id="p-prenom" autoComplete="given-name" value=${p.prenom} onChange=${setPf('prenom')} /><//>
      <${RF} id="p-nom" label="Nom *" err=${errs['p-nom']}><input id="p-nom" autoComplete="family-name" value=${p.nom} onChange=${setPf('nom')} /><//>
      <${RF} id="p-lien" label="Lien avec l’enfant *" err=${errs['p-lien']}><select id="p-lien" value=${p.lien} onChange=${setPf('lien')}><option value="">—</option>${info.liens.map(l => html`<option key=${l} value=${l}>${l}</option>`)}</select><//>
      <${RF} id="p-tel" label="Téléphone *" err=${errs['p-tel']} hint="Utilisé pour vous joindre et, sans e-mail, pour vous connecter."><input id="p-tel" type="tel" autoComplete="tel" placeholder="77 123 45 67" value=${p.tel} onChange=${setPf('tel')} /><//>
      <${RF} id="p-email" label="E-mail (facultatif)" err=${errs['p-email']} hint="Sert d’identifiant de connexion s’il est renseigné."><input id="p-email" type="email" autoComplete="email" value=${p.email} onChange=${setPf('email')} /><//>
      <div className="field"></div>
      <${RF} id="p-pwd" label="Mot de passe *" err=${errs['p-pwd']} hint="8 caractères minimum."><input id="p-pwd" type="password" autoComplete="new-password" value=${p.pwd} onChange=${setPf('pwd')} /><//>
      <${RF} id="p-pwd2" label="Confirmer le mot de passe *" err=${errs['p-pwd2']}><input id="p-pwd2" type="password" autoComplete="new-password" value=${p.pwd2} onChange=${setPf('pwd2')} /><//>
    </div></fieldset>`}
    <fieldset className="card"><legend className="card-title">${kids.length > 1 ? 'Enfants' : 'Enfant'}</legend>
      ${kids.map((k, i) => html`<div key=${i} className="kid-block"><${KidFields} i=${i} k=${k} set=${setK(i)} info=${info} errs=${errs} n=${kids.length} />${kids.length > 1 && html`<${Btn} sm onClick=${() => setKids(ks => ks.filter((_, j) => j !== i))}>Retirer cet enfant<//>`}</div>`)}
      ${kids.length < REG_MAX_KIDS && html`<${Btn} icon="plus" onClick=${() => setKids(ks => [...ks, emptyKid()])}>Ajouter un autre enfant<//>`}</fieldset>
    ${!connected && (info.canaux || []).length > 0 && html`<fieldset className="card prefs"><legend className="card-title">Comment l’école peut vous joindre</legend>${info.canaux.map(c => html`<label key=${c} className="check"><input type="checkbox" id=${'rc-' + c} checked=${canaux.includes(c)} onChange=${() => toggleCh(c)} /> <span>${CH_LABEL[c]}</span></label>`)}<small className="hint">Vous pourrez changer ce choix dans votre profil.</small></fieldset>`}
    <fieldset className="card"><div className=${'field' + (errs.consent ? ' has-err' : '')}><label className="check"><input id="reg-consent" type="checkbox" checked=${consent} onChange=${e => setConsent(e.target.checked)} /> <span>${info.consentement}</span></label>${errs.consent && html`<small className="err">${errs.consent}</small>`}</div>
      ${!connected && html`<div className=${'field' + (errs.cans ? ' has-err' : '')}><label htmlFor="reg-cans">Vérification : combien font ${chal ? chal.q : '…'} ?</label><input id="reg-cans" inputMode="numeric" autoComplete="off" value=${ans} onChange=${e => setAns(e.target.value)} />${errs.cans && html`<small className="err">${errs.cans}</small>`}</div>
      <div className="hp" aria-hidden="true"><label htmlFor="reg-site">Ne pas remplir</label><input id="reg-site" tabIndex="-1" autoComplete="off" value=${site} onChange=${e => setSite(e.target.value)} /></div>`}
      <p className="muted small">${info.mode === 'auto' ? 'Si la classe a de la place, l’admission est immédiate.' : 'Le secrétariat valide chaque demande avant l’admission.'}</p></fieldset>
    ${err && html`<p className="form-err" role="alert">${err}</p>`}
    <div className="reg-foot"><${Btn} tone="primary" type="submit" disabled=${busy}>${busy ? 'Envoi…' : 'Envoyer la demande'}<//></div>
  </form></div>`;
}

/* Premier accès avec un mot de passe provisoire : la personne choisit le sien avant tout. */
function ChangePasswordScreen({ me, onDone, onLogout }) {
  const [v, setV] = useState({ a: '', b: '', c: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (v.b.length < 8) { setErr('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (v.b !== v.c) { setErr('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true); try { await Api.changePassword(v.a, v.b); onDone(); } catch (x) { setErr(x.message || String(x)); setBusy(false); }
  };
  return html`<div className="boot"><form className="boot-card login" onSubmit=${submit}><div className="logo-mark">S</div><strong>Choisissez votre mot de passe</strong>
    <p className="muted">Bonjour ${(me.nom || '').split(' ')[0]}. Pour votre sécurité, remplacez le mot de passe provisoire par un mot de passe que vous êtes seul(e) à connaître.</p>
    <div className="field"><label htmlFor="cp-a">Mot de passe provisoire</label><input id="cp-a" type="password" autoComplete="current-password" value=${v.a} onChange=${set('a')} /></div>
    <div className="field"><label htmlFor="cp-b">Nouveau mot de passe</label><input id="cp-b" type="password" autoComplete="new-password" value=${v.b} onChange=${set('b')} /><small className="hint">8 caractères minimum.</small></div>
    <div className="field"><label htmlFor="cp-c">Confirmer</label><input id="cp-c" type="password" autoComplete="new-password" value=${v.c} onChange=${set('c')} /></div>
    ${err && html`<p className="form-err" role="alert">${err}</p>`}
    <${Btn} tone="primary" type="submit" disabled=${busy}>${busy ? 'Enregistrement…' : 'Enregistrer et continuer'}<//><${Btn} onClick=${onLogout}>Se déconnecter<//></form></div>`;
}

/* ===== Scolaria : application (navigation, droits, état global) ===== */
const crud = k => function CrudView() { return html`<${CrudPage} cfg=${CFG[k]} />`; };
const PAGES = {
  dashboard: Dashboard, home: FamilyHome, results: ResultsPage, marks: MarksPage, attendance: AttendancePage, timetable: TimetablePage, halltickets: HallTicketsPage,
  dues: DuesPage, cash: CashPage, reports: ReportsPage, complaints: ComplaintsPage, settings: SettingsPage, profile: ProfilePage, audit: AuditPage,
  modules: ModulesPage, perms: PermsPage, channels: ChannelsPage, messages: MessagesPage
};
['students', 'parents', 'admissions', 'classes', 'subjects', 'teachers', 'assignments', 'users', 'exams', 'lessons', 'logbook', 'substitutes', 'conduct', 'activities', 'ptm', 'notices', 'events', 'tickets', 'documents', 'assets', 'maintenance', 'stock', 'stockTx', 'feeStructure', 'payments', 'outbox'].forEach(k => { PAGES[k] = crud(k); });
const VERB_KEY = { view: 'v', create: 'c', modify: 'm', delete: 's' };
const rightsFor = (db, role, k) => rights_(role, k, db.perms, db.modules);
function canOf(db, role, k, kind) {
  const r = rightsFor(db, role, k);
  if (kind === 'edit' || kind === 'write') return r.indexOf('c') >= 0 || r.indexOf('m') >= 0;
  return r.indexOf(VERB_KEY[kind || 'view']) >= 0;
}
const home_ = role => FAMILY_ROLES.indexOf(role) >= 0 ? 'home' : 'dashboard';
/* Menu : construit à partir du registre, des modules actifs, des noms et positions choisis par la direction */
function buildNav(db, role) {
  const label = m => (db.modules.find(x => x.id === m.k) || {}).label || m.l, order = m => Number((db.modules.find(x => x.id === m.k) || {}).ordre) || 0;
  return GROUPS.map(g => [g, MODS.filter(m => m.g === g && PAGES[m.k] && canOf(db, role, m.k, 'view')).map((m, i) => ({ m, i })).sort((a, b) => (order(a.m) || 100 + a.i) - (order(b.m) || 100 + b.i) || a.i - b.i).map(x => [x.m.k, label(x.m), x.m.i])]).filter(x => x[1].length);
}

function Toasts({ list }) {
  return html`<div className="toasts" aria-live="polite">${list.map(t => html`<div key=${t.id} className=${'toast ' + (t.tone || '')} role="status">${t.msg}</div>`)}</div>`;
}

function LoginScreen({ info, onDone, onRegister }) {
  const first = !info.hasUsers, reg = info.registration && info.registration.open;
  const [v, setV] = useState({ email: '', nom: '', pwd: '', pwd2: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (first && !validEmail_(v.email)) { setErr('Saisissez une adresse e-mail valide.'); return; }
    if (!first && !v.email.trim()) { setErr('Saisissez votre identifiant.'); return; }
    if (first) { if (!v.nom.trim()) { setErr('Indiquez votre nom.'); return; } if (v.pwd.length < 8) { setErr('Le mot de passe doit contenir au moins 8 caractères.'); return; } if (v.pwd !== v.pwd2) { setErr('Les deux mots de passe ne correspondent pas.'); return; } }
    else if (!v.pwd) { setErr('Saisissez votre mot de passe.'); return; }
    setBusy(true);
    try { if (first) await Api.setup(v.email, v.nom, v.pwd); else await Api.login(v.email, v.pwd); onDone(); } catch (x) { setErr(x.message || String(x)); setBusy(false); }
  };
  return html`<div className="boot"><form className="boot-card login" onSubmit=${submit}>
    <div className="logo-mark">S</div><strong>${first ? 'Créer le compte de la direction' : (info.school || 'Scolaria')}</strong>
    <p className="muted">${first ? 'Première utilisation : ce compte administrateur gérera les autres utilisateurs.' : 'Connectez-vous pour accéder à votre espace.'}</p>
    ${first && html`<div className="field"><label htmlFor="lg-nom">Nom complet</label><input id="lg-nom" autoComplete="name" value=${v.nom} onChange=${set('nom')} /></div>`}
    <div className="field"><label htmlFor="lg-email">${first ? 'Adresse e-mail' : 'Identifiant'}</label><input id="lg-email" type=${first ? 'email' : 'text'} autoComplete="username" value=${v.email} onChange=${set('email')} />${!first && html`<small className="hint">Adresse e-mail, numéro de téléphone ou n° d’admission.</small>`}</div>
    <div className="field"><label htmlFor="lg-pwd">Mot de passe</label><input id="lg-pwd" type="password" autoComplete=${first ? 'new-password' : 'current-password'} value=${v.pwd} onChange=${set('pwd')} /></div>
    ${first && html`<div className="field"><label htmlFor="lg-pwd2">Confirmer le mot de passe</label><input id="lg-pwd2" type="password" autoComplete="new-password" value=${v.pwd2} onChange=${set('pwd2')} /></div>`}
    ${err && html`<p className="form-err" role="alert">${err}</p>`}
    <${Btn} tone="primary" type="submit" disabled=${busy}>${busy ? 'Connexion…' : first ? 'Créer le compte' : 'Se connecter'}<//>
    ${reg && html`<div className="login-reg"><span className="muted">Pas encore de compte ?</span><${Btn} id="go-register" onClick=${onRegister}>Inscrire mon enfant<//><small className="hint">Sans connexion préalable : votre espace famille est créé automatiquement.</small></div>`}
  </form></div>`;
}

function App() {
  const [boot, setBoot] = useState('loading'), [bootErr, setBootErr] = useState('');
  const [db, setDb] = useState(null), [me, setMe] = useState(null), [page, setPage] = useState(''), [dlg, setDlg] = useState(null), [toasts, setToasts] = useState([]), [menu, setMenu] = useState(false), [reg, setReg] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('scolaria-theme') || ''; } catch (e) { return ''; } });
  const first = useRef(true), dbRef = useRef(null), regUser = useRef(null);
  dbRef.current = db;

  useEffect(() => {
    const el = document.documentElement; if (theme) el.setAttribute('data-theme', theme); else el.removeAttribute('data-theme');
    try { if (theme) localStorage.setItem('scolaria-theme', theme); else localStorage.removeItem('scolaria-theme'); } catch (e) { /* ignore */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [loginInfo, setLoginInfo] = useState({ hasUsers: true, school: '' });
  const enter = r => {
    setDb(r.db); setMe(r.me);
    if (r.me.mustChange) { setBoot('mustchange'); return; }
    setPage(home_(r.me.role)); setBoot('ok');
  };
  const toLogin = () => Api.status().then(i => { setLoginInfo(i); setBoot('login'); }).catch(e => { setBootErr(e.message || String(e)); setBoot('error'); });
  const load = useCallback(() => {
    if (REMOTE_WANTED && !REMOTE_URL) { setBoot('unconfigured'); return; }
    setBoot('loading');
    if (IN_GAS && !Api.hasToken()) { toLogin(); return; }
    Api.load().then(r => { if (!r.me) { setDb(r.db); setBoot('denied'); return; } enter(r); })
      .catch(e => { if (IN_GAS && isAuthErr(e)) { setToken(''); toLogin(); return; } setBootErr(e.message || String(e)); setBoot('error'); });
  }, []);
  /* Rechargement discret : garde la page et le contexte (après une action traitée par le serveur) */
  const reload = useCallback(async () => {
    if (!IN_GAS) return;
    try { const r = await Api.load(); setDb(r.db); setMe(r.me); }
    catch (e) { if (isAuthErr(e)) { setToken(''); setDb(null); setMe(null); toLogin(); } }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (IN_GAS || !db) return; if (first.current) { first.current = false; return; } lsSet(db); }, [db]);

  const go = useCallback(k => { setPage(k); setMenu(false); window.scrollTo(0, 0); }, []);
  const notify = useCallback((msg, tone) => { const id = uid(); setToasts(t => [...t, { id, msg, tone }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'bad' ? 6000 : 3200); }, []);
  const ask = useCallback(cfg => new Promise(res => setDlg({ cfg, res })), []);
  const closeDlg = v => { const d = dlg; setDlg(null); if (d) d.res(v); };

  const who = me ? me.nom : '';
  const audit = (action, table, rowId, detail) => ({ id: uid(), at: new Date().toISOString(), user: who, action, table, rowId, detail });
  const commit = fn => setDb(prev => fn(prev));
  const fail = e => { if (isAuthErr(e)) { setToken(''); notify('Votre session a expiré. Reconnectez-vous.', 'bad'); load(); return; } notify('Enregistrement impossible : ' + (e.message || e), 'bad'); reload(); };
  const logout = async () => { await Api.logout(); setMe(null); setDb(null); load(); };
  const CONFIG_T = ['modules', 'perms', 'channels', 'templates'], SERVER_SHAPED = ['admissions', 'users'];

  const save = useCallback(async (table, row) => {
    const isNew = !row.id, cfgT = CONFIG_T.indexOf(table) >= 0;
    let r = normRow(table, cfgT ? sanitizeConfig_(table, { ...row }) : { ...row, id: row.id || (table === 'settings' ? 'main' : uid()) });
    if (!IN_GAS && isNew && table === 'admissions') r = { ...r, ref: nextRef_(dbRef.current), source: 'secrétariat', userId: '' };
    commit(prev => { const exist = prev[table].some(x => x.id === r.id); const next = { ...prev, [table]: exist ? prev[table].map(x => x.id === r.id ? r : x) : [...prev[table], r] }; if (!IN_GAS && table !== 'audit') next.audit = [...prev.audit, audit(isNew ? 'créé' : 'modifié', table, r.id, r.recu || r.nom || r.titre || r.session || r.label || '')]; return next; });
    if (IN_GAS) { try { await Api.save(table, r); if (SERVER_SHAPED.indexOf(table) >= 0) await reload(); } catch (e) { fail(e); } }
    return r;
  }, [who]);
  const saveMany = useCallback(async (table, rows) => {
    const rs = rows.map(x => normRow(table, { ...x, id: x.id || uid() }));
    commit(prev => { const m = new Map(rs.map(x => [x.id, x])); const kept = prev[table].map(x => m.has(x.id) ? m.get(x.id) : x), have = new Set(prev[table].map(x => x.id)); const next = { ...prev, [table]: [...kept, ...rs.filter(x => !have.has(x.id))] }; if (!IN_GAS && table !== 'audit') next.audit = [...prev.audit, audit('modifié', table, '', rs.length + ' lignes')]; return next; });
    if (IN_GAS) { try { await Api.saveMany(table, rs); } catch (e) { fail(e); } }
    return rs;
  }, [who]);
  const remove = useCallback(async (table, ids) => {
    commit(prev => { const next = { ...prev, [table]: prev[table].filter(x => !ids.includes(x.id)) }; if (!IN_GAS && table !== 'audit') next.audit = [...prev.audit, audit('supprimé', table, ids.join(','), ids.length + ' ligne(s)')]; return next; });
    if (IN_GAS) { try { await Api.remove(table, ids); } catch (e) { fail(e); } }
  }, [who]);

  /* Opérations traitées par le serveur (ou par la même logique en démonstration) */
  const admit = async (id, classId, no) => {
    if (IN_GAS) { const out = await Api.admit(id, classId, no); await reload(); return out; }
    const r = Demo.admit(dbRef.current, id, classId, no, who); setDb(r.db); return r.out;
  };
  const broadcast = async spec => {
    if (IN_GAS) { const out = await Api.broadcast(spec); await reload(); return out; }
    const r = Demo.broadcast(dbRef.current, spec, who); setDb(r.db); return r.out;
  };
  const remind = async ids => {
    if (IN_GAS) { const out = await Api.remind(ids); await reload(); return out; }
    const r = Demo.remind(dbRef.current, ids, who); setDb(r.db); return r.out;
  };
  const markSent = async id => {
    if (IN_GAS) { await Api.outboxMark(id); await reload(); return; }
    setDb(prev => ({ ...prev, outbox: prev.outbox.map(r => r.id === id ? { ...r, statut: 'Envoyé (manuel)', detail: 'Envoyé par ' + who } : r) }));
  };
  const showCredentials = (comptes, title) => ask({ title: title || 'Accès créés', noCancel: true, submit: 'J’ai noté ces accès', extra: () => html`<${CredentialsView} comptes=${comptes} />` });

  /* Formulaire d'inscription public : en démonstration il s'ouvre ici, en production c'est la page d'accueil des visiteurs non connectés */
  const demoRun = (connected) => async form => {
    if (Number(form.cans) !== 5 && !connected) throw new Error('Réponse incorrecte à la question de vérification.');
    if (form.site) return { ok: true, refs: [], admis: 0, comptes: [] };
    const r = Demo.register(dbRef.current, form, connected ? me : null); setDb(r.db); regUser.current = r.out.user; return r.out;
  };
  const openForm = async connected => {
    try { const info = IN_GAS ? (await Api.status()).registration : regInfoOf(dbRef.current); if (!info || !info.open) { notify('Les inscriptions en ligne sont fermées.', 'bad'); return; } setReg({ info, connected }); }
    catch (e) { notify(e.message || String(e), 'bad'); }
  };
  const openPublicForm = async () => {
    if (IN_GAS && !HAS_GOOGLE) { window.open(location.href.split('#')[0], '_blank', 'noopener,noreferrer'); return; }
    if (IN_GAS) { try { const url = await gas('apiAppUrl', TOKEN); window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { notify(e.message || String(e), 'bad'); } return; }
    openForm(false);
  };
  const addChild = () => openForm(true);
  const resetDemo = () => { lsClear(); first.current = true; Api.load(me.role).then(r => { setDb(r.db); setMe(r.db.users.find(u => u.role === me.role)); }); };
  const switchRole = role => { const u = db.users.find(x => x.role === role); if (!u) return; setMe(u); go(home_(role)); };

  if (reg) {
    const st0 = dbRef.current && dbRef.current.settings[0] || {};
    const enterAfter = () => { const u = regUser.current; regUser.current = null; setReg(null); setPage('home'); if (IN_GAS) reload(); else if (u && !reg.connected) setMe(dbRef.current.users.find(x => x.id === u.id) || u); };
    return html`<${Fragment}><${RegisterScreen} info=${reg.info} connected=${reg.connected} schoolName=${st0.ecole} indicatif=${reg.info.indicatif}
      makeChallenge=${IN_GAS ? Api.challenge : () => Promise.resolve({ id: 'demo', q: '2 + 3' })} run=${IN_GAS ? (f => Api.register(f, reg.connected)) : demoRun(reg.connected)}
      onBack=${() => setReg(null)} onEnter=${enterAfter} /><${Toasts} list=${toasts} /><//>`;
  }
  if (FRAMED) return html`<div className="boot"><div className="boot-card"><div className="logo-mark">S</div><strong>Affichage bloqué</strong><p className="muted">Pour votre sécurité, Scolaria ne s’affiche pas à l’intérieur d’un autre site. Ouvrez-la directement dans une nouvelle fenêtre.</p><a className="btn primary" href=${location.href} target="_blank" rel="noopener noreferrer">Ouvrir Scolaria</a></div></div>`;
  if (boot === 'unconfigured') return html`<div className="boot"><div className="boot-card setup-card"><div className="logo-mark">S</div><strong>Scolaria n’est pas encore connectée à un serveur</strong>
    <p className="muted">La page est prête, mais l’adresse du serveur Google Apps Script n’est pas (ou plus) valide dans le fichier <code>config.js</code>. Elle doit commencer par <code>https://script.google.com/</code> et se terminer par <code>/exec</code>.</p>
    <ol className="setup-steps"><li>Déployez le serveur Apps Script (dossier <code>dist/gas</code> du dépôt) et copiez l’adresse « Application Web ».</li><li>Collez-la dans <code>config.js</code>, à la place du texte d’exemple, puis enregistrez la modification.</li><li>Patientez environ une minute, puis rechargez cette page.</li></ol>
    <a className="btn primary" href="demo.html">Voir la démonstration</a></div></div>`;
  if (boot === 'loading') return html`<div className="boot"><div className="boot-card"><div className="logo-mark">S</div><strong>Scolaria</strong><span className="muted">Chargement des données…</span><div className="loadbar"><i></i></div></div></div>`;
  if (boot === 'login') return html`<${LoginScreen} info=${loginInfo} onDone=${load} onRegister=${() => setBoot('register')} />`;
  if (boot === 'register') return html`<${Fragment}><${RegisterScreen} info=${loginInfo.registration} connected=${false} schoolName=${loginInfo.school} indicatif=${loginInfo.registration.indicatif}
    makeChallenge=${Api.challenge} run=${f => Api.register(f, false)} onBack=${() => setBoot('login')} onEnter=${load} /><${Toasts} list=${toasts} /><//>`;
  if (boot === 'mustchange') return html`<${ChangePasswordScreen} me=${me} onDone=${load} onLogout=${logout} />`;
  if (boot === 'error') return html`<div className="boot"><div className="boot-card"><strong>Impossible de charger les données</strong><p className="muted">${bootErr}</p><${Btn} tone="primary" onClick=${load}>Réessayer<//></div></div>`;
  if (boot === 'denied') return html`<div className="boot"><div className="boot-card"><div className="logo-mark">S</div><strong>Accès non autorisé</strong><p className="muted">Ce compte n’est associé à aucun utilisateur de l’école. Demandez à la direction de vous ajouter dans « Utilisateurs et rôles ».</p></div></div>`;

  const can = (k, kind = 'view') => canOf(db, me.role, k, kind);
  const nav = buildNav(db, me.role), titles = Object.fromEntries(nav.flatMap(g => g[1].map(m => [m[0], m[1]])));
  const cur = PAGES[page] && can(page, 'view') ? page : home_(me.role), Page = PAGES[cur], st = db.settings[0] || {};
  const regOpen = regInfoOf(db).open;
  const app = { db, me, can, go, save, saveMany, remove, ask, notify, resetDemo, reload, cur, admit, broadcast, remind, markSent, showCredentials, openPublicForm, addChild, regOpen };
  const badge = {
    admissions: db.admissions.filter(a => a.statut === 'En attente').length, tickets: db.tickets.filter(t => t.statut === 'Ouvert').length,
    complaints: can('complaints', 'modify') ? db.complaints.filter(c => c.statut === 'Nouvelle').length : 0, stock: db.stock.filter(s => stockQty(db, s) <= s.seuil).length,
    ptm: me.role === 'parent' ? db.ptm.filter(r => r.statut === 'Libre').length : 0, outbox: db.outbox.filter(r => r.statut === 'À envoyer').length
  };
  const initials = (me.nom || '?').split(' ').map(w => w[0]).slice(0, 2).join('');

  return html`<${Ctx.Provider} value=${app}>
    <div className=${'shell' + (menu ? ' menu-open' : '')}>
      <aside className="side no-print" aria-label="Navigation principale">
        <div className="brand"><div className="logo-mark">S</div><div><strong>Scolaria</strong><small>${st.ecole}</small></div></div>
        <nav>${nav.map(([g, items]) => html`<div key=${g} className="grp"><h3>${g}</h3>${items.map(([k, l, ic]) => html`<button type="button" key=${k} className=${'nav' + (cur === k ? ' on' : '')} aria-current=${cur === k ? 'page' : undefined} onClick=${() => go(k)}><${Icon} n=${ic} s=${17} /><span>${l}</span>${badge[k] > 0 && html`<b>${badge[k]}</b>`}</button>`)}</div>`)}</nav>
        <div className="side-foot"><div className="avatar sm">${initials}</div><div className="grow"><strong>${me.nom}</strong><small>${ROLE_LABEL[me.role]}</small></div>${IN_GAS && html`<button type="button" className="icon-btn out" onClick=${logout} aria-label="Se déconnecter" title="Se déconnecter"><${Icon} n="x" s=${16} /></button>`}</div>
      </aside>
      <div className="scrim" onClick=${() => setMenu(false)}></div>
      <div className="main">
        <header className="top no-print">
          <button type="button" className="icon-btn menu-btn" onClick=${() => setMenu(!menu)} aria-label="Menu"><${Icon} n="menu" /></button>
          <div className="crumbs"><span className="muted">${st.ecole}</span><${Icon} n="chev" s=${13} /><strong>${titles[cur] || (MOD_BY_KEY[cur] || {}).l}</strong></div>
          <span className="grow"></span>
          ${!IN_GAS && html`<label className="roleswitch"><span>Voir en tant que</span><select id="role-switch" value=${me.role} onChange=${e => switchRole(e.target.value)}>${ROLES.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></label>`}
          <button type="button" className="icon-btn" onClick=${() => setTheme(dark ? 'light' : 'dark')} aria-label=${dark ? 'Passer au thème clair' : 'Passer au thème sombre'} title="Thème">${dark ? '☀' : '☾'}</button>
        </header>
        <main className="content" key=${cur + me.id}><${Page} /></main>
      </div>
    </div>
    ${dlg && html`<${AskDialog} cfg=${dlg.cfg} db=${db} onDone=${closeDlg} />`}
    <${Toasts} list=${toasts} />
  </${Ctx.Provider}>`;
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
