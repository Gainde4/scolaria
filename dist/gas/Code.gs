/**
 * Scolaria — backend Google Apps Script
 * Base de données : le classeur Google Sheets auquel ce script est lié (un onglet par table).
 * Les fonctions dont le nom finit par « _ » sont privées : le navigateur ne peut pas les appeler.
 * Les clés d'API (Twilio, passerelle) sont gardées dans les propriétés du script, jamais dans le classeur.
 */
var SCHEMA = {"settings": "id,ecole,adresse,tel,email,annee,devise,noteMax:n,notePassage:n,responsable,slogan,indicatif", "classes": "id,nom,niveau,section,titulaireId,effectifMax:n,salle,extra", "subjects": "id,nom,code,coef:n,extra", "teachers": "id,matricule,nom,prenom,sexe,tel,email,specialite,statut,embauche,extra", "assignments": "id,teacherId,subjectId,classId,heures:n,extra", "students": "id,admission,nom,prenom,sexe,naissance,classId,parentId,tel,adresse,statut,nin,extra", "parents": "id,nom,prenom,lien,tel,email,profession,adresse,extra", "admissions": "id,date,nom,prenom,sexe,naissance,classId,parentPrenom,parentNom,parentTel,lien,statut,remarque,studentId,parentEmail,userId,ref,source,extra", "users": "id,email,nom,role,linkId,tel,actif:b,hash,salt,login,mustChange:b,source,canaux", "periods": "id,ordre:n,label,debut,fin,pause:b", "timetable": "id,classId,jour:n,periodId,subjectId,teacherId,salle", "attendance": "id,date,classId,studentId,statut,note", "exams": "id,session,type,classId,subjectId,date,heure,duree:n,salle,noteMax:n,trimestre,extra", "marks": "id,examId,studentId,note:n,abs:b", "lessons": "id,teacherId,classId,subjectId,titre,objectifs,date,duree:n,statut,extra", "logbook": "id,date,teacherId,classId,subjectId,contenu,devoirs,extra", "conduct": "id,studentId,date,type,gravite,description,signalePar,extra", "activities": "id,studentId,activite,categorie,date,resultat,extra", "ptm": "id,date,heure,teacherId,statut,parentId,studentId,motif,extra", "substitutes": "id,date,absentId,substituteId,classId,periodId,motif,extra", "notices": "id,titre,contenu,date,cible,epingle:b,auteur,extra", "events": "id,titre,date,fin,categorie,lieu,extra", "complaints": "id,date,categorie,message,statut,reponse", "tickets": "id,cree,titre,description,priorite,statut,assigneId,creePar,extra", "documents": "id,titre,type,studentId,fichier,verifie:b,expiration,extra", "assets": "id,tag,nom,categorie,lieu,achat,valeur:n,etat,responsable,extra", "maintenance": "id,assetId,date,type,description,cout:n,technicien,extra", "stock": "id,code,nom,categorie,unite,initial:n,seuil:n,prix:n,extra", "stockTx": "id,itemId,date,type,quantite:n,motif,extra", "feeStructure": "id,classId,inscription:n,mensualite:n,transport:n,cantine:n,extra", "payments": "id,date,studentId,type,mois,montant:n,mode,recu,caissier,remarque,extra", "audit": "id,at,user,action,table,rowId,detail", "modules": "id,label,sub,actif:b,ordre:n,champs,listes,options", "perms": "id,role,module,droits", "channels": "id,actif:b,fournisseur,expediteur,options", "templates": "id,actif:b,email:b,sms:b,whatsapp:b,sujet,texte", "outbox": "id,at,canal,fournisseur,to,nom,event,statut,detail,texte,lien"};
var TABLES = Object.keys(SCHEMA);
var SESSION_TTL = 21600;          // 6 heures, maximum autorisé par CacheService
var MAX_TRIES = 5;                // tentatives de connexion avant blocage de 10 minutes
var MAX_SEND = 60;                // envois réseau (e-mail, Twilio, passerelle) par opération
var MAX_MESSAGES = 500;           // messages par envoi groupé (les liens manuels ne partent pas du serveur)
var CONFIG_TABLES = ['modules', 'perms', 'channels', 'templates'];

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


/* ================= Page web ================= */
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return json_({ ok: true, app: 'Scolaria' }); // vérification de l'adresse depuis un navigateur
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Scolaria')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
  if (s) return s;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Aucun classeur lié. Créez le script depuis Extensions > Apps Script dans un Google Sheets.');
  return SpreadsheetApp.openById(id);
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
