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
