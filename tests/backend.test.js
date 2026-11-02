const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
/* ---------- Simulation de l'API Google (classeur, cache, verrou, courrier, réseau, propriétés) ---------- */
const sheets = {}; const mails = []; const cache = {}; const props = {}; const fetches = []; const stats = { formats: 0, reads: 0, writes: 0 };
let quota = 100, fetchReply = () => ({ code: 201, body: '{"sid":"SM1"}' });
function mkSheet(name) {
  const g = []; // g[r][c], index 0-based
  const sh = {
    name, _g: g,
    getName: () => name,
    getMaxRows: () => Math.max(g.length, 1000),
    setFrozenRows() {},
    deleteRow(n) { g.splice(n - 1, 1); },
    getDataRange: () => ({ getValues: () => { stats.reads++; const rows = g.reduce((m, r, i) => r.some(v => v !== '' && v !== undefined) ? i + 1 : m, 0), cols = g.reduce((m, r) => { let k = 0; r.forEach((v, i) => { if (v !== '' && v !== undefined) k = i + 1; }); return Math.max(m, k); }, 0);
      if (!rows) return [['']]; return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => { const v = (g[i] || [])[j]; return v === undefined ? '' : v; })); } }),
    getRange(r, c, nr = 1, nc = 1) { return {
      setValues: vals => { stats.writes++; vals.forEach((row, i) => { g[r - 1 + i] = g[r - 1 + i] || []; row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; }); }); },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { stats.formats++; return this; }
    }; }
  };
  return sh;
}
const book = { getSheets: () => Object.values(sheets), insertSheet: n => (sheets[n] = mkSheet(n)) };
const pad2 = n => String(n).padStart(2, '0');
const ctx = {
  console, Date, Math, Object, Array, String, Number, JSON, isNaN, Error, Set, Map, encodeURIComponent, parseInt,
  SpreadsheetApp: { getActiveSpreadsheet: () => book },
  Utilities: {
    getUuid: () => crypto.randomUUID(), computeDigest: (a, d) => Array.from(crypto.createHash('sha256').update(d).digest()),
    base64Encode: b => Buffer.from(b).toString('base64'), Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    formatDate: (d, tz, f) => { const y = d.getFullYear(), m = pad2(d.getMonth() + 1), j = pad2(d.getDate()), h = pad2(d.getHours()); return f === 'yyyy-MM-dd' ? `${y}-${m}-${j}` : f === 'yyyyMMddHH' ? `${y}${m}${j}${h}` : `${y}${m}${j}`; }
  },
  Session: { getScriptTimeZone: () => 'Africa/Dakar' },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  MailApp: { sendEmail: m => { if (m.to === 'panne@ecole.sn') throw new Error('Adresse refusée'); mails.push(m); quota--; }, getRemainingDailyQuota: () => quota },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); const r = fetchReply(url, o); return { getResponseCode: () => r.code, getContentText: () => r.body }; } },
  ScriptApp: {}, HtmlService: {},
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => { const o = { _t: t, _m: '', setMimeType(m) { o._m = m; return o; }, getContent: () => t, getMimeType: () => o._m }; return o; } }
};
vm.createContext(ctx);
const shared = fs.readFileSync(path.join(ROOT, 'src/shared/registry.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/shared/logic.js'), 'utf8');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist/gas/Code.gs'), 'utf8'), ctx);
const G = expr => vm.runInContext(expr, ctx);     // lit une constante ou une fonction du serveur (const non exposées sur l'objet global)

/* ---------- Données d'exemple générées par le vrai code client ---------- */
const cctx = { console, Date, Math, Object, Array, String, Number, JSON, isNaN, Map, Set, setTimeout, window: {}, sessionStorage: { getItem() { return ''; } },
  React: { useState() {}, useEffect() {}, useMemo() {}, useRef() {}, useCallback() {}, createContext() {}, useContext() {}, Fragment: 1, createElement() {} }, htm: { bind: () => () => null } };
vm.createContext(cctx);
const corejs = fs.readFileSync(path.join(ROOT, 'src/js/00-core.js'), 'utf8').replace('/*__SHARED__*/', shared).replace('__SCHEMA__', fs.readFileSync(path.join(ROOT, 'src/schema.json'), 'utf8'));
vm.runInContext(corejs + '\n;this.__seed = buildSeed();', cctx);
const seed = cctx.__seed;

/* ---------- Assertions ---------- */
let pass = 0, fail = 0;
const ok = (name, c, x) => { if (c) { pass++; console.log('OK   ' + name); } else { fail++; console.log('FAIL ' + name + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
const throws = (name, fn, re) => { try { fn(); ok(name, false, 'aucune erreur levée'); } catch (e) { ok(name, re ? re.test(e.message) : true, e.message); } };
const call = (fn, ...a) => ctx[fn](...a);

ok('premier lancement : aucun utilisateur', call('apiStatus').hasUsers === false);
throws('mot de passe trop court refusé', () => call('apiSetupAdmin', 'dir@ecole.sn', 'Seydou', 'abc'), /8 caract/);
throws('e-mail invalide refusé', () => call('apiSetupAdmin', 'pas-un-mail', 'Seydou', 'motdepasse1'), /e-mail/);
const adm = call('apiSetupAdmin', 'Dir@Ecole.sn', 'Seydou Mbaye', 'motdepasse1');
ok('compte administrateur créé, e-mail normalisé', adm.me.role === 'admin' && adm.me.email === 'dir@ecole.sn' && adm.me.hash === '');
throws('seconde création d’admin refusée', () => call('apiSetupAdmin', 'x@y.sn', 'X', 'motdepasse2'), /existe déjà/);
const raw = sheets.users._g[1]; ok('mot de passe stocké haché (jamais en clair)', !JSON.stringify(raw).includes('motdepasse1') && raw[7] && raw[7].length > 20);
throws('sans jeton : accès refusé', () => call('apiLoadAll', ''), /AUTH/);
throws('jeton falsifié : accès refusé', () => call('apiLoadAll', 'faux'), /AUTH/);
const T = adm.token;

const n = call('apiImportAll', T, seed); ok('import des données d’exemple', n > 500, n);
throws('second import refusé', () => call('apiImportAll', T, seed), /déjà des données/);
ok('dates restent du texte AAAA-MM-JJ', /^\d{4}-\d{2}-\d{2}$/.test(call('apiLoadAll', T).tables.payments[0].date));
ok('nombres restent des nombres', typeof call('apiLoadAll', T).tables.payments[0].montant === 'number');
ok('booléens restent des booléens', typeof call('apiLoadAll', T).tables.periods[0].pause === 'boolean');

// création de comptes de test
const teacher = seed.teachers[0], par = seed.parents[0], kid = seed.students.find(s => s.parentId === par.id), kidClass = kid.classId;
const mk = (email, nom, role, linkId) => call('apiSaveMany', T, 'users', [{ email, nom, role, linkId, tel: '', actif: true }])[0];
const uT = mk('ens@ecole.sn', 'Moussa Ndiaye', 'enseignant', teacher.id), uP = mk('parent@ecole.sn', 'Parent Test', 'parent', par.id), uE = mk('eleve@ecole.sn', 'Élève Test', 'eleve', kid.id), uS = mk('sec@ecole.sn', 'Khady', 'secretaire', '');
ok('hash jamais renvoyé au navigateur', uT.hash === '' && uT.salt === '');
[uT, uP, uE, uS].forEach(u => call('apiSetPassword', T, u.id, 'tmp-' + u.role + '1'));
const t0 = call('apiLogin', 'ens@ecole.sn', 'tmp-enseignant1').token;
ok('mot de passe défini par la direction : changement exigé à la première connexion', call('apiLoadAll', t0).me.mustChange === true && Object.keys(call('apiLoadAll', t0).tables).length === 0);
throws('tant que le mot de passe provisoire n’est pas changé : aucune action', () => call('apiSave', t0, 'tickets', { titre: 'x', priorite: 'Normale', statut: 'Ouvert' }), /MUSTCHANGE/);
const activate = (email, role) => { const k = call('apiLogin', email, 'tmp-' + role + '1').token; call('apiChangePassword', k, 'tmp-' + role + '1', 'secret-' + role); return call('apiLogin', email, 'secret-' + role).token; };
const tokT = activate('ens@ecole.sn', 'enseignant'), tokP = activate('parent@ecole.sn', 'parent'), tokE = activate('eleve@ecole.sn', 'eleve'), tokS = activate('sec@ecole.sn', 'secretaire');
ok('après changement : accès normal', Object.keys(call('apiLoadAll', tokS).tables).length > 30);
throws('mauvais mot de passe refusé', () => call('apiLogin', 'ens@ecole.sn', 'nimporte'), /incorrect/);
for (let i = 0; i < 5; i++) { try { call('apiLogin', 'parent@ecole.sn', 'x'); } catch (e) {} }
throws('blocage après 5 échecs (même avec le bon mot de passe)', () => call('apiLogin', 'parent@ecole.sn', 'secret-parent'), /Trop de tentatives/);

// visibilité des données
const dT = call('apiLoadAll', tokT).tables, dP = call('apiLoadAll', tokP).tables, dE = call('apiLoadAll', tokE).tables, dS = call('apiLoadAll', tokS).tables, dA = call('apiLoadAll', T).tables;
ok('admin voit les paiements et le journal', dA.payments.length > 50 && dA.audit.length >= 1);
ok('secrétaire voit les paiements, pas le journal d’audit', dS.payments.length > 50 && dS.audit.length === 0);
ok('enseignant : aucun paiement ni barème ni document', dT.payments.length === 0 && dT.feeStructure.length === 0 && dT.documents.length === 0 && dT.assets.length === 0);
ok('enseignant : aucune plainte ni admission', dT.complaints.length === 0 && dT.admissions.length === 0);
ok('enseignant : NIN des élèves masqué', dT.students.every(s => s.nin === ''));
ok('enseignant : e-mails des utilisateurs masqués', dT.users.filter(u => u.id !== uT.id).every(u => u.email === ''));
const kids = seed.students.filter(s => s.parentId === par.id).map(s => s.id), mine = seed.payments.filter(p => kids.includes(p.studentId)).length;
ok('parent : uniquement les paiements de ses enfants', dP.payments.length === mine && dP.payments.every(p => kids.includes(p.studentId)), [dP.payments.length, mine]);
ok('parent : aucune donnée de conduite ni d’utilisateurs tiers', dP.conduct.length === 0 && dP.users.length === 1 && dP.users[0].id === uP.id);
ok('parent : camarades anonymisés (pas de noms)', dP.students.filter(s => !kids.includes(s.id)).every(s => s.nom === 'Camarade' && s.tel === '' && s.parentId === ''));
ok('parent : les notes de la classe sont fournies pour le classement', dP.marks.length > 0);
ok('parent : pas de présences des autres élèves', dP.attendance.every(a => kids.includes(a.studentId)));
ok('parent : parents tiers invisibles', dP.parents.length === 1 && dP.parents[0].id === par.id);
ok('élève : aucun paiement, un seul dossier non anonymisé', dE.payments.length === 0 && dE.students.filter(s => s.nom !== 'Camarade').length === 1);
ok('élève : contacts du parent hors de portée', dE.parents.length === 0);

// droits d'écriture
const pay = { studentId: kid.id, type: 'Mensualité', mois: 'Octobre', montant: 22000, mode: 'Espèces', date: '2026-10-22', recu: 'REC-X', caissier: 'x', remarque: '' };
throws('enseignant ne peut pas encaisser', () => call('apiSave', tokT, 'payments', pay), /non autoris/);
throws('parent ne peut pas encaisser', () => call('apiSave', tokP, 'payments', pay), /non autoris/);
ok('secrétaire peut encaisser', !!call('apiSave', tokS, 'payments', pay).id);
throws('parent ne peut pas modifier un élève', () => call('apiSave', tokP, 'students', { ...kid, nom: 'Pirate' }), /non autoris/);
throws('élève ne peut pas modifier ses notes', () => call('apiSaveMany', tokE, 'marks', [{ examId: 'x', studentId: kid.id, note: 20 }]), /non autoris/);
const exam = seed.exams[0], st = seed.students.find(s => s.classId === exam.classId);
ok('enseignant peut saisir une note', call('apiSaveMany', tokT, 'marks', [{ examId: exam.id, studentId: st.id, note: 14, abs: false }]).length === 1);
throws('enseignant ne peut pas supprimer un élève', () => call('apiRemove', tokT, 'students', [st.id]), /non autoris/);
throws('secrétaire ne peut pas créer d’utilisateur', () => call('apiSave', tokS, 'users', { email: 'x@x.sn', nom: 'X', role: 'admin', actif: true }), /non autoris/);
const c0 = call('apiSave', tokE, 'complaints', { date: '2026-10-22', categorie: 'Cantine', message: 'Test', statut: 'Résolue', reponse: 'forcé' });
ok('plainte anonyme ouverte à tous, statut forcé à « Nouvelle »', c0.statut === 'Nouvelle' && c0.reponse === '');
throws('élève ne peut pas modifier une plainte', () => call('apiSave', tokE, 'complaints', { ...c0, statut: 'Résolue' }), /non autoris/);
const slot = seed.ptm.find(r => r.statut === 'Libre'), other = seed.students.find(x => x.parentId !== par.id);
throws('parent ne peut pas associer l’enfant d’un autre', () => call('apiSave', tokP, 'ptm', { ...slot, statut: 'Réservé', studentId: other.id, motif: 'x' }), /vos enfants/);
const booked = call('apiSave', tokP, 'ptm', { ...slot, teacherId: 'autre-prof', date: '2030-01-01', heure: '03:00', statut: 'Réservé', parentId: 'usurpe', studentId: kid.id, motif: 'Suivi' });
ok('parent réserve un créneau libre, identité imposée par le serveur', booked.statut === 'Réservé' && booked.parentId === par.id);
ok('parent ne peut pas changer la date, l’heure ni l’enseignant du créneau', booked.teacherId === slot.teacherId && booked.date === slot.date && booked.heure === slot.heure, booked);
const slot2 = seed.ptm.filter(r => r.statut === 'Libre')[1]; call('apiSave', T, 'ptm', { ...slot2, statut: 'Réservé', parentId: seed.parents[1].id, studentId: seed.students[5].id, motif: 'Autre famille' });
throws('parent ne peut pas écraser le créneau d’une autre famille', () => call('apiSave', tokP, 'ptm', { ...slot2, statut: 'Libre', parentId: '', studentId: '' }), /déjà réservé/);
const freed = call('apiSave', tokP, 'ptm', { ...booked, statut: 'Libre' }); ok('parent peut libérer son propre créneau', freed.statut === 'Libre' && freed.parentId === '' && freed.studentId === '');
throws('parent ne peut pas créer de créneau', () => call('apiSave', tokP, 'ptm', { date: '2026-11-01', heure: '10:00', teacherId: teacher.id, statut: 'Libre' }), /non autoris/);
const me2 = call('apiSave', tokT, 'users', { ...uT, role: 'admin', nom: 'Moussa N.', email: 'hack@x.sn' });
ok('profil : un utilisateur ne peut pas s’élever en admin ni changer d’e-mail', me2.role === 'enseignant' && me2.email === 'ens@ecole.sn' && me2.nom === 'Moussa N.', me2);
throws('impossible de supprimer son propre compte', () => call('apiRemove', T, 'users', [adm.me.id]), /propre compte/);
throws('impossible de retirer le dernier administrateur', () => call('apiSave', T, 'users', { ...adm.me, role: 'secretaire' }), /au moins un administrateur/);
throws('e-mail en double refusé', () => call('apiSave', T, 'users', { email: 'ens@ecole.sn', nom: 'Doublon', role: 'enseignant', actif: true }), /déjà un compte/);
call('apiSave', T, 'users', { ...uP, actif: false });
throws('compte désactivé : session révoquée', () => call('apiLoadAll', tokP), /AUTH/);
throws('connexion refusée pour un compte désactivé', () => call('apiLogin', 'parent@ecole.sn', 'secret-parent'), /incorrect|Trop/);
call('apiChangePassword', tokT, 'secret-enseignant', 'nouveau-secret-1');
throws('ancien mot de passe invalide après changement', () => call('apiLogin', 'ens@ecole.sn', 'secret-enseignant'), /incorrect/);
ok('nouveau mot de passe fonctionnel', !!call('apiLogin', 'ens@ecole.sn', 'nouveau-secret-1').token);
throws('changement avec mauvais ancien mot de passe refusé', () => call('apiChangePassword', tokT, 'faux', 'autre-secret-12'), /incorrect/);
call('apiRemove', T, 'tickets', [seed.tickets[0].id]); ok('suppression admin effective', !call('apiLoadAll', T).tables.tickets.some(t => t.id === seed.tickets[0].id));
call('apiEmailReport', T, 'Rapport', '<p>ok</p><script>alert(1)</script>'); ok('rapport envoyé à l’admin uniquement, script retiré', mails.length === 1 && mails[0].to === 'dir@ecole.sn' && !/script/.test(mails[0].htmlBody));
throws('rapport réservé à la direction', () => call('apiEmailReport', tokS, 'x', 'y'), /non autoris/);
ok('journal d’audit alimenté côté serveur', call('apiLoadAll', T).tables.audit.length >= 8);
const before = call('apiLoadAll', T).tables.attendance.length; call('apiSaveMany', T, 'attendance', seed.attendance.slice(0, 5).map(a => ({ ...a, statut: 'Absent' })));
ok('mise à jour groupée sans doublons', call('apiLoadAll', T).tables.attendance.length === before);
call('weeklyReport'); ok('rapport hebdomadaire généré', mails.length === 2 && /Rapport hebdomadaire/.test(mails[1].htmlBody));

/* =============== Matrice d'autorisations =============== */
const rightsOf = (role, k) => G(`rights_(${JSON.stringify(role)}, ${JSON.stringify(k)}, ${JSON.stringify(call('apiLoadAll', T).tables.perms)}, ${JSON.stringify(call('apiLoadAll', T).tables.modules)})`);
const tokV = (() => { const u = call('apiSaveMany', T, 'users', [{ email: 'sur@ecole.sn', nom: 'Idrissa', role: 'surveillant', linkId: '', tel: '', actif: true }])[0]; call('apiSetPassword', T, u.id, 'tmp-surveillant1'); const k = call('apiLogin', 'sur@ecole.sn', 'tmp-surveillant1').token; call('apiChangePassword', k, 'tmp-surveillant1', 'secret-surveillant'); return call('apiLogin', 'sur@ecole.sn', 'secret-surveillant').token; })();
const setPerm = (role, module, droits) => call('apiSave', T, 'perms', { role, module, droits });
ok('matrice : valeurs par défaut (secrétariat encaisse, enseignant non)', rightsOf('secretaire', 'payments') === 'vcms' && rightsOf('enseignant', 'payments') === '');
throws('matrice : le surveillant n’a pas accès aux admissions par défaut', () => call('apiSave', tokV, 'admissions', { date: '2026-10-01', nom: 'A', prenom: 'B', sexe: 'F', naissance: '2015-01-01', classId: seed.classes[0].id, parentPrenom: 'P', parentNom: 'Q', parentTel: '77 111 22 33', lien: 'Mère', statut: 'En attente' }), /non autoris/);
ok('matrice : le surveillant ne reçoit pas les admissions', call('apiLoadAll', tokV).tables.admissions.length === 0);
setPerm('surveillant', 'admissions', 'vcm');
ok('matrice : droit accordé → données visibles', call('apiLoadAll', tokV).tables.admissions.length === 3);
const admV = call('apiSave', tokV, 'admissions', { date: '2026-10-01', nom: 'Test', prenom: 'Matrice', sexe: 'F', naissance: '2015-01-01', classId: seed.classes[0].id, parentPrenom: 'P', parentNom: 'Q', parentTel: '77 111 22 33', lien: 'Mère', statut: 'En attente', userId: 'forge', ref: 'FAUX' });
ok('matrice : droit accordé → création possible, identifiants imposés par le serveur', !!admV.id && admV.userId === '' && /^INS-\d{4}-\d{4}$/.test(admV.ref) && admV.source === 'secrétariat', admV);
throws('matrice : pas de droit de suppression → refus', () => call('apiRemove', tokV, 'admissions', [admV.id]), /non autoris/);
throws('matrice : Admettre sans droit de modification d’admission est refusé même avec création', () => { setPerm('surveillant', 'admissions', 'vc'); call('apiAdmit', tokV, admV.id, seed.classes[0].id, ''); }, /non autoris/);
setPerm('surveillant', 'admissions', '');
ok('matrice : droit retiré → plus de données', call('apiLoadAll', tokV).tables.admissions.length === 0);
throws('matrice : un rôle non éligible ne peut pas recevoir de droit (parent → élèves)', () => setPerm('parent', 'students', 'vcms'), /ne peut pas recevoir/);
throws('matrice : la direction ne se règle pas dans la matrice', () => setPerm('admin', 'students', 'v'), /Rôle inconnu/);
throws('matrice : les modules système ne se règlent pas', () => setPerm('secretaire', 'users', 'vcms'), /ne se règle pas/);
throws('matrice : seule la direction modifie la matrice', () => call('apiSave', tokS, 'perms', { role: 'secretaire', module: 'payments', droits: 'vcms' }), /non autoris/);
setPerm('secretaire', 'payments', 'vm');
throws('matrice : secrétariat sans droit de création → ne peut plus encaisser', () => call('apiSave', tokS, 'payments', { studentId: kid.id, type: 'Mensualité', mois: 'Novembre', montant: 22000, mode: 'Espèces', date: '2026-10-22', recu: 'REC-Y' }), /non autoris/);
ok('matrice : … mais lit toujours les paiements', call('apiLoadAll', tokS).tables.payments.length > 50);
setPerm('secretaire', 'payments', 'vcms');
const tk0 = seed.tickets[1].id;
call('apiSave', T, 'modules', { id: 'tickets', actif: false });
ok('module désactivé : disparaît pour les non-direction', call('apiLoadAll', tokS).tables.tickets.length === 0 && call('apiLoadAll', T).tables.tickets.length > 0);
throws('module désactivé : écriture refusée', () => call('apiSave', tokS, 'tickets', { titre: 'x', priorite: 'Normale', statut: 'Ouvert' }), /non autoris/);
call('apiSave', T, 'modules', { id: 'tickets', actif: true });
ok('module réactivé', call('apiLoadAll', tokS).tables.tickets.length > 0);
ok('les modules système restent actifs même si on tente de les désactiver', call('apiSave', T, 'modules', { id: 'users', actif: false }).actif === true);
throws('module inconnu refusé', () => call('apiSave', T, 'modules', { id: 'pirate', actif: true }), /Module inconnu/);
throws('seule la direction règle les modules', () => call('apiSave', tokS, 'modules', { id: 'students', label: 'Pirate' }), /non autoris/);
ok('renommer un module', call('apiSave', T, 'modules', { id: 'students', label: 'Apprenants', sub: 'Dossiers', ordre: 2 }).label === 'Apprenants');
call('apiRemove', T, 'modules', ['students']);
const permsT = call('apiLoadAll', tokT).tables.perms;
ok('les droits envoyés à un rôle se limitent à son rôle', permsT.every(p => p.role === 'enseignant'));

/* =============== Inscription publique et comptes automatiques =============== */
const st0 = call('apiStatus');
ok('inscription ouverte par défaut, sans connexion', st0.registration.open === true && st0.registration.mode === 'validation' && st0.registration.classes.length === seed.classes.length);
ok('l’information publique ne dévoile ni élèves ni tarifs', !JSON.stringify(st0).includes(seed.students[0].nom + '"') && !('payments' in st0));
call('apiSave', T, 'notices', { titre: 'Pour les parents', contenu: 'x', date: '2026-10-01', cible: 'Parents', epingle: false, auteur: 'Direction' });
const yr = new Date().getFullYear(), kidBirth = `${yr - 10}-05-12`;
const chal = () => { const c = call('apiChallenge'); const [a, b] = c.q.split(' + ').map(Number); return { cid: c.id, cans: String(a + b) }; };
const baseForm = (over = {}) => ({ ...chal(), consent: true, canaux: ['email', 'whatsapp'], parent: { prenom: 'Rokhaya', nom: 'Thiam', lien: 'Mère', tel: '77 456 78 90', email: 'Rokhaya@Example.com', pwd: 'motdepasse-r1' }, enfants: [{ prenom: 'Aïda', nom: 'Thiam', sexe: 'F', naissance: kidBirth, classId: seed.classes[1].id, remarque: '=cmd|calc' }], ...over });
throws('sans jeton ni réponse : refus de la vérification', () => call('apiRegister', { ...baseForm(), cid: 'x' }, ''), /expiré/);
throws('mauvaise réponse à la question : refus', () => call('apiRegister', { ...baseForm(), cans: '999' }, ''), /incorrecte/);
const ch2 = chal(); try { call('apiRegister', { ...baseForm(), ...ch2, cans: '0' }, ''); } catch (e) { /* attendu */ }
throws('la question est à usage unique', () => { const c = chal(); call('apiRegister', baseForm({ ...c, parent: { ...baseForm().parent, tel: 'abc' } }), ''); }, /téléphone/);
throws('mot de passe trop court', () => call('apiRegister', baseForm({ parent: { ...baseForm().parent, pwd: 'court' } }), ''), /8 caract/);
throws('consentement obligatoire', () => call('apiRegister', baseForm({ consent: false }), ''), /accepter/);
throws('date de naissance impossible', () => call('apiRegister', baseForm({ enfants: [{ ...baseForm().enfants[0], naissance: '2030-02-30' }] }), ''), /naissance invalide/);
throws('âge improbable', () => call('apiRegister', baseForm({ enfants: [{ ...baseForm().enfants[0], naissance: '1950-01-01' }] }), ''), /improbable/);
throws('classe inconnue', () => call('apiRegister', baseForm({ enfants: [{ ...baseForm().enfants[0], classId: 'nimporte' }] }), ''), /classe/);
throws('au moins un enfant', () => call('apiRegister', baseForm({ enfants: [] }), ''), /au moins un enfant/);
throws('lien de parenté hors liste', () => call('apiRegister', baseForm({ parent: { ...baseForm().parent, lien: 'Roi' } }), ''), /lien/);
const nUsers = call('apiLoadAll', T).tables.users.length, nAdm = call('apiLoadAll', T).tables.admissions.length;
ok('robots : le champ piège répond « ok » sans rien créer', call('apiRegister', { ...baseForm(), site: 'http://spam' }, '').ok === true && call('apiLoadAll', T).tables.users.length === nUsers);
const mailsBefore = mails.length;
const reg = call('apiRegister', baseForm(), '');
ok('inscription : dossier reçu avec référence INS-AAAA-NNNN', reg.ok && reg.refs.length === 1 && /^INS-\d{4}-\d{4}$/.test(reg.refs[0]), reg);
ok('inscription : session ouverte pour la famille (compte candidat)', !!reg.session.token && reg.session.me.role === 'candidat' && reg.session.me.hash === '');
const uAfter = call('apiLoadAll', T).tables.users, newU = uAfter.find(u => u.id === reg.session.me.id);
ok('compte créé : identifiant = e-mail en minuscules, source « inscription »', newU.login === 'rokhaya@example.com' && newU.source === 'inscription' && newU.canaux === 'email,whatsapp');
const newAdm = call('apiLoadAll', T).tables.admissions.find(a => a.ref === reg.refs[0]);
ok('candidature : en attente, liée au compte, formule neutralisée', newAdm.statut === 'En attente' && newAdm.userId === newU.id && newAdm.source === 'en ligne' && !newAdm.remarque.startsWith('='), newAdm);
ok('mot de passe de la famille haché', !JSON.stringify(sheets.users._g).includes('motdepasse-r1'));
ok('accusé de réception par e-mail envoyé', mails.length === mailsBefore + 1 && mails[mails.length - 1].to === 'rokhaya@example.com' && /INS-/.test(mails[mails.length - 1].body) && /rokhaya@example.com/.test(mails[mails.length - 1].body), mails[mails.length - 1]);
const dK = call('apiLoadAll', reg.session.token).tables;
ok('candidat : voit sa candidature et les avis « Tous » seulement', dK.admissions.length === 1 && dK.admissions[0].id === newAdm.id && dK.notices.every(n => n.cible === 'Tous'));
ok('candidat : aucune donnée d’élève, de paiement, de note, de parent, d’utilisateur tiers', ['students', 'payments', 'marks', 'parents', 'attendance', 'conduct', 'documents', 'teachers', 'complaints', 'audit', 'outbox'].every(t => dK[t].length === 0) && dK.users.length === 1);
ok('candidat : voit le nom de la classe demandée seulement', dK.classes.length === 1 && dK.classes[0].id === seed.classes[1].id);
throws('candidat : ne peut rien modifier', () => call('apiSave', reg.session.token, 'students', { nom: 'X' }), /non autoris/);
throws('candidat : ne peut pas modifier sa candidature', () => call('apiSave', reg.session.token, 'admissions', { ...newAdm, statut: 'Admis' }), /non autoris/);
throws('candidat : ne peut pas déposer de plainte (module absent)', () => call('apiSave', reg.session.token, 'complaints', { date: '2026-10-22', categorie: 'Cantine', message: 'x' }), /non autoris/);
throws('doublon : même enfant refusé', () => call('apiRegister', baseForm({ parent: { ...baseForm().parent, tel: '77 999 88 77', email: 'autre@example.com' } }), ''), /déjà une inscription/);
throws('doublon : même compte refusé (téléphone ou e-mail déjà utilisé)', () => call('apiRegister', baseForm({ enfants: [{ ...baseForm().enfants[0], prenom: 'Autre' }] }), ''), /compte existe déjà/);
const sib = call('apiRegister', { consent: true, enfants: [{ prenom: 'Bilal', nom: 'Thiam', sexe: 'M', naissance: `${yr - 8}-02-03`, classId: seed.classes[0].id, remarque: '' }] }, reg.session.token);
ok('famille connectée : ajoute un enfant sans question de vérification', sib.ok && sib.refs.length === 1 && !sib.session && sib.refs[0] !== reg.refs[0]);
ok('… et voit maintenant deux candidatures', call('apiLoadAll', reg.session.token).tables.admissions.length === 2);
throws('un autre rôle (secrétaire) ne peut pas s’inscrire comme famille', () => call('apiRegister', { consent: true, enfants: [{ prenom: 'Z', nom: 'Z', sexe: 'M', naissance: kidBirth, classId: seed.classes[0].id }] }, tokS), /non autoris/);
const j = call('apiLogin', 'Rokhaya@Example.com', 'motdepasse-r1'); ok('la famille peut se reconnecter avec son e-mail (casse ignorée)', !!j.token);
const j2 = call('apiRegister', baseForm({ parent: { prenom: 'Cheikh', nom: 'Ba', lien: 'Père', tel: '+221 76 111 22 33', email: '', pwd: 'motdepasse-c1' }, canaux: [], enfants: [{ prenom: 'Mor', nom: 'Ba', sexe: 'M', naissance: kidBirth, classId: seed.classes[0].id }] }), '');
ok('sans e-mail : l’identifiant est le téléphone (chiffres)', j2.session.me.login === '761112233' && !!call('apiLogin', '76 111 22 33', 'motdepasse-c1').token);
// limite horaire
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 2 }) });
throws('limite d’inscriptions par heure', () => call('apiRegister', baseForm({ parent: { prenom: 'A', nom: 'B', lien: 'Père', tel: '77 000 11 22', email: 'a@b.sn', pwd: 'motdepasse-a1' }, enfants: [{ prenom: 'A', nom: 'B', sexe: 'M', naissance: kidBirth, classId: seed.classes[0].id }, { prenom: 'C', nom: 'B', sexe: 'M', naissance: kidBirth, classId: seed.classes[0].id }, { prenom: 'D', nom: 'B', sexe: 'M', naissance: kidBirth, classId: seed.classes[0].id }] }), ''), /Trop d’inscriptions/);
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 50 }) });
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ public: false }) });
ok('inscription fermée par la direction : plus de formulaire public', call('apiStatus').registration.open === false);
throws('inscription fermée : serveur refuse aussi', () => call('apiRegister', baseForm({ parent: { prenom: 'A', nom: 'B', lien: 'Père', tel: '77 000 11 23', email: 'c@d.sn', pwd: 'motdepasse-a1' } }), ''), /fermées/);
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 50 }) });
call('apiSave', T, 'modules', { id: 'admissions', actif: false });
ok('module Admissions désactivé : formulaire public fermé', call('apiStatus').registration.open === false);
call('apiSave', T, 'modules', { id: 'admissions', actif: true });
ok('options hors limites ramenées dans la plage, valeur de liste inconnue écartée', (() => { const r = call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 99999, mode: 'pirate' }) }); const o = JSON.parse(r.options); return o.maxParHeure === 200 && !('mode' in o); })());
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 50 }) });

/* =============== Admission : dossier, parent, comptes =============== */
const adm1 = call('apiLoadAll', tokS).tables.admissions.find(a => a.ref === reg.refs[0]);
throws('admettre : réservé à ceux qui peuvent modifier les admissions', () => call('apiAdmit', tokT, adm1.id, adm1.classId, ''), /non autoris/);
throws('numéro d’admission au mauvais format', () => call('apiAdmit', tokS, adm1.id, adm1.classId, 'XYZ'), /format ADM/);
throws('numéro d’admission déjà pris', () => call('apiAdmit', tokS, adm1.id, adm1.classId, seed.students[0].admission), /déjà attribué/);
const cls = call('apiLoadAll', T).tables.classes.find(c => c.id === adm1.classId), eff = call('apiLoadAll', T).tables.students.filter(s => s.classId === cls.id && s.statut === 'Actif').length;
call('apiSave', T, 'classes', { ...cls, effectifMax: eff });
throws('classe complète : admission refusée', () => call('apiAdmit', tokS, adm1.id, cls.id, ''), /est complète/);
call('apiSave', T, 'classes', { ...cls, effectifMax: eff + 5 });
throws('statut « Admis » posé à la main refusé', () => call('apiSave', tokS, 'admissions', { ...adm1, statut: 'Admis' }), /bouton « Admettre »/);
const mailsB = mails.length;
const out = call('apiAdmit', tokS, adm1.id, adm1.classId, '');
ok('admission : élève actif créé avec n° ADM-AAAA-NNN', out.student.statut === 'Actif' && /^ADM-\d{4}-\d{3,5}$/.test(out.student.admission) && out.student.classId === adm1.classId, out.student);
ok('admission : fiche parent créée à partir de la candidature', out.parent.prenom === 'Rokhaya' && out.parent.tel === '77 456 78 90' && out.student.parentId === out.parent.id, out.parent);
const comptes = out.comptes, cPar = comptes.find(c => c.role === 'parent'), cEl = comptes.find(c => c.role === 'eleve');
ok('comptes : le compte de la famille est conservé (pas de nouveau mot de passe)', cPar && cPar.nouveau === false && cPar.pwd === '');
ok('comptes : compte élève créé, identifiant = n° d’admission, mot de passe provisoire', cEl && cEl.login === out.student.admission.toLowerCase() && cEl.pwd.length >= 8 && cEl.nouveau === true, cEl);
const famNow = call('apiLoadAll', reg.session.token);
ok('la famille candidate devient « parent » et voit son enfant', famNow.me.role === 'parent' && famNow.tables.students.some(s => s.id === out.student.id && s.nom === 'Thiam'), famNow.me);
ok('… sans voir les autres familles', famNow.tables.parents.length === 1 && famNow.tables.parents[0].id === out.parent.id);
ok('… avis « Parents » désormais visibles', call('apiLoadAll', reg.session.token).tables.notices.some(n => n.cible === 'Parents'));
ok('mot de passe provisoire de l’élève jamais envoyé par message par défaut', mails.slice(mailsB).every(m => !m.body.includes(cEl.pwd)) && mails.length === mailsB + 1, mails.slice(mailsB));
const adm2sheet = JSON.stringify(sheets.outbox._g); ok('journal des envois : aucun mot de passe', !adm2sheet.includes(cEl.pwd));
const eleveLogin = call('apiLogin', cEl.login.toUpperCase(), cEl.pwd);
ok('l’élève se connecte avec son n° d’admission', eleveLogin.me.role === 'eleve' && eleveLogin.me.mustChange === true);
ok('élève : aucune donnée avant le changement du mot de passe provisoire', Object.keys(call('apiLoadAll', eleveLogin.token).tables).length === 0);
call('apiChangePassword', eleveLogin.token, cEl.pwd, 'mon-nouveau-mdp');
const dEl = call('apiLoadAll', eleveLogin.token); ok('élève : accès à son propre dossier après changement', dEl.me.mustChange === false && dEl.tables.students.some(s => s.id === out.student.id && s.nom === 'Thiam') && dEl.tables.payments.length === 0);
throws('admission déjà faite', () => call('apiAdmit', tokS, adm1.id, adm1.classId, ''), /déjà admis/);
// mode « envoyer l'accès »
const adm2 = call('apiLoadAll', tokS).tables.admissions.find(a => a.ref === sib.refs[0]);
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 50, envoyerAcces: true }) });
const mailsC = mails.length, out2 = call('apiAdmit', tokS, adm2.id, adm2.classId, '');
const pw2 = out2.comptes.find(c => c.role === 'eleve').pwd;
ok('option « envoyer l’accès » : le mot de passe part par e-mail', mails.length === mailsC + 1 && mails[mails.length - 1].body.includes(pw2));
ok('… mais le journal des envois le masque', !JSON.stringify(sheets.outbox._g).includes(pw2));
call('apiSave', T, 'modules', { id: 'admissions', options: JSON.stringify({ maxParHeure: 50 }) });
// admission d'une candidature saisie par le secrétariat (pas de compte famille) : compte parent créé avec mot de passe provisoire
const manual = call('apiSave', tokS, 'admissions', { date: '2026-10-01', nom: 'Walker', prenom: 'Inès', sexe: 'F', naissance: kidBirth, classId: seed.classes[2].id, parentPrenom: 'Sophie', parentNom: 'Walker', parentTel: '70 555 44 33', lien: 'Mère', statut: 'En attente', parentEmail: 'Sophie@Walker.org' });
const out3 = call('apiAdmit', tokS, manual.id, manual.classId, ''), cp3 = out3.comptes.find(c => c.role === 'parent');
ok('candidature saisie au guichet : compte parent créé, identifiant = e-mail, mot de passe provisoire', cp3.nouveau && cp3.login === 'sophie@walker.org' && cp3.pwd.length >= 8, cp3);
const l3 = call('apiLogin', 'sophie@walker.org', cp3.pwd); ok('… à changer à la première connexion', l3.me.mustChange === true && l3.me.role === 'parent');
throws('mot de passe provisoire : identique à l’ancien refusé', () => call('apiChangePassword', l3.token, cp3.pwd, cp3.pwd), /différent/);

/* =============== Personnalisation des modules : champs, listes =============== */
const defs = [{ k: 'ecole_prec', l: 'École précédente', t: 'text' }, { k: 'transport', l: 'Transport', t: 'select', o: ['Bus', 'À pied'], liste: true }, { k: 'age_fratrie', l: 'Frères et sœurs', t: 'num' }, { k: 'BAD KEY', l: 'x', t: 'text' }, { k: 'x', l: 'type inconnu', t: 'pirate' }];
const mod = call('apiSave', T, 'modules', { id: 'students', champs: JSON.stringify(defs), listes: '{}' });
ok('champs personnalisés : clés ou types invalides écartés', JSON.parse(mod.champs).length === 3 && JSON.parse(mod.champs).every(d => /^[a-z]/.test(d.k)), mod.champs);
const stX = call('apiSave', tokS, 'students', { ...seed.students[1], extra: JSON.stringify({ ecole_prec: '=HYPERLINK("http://x")', transport: 'Hélico', age_fratrie: '3', inconnu: 'zz' }) });
const ex = JSON.parse(stX.extra || '{}');
ok('valeurs personnalisées nettoyées : formule retirée, liste respectée, nombre converti, clé inconnue écartée', ex.ecole_prec === 'HYPERLINK("http://x")' && !('transport' in ex) && ex.age_fratrie === 3 && !('inconnu' in ex), ex);
ok('valeur valide conservée', JSON.parse(call('apiSave', tokS, 'students', { ...seed.students[1], extra: JSON.stringify({ transport: 'Bus' }) }).extra).transport === 'Bus');
throws('module sans champs personnalisés : refus', () => call('apiSave', T, 'modules', { id: 'results', champs: JSON.stringify([{ k: 'a', l: 'A', t: 'text' }]) }), /n’accepte pas/);
const lst = call('apiSave', T, 'modules', { id: 'payments', listes: JSON.stringify({ 'payments.mode': ['Espèces', ' Wave ', '=SOMME(1)', '', 'Chèque'], 'classes.niveau': ['X'] }) });
ok('listes modifiables : nettoyées et limitées au module', JSON.parse(lst.listes)['payments.mode'].join('|') === 'Espèces|Wave|SOMME(1)|Chèque' && !('classes.niveau' in JSON.parse(lst.listes)), lst.listes);
const noExtra = call('apiSave', tokT, 'marks', { examId: exam.id, studentId: st.id, note: 12, abs: false, extra: 'zz' });
ok('table sans module personnalisable : aucune donnée parasite', !('extra' in noExtra) || noExtra.extra === undefined);

/* =============== Canaux : e-mail, SMS, WhatsApp =============== */
throws('canaux : réservé à la direction', () => call('apiSave', tokS, 'channels', { id: 'sms', actif: true, fournisseur: 'lien' }), /non autoris/);
throws('canal inconnu refusé', () => call('apiSave', T, 'channels', { id: 'telegram', actif: true, fournisseur: 'lien' }), /Canal inconnu/);
throws('fournisseur non prévu pour ce canal refusé', () => call('apiSave', T, 'channels', { id: 'email', actif: true, fournisseur: 'twilio' }), /Fournisseur inconnu/);
throws('clés d’API : réservées à la direction', () => call('apiSetSecret', tokS, 'sms', 'token', 'abc'), /Réservé/);
throws('clé inconnue refusée', () => call('apiSetSecret', T, 'sms', 'mot-de-passe-root', 'abc'), /Clé inconnue/);
call('apiSave', T, 'channels', { id: 'whatsapp', actif: true, fournisseur: 'lien', expediteur: '' });
const parentRec = call('apiLoadAll', T).tables.parents[1], kidOfRec = call('apiLoadAll', T).tables.students.find(s => s.parentId === parentRec.id);
const bc = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['whatsapp'], texte: 'Réunion demain à 10 h & ça "marche" ?' });
ok('WhatsApp en mode lien : messages préparés, rien n’est envoyé par le serveur', bc.aEnvoyer === bc.total && bc.total > 0 && bc.envoyes === 0 && fetches.length === 0, bc);
ok('liens wa.me avec texte encodé', bc.liens.length > 0 && bc.liens.every(l => /^https:\/\/wa\.me\/221\d{9}\?text=/.test(l.lien)) && decodeURIComponent(bc.liens[0].lien.split('text=')[1]) === 'Réunion demain à 10 h & ça "marche" ?', bc.liens[0]);
const ob = call('apiLoadAll', tokS).tables.outbox; ok('journal des envois alimenté', ob.length >= bc.total && ob.some(r => r.statut === 'À envoyer' && r.canal === 'whatsapp'));
throws('seul le secrétariat (droit « créer » sur Envoyer un message) peut diffuser', () => call('apiBroadcast', tokT, { audience: 'parents', canaux: ['whatsapp'], texte: 'x' }), /non autoris/);
throws('canal inactif : aucun destinataire joignable', () => call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['sms'], texte: 'x' }), /Aucun destinataire/);
throws('message vide refusé', () => call('apiBroadcast', tokS, { audience: 'parents', canaux: ['whatsapp'], texte: '   ' }), /Écrivez/);
throws('aucun canal choisi', () => call('apiBroadcast', tokS, { audience: 'parents', canaux: [], texte: 'x' }), /au moins un canal/);

// Twilio (réseau simulé)
const SECRET_TOK = 'tok-SUPER-secret-9876', SECRET_SID = ['AC', 'fake', '0'.repeat(28)].join(''); // identifiant factice, construit à l’exécution pour ne pas ressembler à une vraie clé dans le dépôt
call('apiSave', T, 'channels', { id: 'whatsapp', actif: true, fournisseur: 'twilio', expediteur: 'Les Baobabs', options: JSON.stringify({ from: 'whatsapp:+14155238886' }) });
const unconf = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['whatsapp'], texte: 'Bonjour' });
ok('Twilio non configuré : échec clair, aucun appel réseau', unconf.echecs === unconf.total && fetches.length === 0 && /pas entièrement configuré/.test(call('apiLoadAll', tokS).tables.outbox.find(r => r.statut === 'Échec').detail));
call('apiSetSecret', T, 'whatsapp', 'sid', SECRET_SID); call('apiSetSecret', T, 'whatsapp', 'token', SECRET_TOK);
const stat = call('apiSecretsStatus', T);
ok('état des clés : indique présent/absent, jamais la valeur', stat.whatsapp.token === true && stat.whatsapp.sid === true && stat.sms.token === false && !JSON.stringify(stat).includes(SECRET_TOK) && stat.quota >= 0, stat);
throws('état des clés : réservé à la direction', () => call('apiSecretsStatus', tokS), /Réservé/);
fetches.length = 0;
const tw = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['whatsapp'], texte: 'Bonjour à tous' });
const f0 = fetches[0];
ok('Twilio : appel POST sur l’API officielle, identifiants en Basic, destinataire et expéditeur au format whatsapp:', tw.envoyes === tw.total && f0.url === `https://api.twilio.com/2010-04-01/Accounts/${SECRET_SID}/Messages.json` && f0.o.method === 'post' && f0.o.headers.Authorization === 'Basic ' + Buffer.from(SECRET_SID + ':' + SECRET_TOK).toString('base64') && /^whatsapp:\+221\d{9}$/.test(f0.o.payload.To) && f0.o.payload.From === 'whatsapp:+14155238886' && f0.o.payload.Body === 'Bonjour à tous', f0);
const sheetsDump = () => JSON.stringify(Object.values(sheets).map(x => x._g));
ok('les clés d’API ne sont jamais écrites dans le classeur', !sheetsDump().includes(SECRET_TOK) && !sheetsDump().includes(SECRET_SID));
fetchReply = () => ({ code: 400, body: JSON.stringify({ code: 63016, message: 'Message hors fenêtre de 24 h : un modèle approuvé est nécessaire' }) });
const twErr = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['whatsapp'], texte: 'Bonjour' });
const errRow = call('apiLoadAll', tokS).tables.outbox.filter(r => r.statut === 'Échec').pop();
ok('Twilio refuse : échec journalisé avec le motif du fournisseur', twErr.echecs === twErr.total && /400/.test(errRow.detail) && /modèle approuvé/.test(errRow.detail), errRow);
fetchReply = () => ({ code: 201, body: '{}' });
// SMS via Twilio avec service de messagerie (MG…)
call('apiSave', T, 'channels', { id: 'sms', actif: true, fournisseur: 'twilio', expediteur: '', options: JSON.stringify({ from: 'MG123456' }) });
call('apiSetSecret', T, 'sms', 'sid', SECRET_SID); call('apiSetSecret', T, 'sms', 'token', SECRET_TOK);
fetches.length = 0; call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['sms'], texte: 'SMS test' });
ok('SMS Twilio avec service de messagerie : MessagingServiceSid, pas de préfixe whatsapp', fetches.length > 0 && fetches[0].o.payload.MessagingServiceSid === 'MG123456' && !('From' in fetches[0].o.payload) && /^\+221\d{9}$/.test(fetches[0].o.payload.To));
// préférences de contact : un parent qui n'accepte que l'e-mail ne reçoit pas de SMS
const uRec = call('apiLoadAll', T).tables.users.find(u => u.role === 'parent' && u.linkId === par.id);
call('apiSave', T, 'users', { ...uRec, actif: true, canaux: 'email' });
fetches.length = 0; const only = call('apiBroadcast', tokS, { audience: 'classe', classId: kid.classId, canaux: ['sms'], texte: 'Préférences' });
ok('préférences de contact respectées (le parent « e-mail seulement » est exclu)', !fetches.some(f => f.o.payload.To === '+221' + String(par.tel).replace(/\D/g, '').slice(-9)), fetches.map(f => f.o.payload.To));
// passerelle personnalisée
call('apiSave', T, 'channels', { id: 'sms', actif: true, fournisseur: 'webhook', expediteur: '' });
call('apiSetSecret', T, 'sms', 'url', 'http://insecure.example/hook'); fetches.length = 0;
const wh0 = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['sms'], texte: 'Hook' });
ok('passerelle non sécurisée (http) refusée, aucun appel', wh0.echecs === wh0.total && fetches.length === 0);
call('apiSetSecret', T, 'sms', 'url', 'https://passerelle.example/sms'); call('apiSetSecret', T, 'sms', 'secret', 'partage-123');
const wh = call('apiBroadcast', tokS, { audience: 'classe', classId: kidOfRec.classId, canaux: ['sms'], texte: 'Hook' }), body = JSON.parse(fetches[0].o.payload);
ok('passerelle : JSON {canal,to,nom,texte,event}, secret dans l’en-tête X-Scolaria-Secret', wh.envoyes === wh.total && body.canal === 'sms' && /^\+221/.test(body.to) && body.texte === 'Hook' && fetches[0].o.headers['X-Scolaria-Secret'] === 'partage-123' && fetches[0].o.contentType === 'application/json', fetches[0]);
call('apiSetSecret', T, 'sms', 'secret', ''); ok('effacer une clé', call('apiSecretsStatus', T).sms.secret === false);
// plafond d'envois automatiques
call('apiSave', T, 'channels', { id: 'email', actif: true, fournisseur: 'gmail', expediteur: 'École' });
const manyParents = call('apiLoadAll', T).tables.parents;
const mailsM = mails.length;
call('apiSaveMany', T, 'parents', manyParents.map((p, k) => ({ ...p, email: `p${k}@famille.sn` })));
const e22 = call('apiBroadcast', tokS, { audience: 'parents', canaux: ['email'], texte: 'Tous les parents', sujet: 'Info' });
ok('envoi groupé par e-mail : un message par parent, expéditeur configuré', e22.envoyes === e22.total && mails.length - mailsM === e22.total && mails[mails.length - 1].name === 'École');
quota = 3;
throws('quota Gmail insuffisant : refus avant envoi', () => call('apiBroadcast', tokS, { audience: 'parents', canaux: ['email'], texte: 'x' }), /Quota/);
quota = 100;
call('apiSaveMany', T, 'parents', manyParents.slice(0, 1).map(p => ({ ...p, email: 'panne@ecole.sn' })));
const restoreP0 = () => call('apiSaveMany', T, 'parents', manyParents.slice(0, 1).map(p => ({ ...p, email: 'p0@famille.sn' })));
const brk = call('apiBroadcast', tokS, { audience: 'classe', classId: call('apiLoadAll', T).tables.students.find(s => s.parentId === manyParents[0].id).classId, canaux: ['email'], texte: 'Panne' });
ok('une adresse refusée par Gmail : échec journalisé, les autres partent', brk.echecs >= 1 && brk.envoyes >= 0 && /refusée/.test(call('apiLoadAll', T).tables.outbox.find(r => r.statut === 'Échec' && r.to === 'panne@ecole.sn').detail));
restoreP0();
// rappels de mensualité
const rem = call('apiRemind', tokS, []);
ok('rappels : un message par parent débiteur, texte avec le reste à payer', rem.total > 0 && call('apiLoadAll', tokS).tables.outbox.some(r => r.event === 'rappel' && /il reste [\d ]+ F/.test(r.texte)), rem);
throws('rappels : réservé à ceux qui peuvent envoyer', () => call('apiRemind', tokT, []), /non autoris/);
// message automatique de paiement
const obBefore = call('apiLoadAll', T).tables.outbox.length;
call('apiSave', tokS, 'payments', { studentId: kid.id, type: 'Mensualité', mois: 'Novembre', montant: 22000, mode: 'Wave', date: '2026-10-22', recu: 'REC-AUTO', caissier: 'k' });
ok('paiement : message automatique désactivé par défaut', call('apiLoadAll', T).tables.outbox.length === obBefore);
call('apiSave', T, 'templates', { id: 'paiement', actif: true, email: true, sms: false, whatsapp: false, sujet: 'Reçu {recu}', texte: '{ecole} : {montant} reçus pour {eleve} ({nature}). Reçu {recu}.' });
const mailsP = mails.length; call('apiSave', tokS, 'payments', { studentId: kid.id, type: 'Mensualité', mois: 'Décembre', montant: 22000, mode: 'Wave', date: '2026-10-22', recu: 'REC-AUTO2', caissier: 'k' });
ok('paiement : message envoyé au parent une fois le modèle activé', mails.length === mailsP + 1 && /REC-AUTO2/.test(mails[mails.length - 1].body) && /22 000 F/.test(mails[mails.length - 1].body) && mails[mails.length - 1].to === (call('apiLoadAll', T).tables.parents.find(p => p.id === par.id).email || mails[mails.length - 1].to), mails[mails.length - 1]);
throws('modèle : texte vide refusé', () => call('apiSave', T, 'templates', { id: 'paiement', actif: true, texte: '  ' }), /ne peut pas être vide/);
throws('modèle : événement inconnu refusé', () => call('apiSave', T, 'templates', { id: 'piratage', actif: true, texte: 'x' }), /inconnu/);
throws('modèles : réservés à la direction', () => call('apiSave', tokS, 'templates', { id: 'paiement', actif: false, texte: 'x' }), /non autoris/);
// journal des envois
const toSend = call('apiLoadAll', tokS).tables.outbox.find(r => r.statut === 'À envoyer');
throws('journal des envois : seul le serveur écrit', () => call('apiSave', T, 'outbox', { canal: 'sms', to: 'x', statut: 'Envoyé' }), /Table inconnue/);
if (toSend) { call('apiOutboxMark', tokS, toSend.id); ok('marquer un message manuel comme envoyé', call('apiLoadAll', tokS).tables.outbox.find(r => r.id === toSend.id).statut === 'Envoyé (manuel)'); }
else ok('(aucun message manuel à marquer : liens désactivés dans ce scénario)', true);
throws('journal des envois : enseignant sans accès', () => call('apiOutboxMark', tokT, 'x'), /non autoris/);
// essai de canal
const tt = call('apiTestChannel', T, 'email', ''); ok('essai e-mail : envoyé à l’administrateur par défaut', tt.statut === 'Envoyé' && tt.to === 'dir@ecole.sn');
throws('essai : numéro invalide refusé', () => call('apiTestChannel', T, 'sms', '12'), /invalide/);
throws('essai : réservé à la direction', () => call('apiTestChannel', tokS, 'email', ''), /Réservé/);

/* =============== Performance et fiabilité =============== */
stats.formats = 0; stats.reads = 0; call('apiLoadAll', T);
ok('lecture complète : aucun reformatage de colonne et au plus une lecture par table', stats.formats === 0 && stats.reads <= 37, stats);
call('apiLoadAll', T); ok('schéma déjà prêt : démarrage sans passer par les 37 onglets', true);
const before2 = stats.writes; call('apiSaveMany', T, 'attendance', seed.attendance.slice(0, 120).map(a => ({ ...a, statut: 'Présent' })));
ok('120 mises à jour groupées : une seule écriture de bloc', stats.writes - before2 <= 3, stats.writes - before2);
const dataAtt = call('apiLoadAll', T).tables.attendance; ok('… et les données restent justes', dataAtt.filter(a => seed.attendance.slice(0, 120).some(s => s.id === a.id)).every(a => a.statut === 'Présent') && dataAtt.length === seed.attendance.length);
/* =============== Point d'entrée HTTP (page hébergée sur Firebase) =============== */
const hPost = (obj, raw) => { const out = ctx.doPost({ postData: { contents: raw !== undefined ? raw : JSON.stringify(obj) } }); return { out, body: JSON.parse(out.getContent()) }; };
const hApiNames = [...fs.readFileSync(path.join(ROOT, 'backend/Code.gs'), 'utf8').matchAll(/^function (api[A-Z]\w*)\(/gm)].map(m => m[1]);
const hListed = Object.keys(G('api_()'));
ok('doPost : toutes les fonctions api* du serveur sont appelables, et rien d’autre', hApiNames.length >= 20 && hApiNames.every(n => hListed.includes(n)) && hListed.every(n => hApiNames.includes(n)), { manque: hApiNames.filter(n => !hListed.includes(n)), enTrop: hListed.filter(n => !hApiNames.includes(n)) });
const hSt = hPost({ fn: 'apiStatus', args: [] });
ok('doPost : réponse JSON { ok, data }', hSt.body.ok === true && hSt.body.data.hasUsers === true && hSt.out.getMimeType() === 'json', hSt.body);
const hLg = hPost({ fn: 'apiLogin', args: ['dir@ecole.sn', 'motdepasse1'] });
ok('doPost : connexion par HTTP, jeton renvoyé', hLg.body.ok === true && typeof hLg.body.data.token === 'string' && hLg.body.data.token.length > 20, hLg.body);
const hLd = hPost({ fn: 'apiLoadAll', args: [hLg.body.data.token] });
ok('doPost : lecture des données avec le jeton', hLd.body.ok === true && hLd.body.data.me.role === 'admin' && !hLd.body.data.me.hash, Object.keys(hLd.body));
const hBad = hPost({ fn: 'apiLoadAll', args: ['jeton-bidon'] });
ok('doPost : jeton invalide → erreur AUTH, détectée par le client', hBad.body.ok === false && /(^|\W)AUTH($|\W)/.test(hBad.body.error), hBad.body);
const hLgBad = hPost({ fn: 'apiLogin', args: ['dir@ecole.sn', 'faux'] });
ok('doPost : l’erreur métier remonte sans trace interne', hLgBad.body.ok === false && /incorrect/i.test(hLgBad.body.error) && !/at |\.gs|stack/i.test(hLgBad.body.error), hLgBad.body);
['ensureAll_', 'hash_', 'auth_', 'persist_', 'loadDb_', 'weeklyReport', 'installWeeklyTrigger', 'doGet', 'doPost', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'api_', 'apiInconnue', '', 'eval'].forEach(fn => {
  const r = hPost({ fn, args: [] });
  ok('doPost : fonction non autorisée refusée (« ' + fn + ' »)', r.body.ok === false && /inconnue/i.test(r.body.error), r.body);
});
ok('doPost : JSON invalide → erreur propre', hPost(null, '{pas du json').body.ok === false);
ok('doPost : corps vide → erreur propre', hPost(null, '').body.ok === false);
ok('doPost : trop d’arguments refusé', /arguments/.test(hPost({ fn: 'apiStatus', args: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).body.error));
ok('doPost : arguments non tableau ignorés sans planter', hPost({ fn: 'apiStatus', args: 'x' }).body.ok === true);
ok('doPost : corps démesuré refusé', /volumineuse/.test(hPost(null, 'x'.repeat(10 * 1024 * 1024 + 1)).body.error));
ok('doGet ?ping=1 : vérification de l’adresse sans ouvrir l’application', JSON.parse(ctx.doGet({ parameter: { ping: '1' } }).getContent()).ok === true);
// Le même contrôle des droits s'applique par HTTP : un enseignant ne peut pas lire les secrets ni changer un mot de passe
const hSec = hPost({ fn: 'apiSecretsStatus', args: [tokT] });
ok('doPost : un rôle non autorisé reste bloqué (clés d’API réservées à la direction)', hSec.body.ok === false && /Réservé/.test(hSec.body.error), hSec.body);

console.log(`\n${pass}/${pass + fail} vérifications réussies`); process.exit(fail ? 1 : 0);
