/* ===== Scolaria : noyau (constantes, utilitaires, accès aux données, données de démonstration) ===== */
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext, Fragment } = React;
const html = htm.bind(React.createElement);
const IN_GAS = typeof google !== 'undefined' && !!(google.script && google.script.run);

/* Schéma unique : injecté à la construction, partagé avec Code.gs */
const SCHEMA = __SCHEMA__;
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
const MOIS = ['Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const ROLES = [['admin', 'Direction'], ['secretaire', 'Secrétariat'], ['enseignant', 'Enseignant'], ['surveillant', 'Surveillant général'], ['eleve', 'Élève'], ['parent', 'Parent']];
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

/* ---------- Mensualités et impayés ---------- */
function monthsElapsed() {
  const m = new Date().getMonth() + 1;
  if (m >= 10) return m - 9;
  if (m <= 6) return m + 3;
  return m === 9 ? 0 : 9;
}
function studentDues(db, s) {
  const fee = db.feeStructure.find(f => f.classId === s.classId) || { inscription: 0, mensualite: 0 };
  const count = monthsElapsed();
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

  db.settings.push({ id: 'main', ecole: 'Complexe scolaire Les Baobabs', adresse: 'Avenue Léopold Sédar Senghor, Dakar', tel: '33 000 00 00', email: 'contact@lesbaobabs.example', annee, devise: 'FCFA', noteMax: 20, notePassage: 10, responsable: 'Seydou Mbaye', slogan: 'Apprendre, grandir, réussir' });

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

  /* utilisateurs */
  db.users.push(
    { id: 'u-admin', email: 'directeur@lesbaobabs.example', nom: 'Seydou Mbaye', role: 'admin', linkId: '', tel: '77 000 00 01', actif: true },
    { id: 'u-sec', email: 'secretariat@lesbaobabs.example', nom: 'Khady Thiam', role: 'secretaire', linkId: '', tel: '77 000 00 02', actif: true },
    { id: 'u-ens', email: db.teachers[0].email, nom: fullName(db.teachers[0]), role: 'enseignant', linkId: db.teachers[0].id, tel: db.teachers[0].tel, actif: true },
    { id: 'u-sur', email: 'surveillance@lesbaobabs.example', nom: 'Idrissa Camara', role: 'surveillant', linkId: '', tel: '77 000 00 03', actif: true },
    { id: 'u-eleve', email: 'eleve@lesbaobabs.example', nom: fullName(db.students[0]), role: 'eleve', linkId: db.students[0].id, tel: '', actif: true },
    { id: 'u-parent', email: 'parent@lesbaobabs.example', nom: fullName(db.parents[0]), role: 'parent', linkId: db.parents[0].id, tel: db.parents[0].tel, actif: true });

  /* admissions */
  [['Khadija', 'Sow', 'F', 'Mame', 'Sow', '77 120 45 67', 'Mère', 'En attente'], ['Pathé', 'Ndoye', 'M', 'Ablaye', 'Ndoye', '76 330 12 90', 'Père', 'En attente'], ['Yacine', 'Gomis', 'F', 'Rama', 'Gomis', '78 410 22 31', 'Mère', 'Refusé']].forEach((a, i) =>
    db.admissions.push({ id: id('adm'), date: addDays(T, -3 - i * 2), nom: a[1], prenom: a[0], sexe: a[2], naissance: (startY - 11) + '-0' + (i + 3) + '-12', classId: db.classes[0].id, parentPrenom: a[3], parentNom: a[4], parentTel: a[5], lien: a[6], statut: a[7], remarque: a[7] === 'Refusé' ? 'Effectif complet' : '', studentId: '' }));

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
  db.__v = 1;
  return db;
}

/* ---------- Accès aux données ---------- */
const LS_KEY = 'scolaria-demo-v1';
const lsGet = () => { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const lsSet = db => { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { /* stockage indisponible : la démo reste en mémoire */ } };
const lsClear = () => { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } };

const gas = (fn, ...a) => new Promise((ok, ko) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => ko(new Error((e && e.message) || String(e))))[fn](...a));
let TOKEN = ''; try { TOKEN = sessionStorage.getItem('scolaria-token') || ''; } catch (e) { /* ignore */ }
const setToken = t => { TOKEN = t || ''; try { if (t) sessionStorage.setItem('scolaria-token', t); else sessionStorage.removeItem('scolaria-token'); } catch (e) { /* ignore */ } };
const isAuthErr = e => e && /(^|\W)AUTH($|\W)/.test(e.message || '');
const Api = IN_GAS ? {
  status: () => gas('apiStatus'),
  async login(email, pwd) { const r = await gas('apiLogin', email, pwd); setToken(r.token); },
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
  email: (subject, body) => gas('apiEmailReport', TOKEN, subject, body)
} : {
  async load(role) {
    let db = lsGet(); if (!db || db.__v !== 1) { db = buildSeed(); lsSet(db); }
    return { db, me: db.users.find(u => u.role === (role || 'admin')) };
  }
};
