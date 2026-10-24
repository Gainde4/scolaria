const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
/* ---------- Simulation de l'API Google ---------- */
const sheets = {}; const mails = []; const cache = {};
function mkSheet(name) {
  const g = []; // g[r][c], index 0-based
  const sh = {
    name, _g: g, _frozen: 0,
    getLastColumn: () => g.reduce((m, r) => { let k = 0; r.forEach((v, i) => { if (v !== '' && v !== undefined) k = i + 1; }); return Math.max(m, k); }, 0),
    getLastRow: () => { let k = 0; g.forEach((r, i) => { if (r.some(v => v !== '' && v !== undefined)) k = i + 1; }); return k; },
    getMaxRows: () => Math.max(g.length, 1000),
    setFrozenRows() {},
    deleteRow(n) { g.splice(n - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) { return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (g[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      setValues: vals => { vals.forEach((row, i) => { g[r - 1 + i] = g[r - 1 + i] || []; row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; }); }); },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { return this; }
    }; }
  };
  return sh;
}
const ctx = {
  console, Date, Math, Object, Array, String, Number, JSON, isNaN, Error,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)) }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(), computeDigest: (a, d) => Array.from(crypto.createHash('sha256').update(d).digest()),
    base64Encode: b => Buffer.from(b).toString('base64'), Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    formatDate: (d, tz, f) => d.toISOString().slice(0, 10)
  },
  Session: { getScriptTimeZone: () => 'Africa/Dakar' },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  MailApp: { sendEmail: m => mails.push(m) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  ScriptApp: {}, HtmlService: {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist/gas/Code.gs'), 'utf8'), ctx);

/* ---------- Données d'exemple générées par le vrai code client ---------- */
const cctx = { console, Date, Math, Object, Array, String, Number, JSON, isNaN, Map, Set, setTimeout, window: {}, sessionStorage: { getItem() { return ''; } },
  React: { useState() {}, useEffect() {}, useMemo() {}, useRef() {}, useCallback() {}, createContext() {}, useContext() {}, Fragment: 1, createElement() {} }, htm: { bind: () => () => null } };
vm.createContext(cctx);
const corejs = fs.readFileSync(path.join(ROOT, 'src/js/00-core.js'), 'utf8').replace('__SCHEMA__', fs.readFileSync(path.join(ROOT, 'src/schema.json'), 'utf8'));
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
[uT, uP, uE, uS].forEach(u => call('apiSetPassword', T, u.id, 'secret-' + u.role));
const tokT = call('apiLogin', 'ens@ecole.sn', 'secret-enseignant').token, tokP = call('apiLogin', 'parent@ecole.sn', 'secret-parent').token, tokE = call('apiLogin', 'eleve@ecole.sn', 'secret-eleve').token, tokS = call('apiLogin', 'sec@ecole.sn', 'secret-secretaire').token;
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
throws('rapport réservé à la direction', () => call('apiEmailReport', tokS, 'x', 'y'), /Réservé/);
ok('journal d’audit alimenté côté serveur', call('apiLoadAll', T).tables.audit.length >= 8);
const before = call('apiLoadAll', T).tables.attendance.length; call('apiSaveMany', T, 'attendance', seed.attendance.slice(0, 5).map(a => ({ ...a, statut: 'Absent' })));
ok('mise à jour groupée sans doublons', call('apiLoadAll', T).tables.attendance.length === before);
call('weeklyReport'); ok('rapport hebdomadaire généré', mails.length === 2 && /Rapport hebdomadaire/.test(mails[1].htmlBody));
console.log(`\n${pass}/${pass + fail} vérifications réussies`); process.exit(fail ? 1 : 0);
