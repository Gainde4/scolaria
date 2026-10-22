/* ===== Scolaria : moteur de pages CRUD et configuration des modules ===== */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);
const B = (tone, t) => html`<${Badge} tone=${tone}>${t}<//>`;
const SEXE = [{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }];
const PHONE = v => v && !/^(70|75|76|77|78|33|30)[ .]?\d{3}[ .]?\d{2}[ .]?\d{2}$/.test(v.trim()) ? 'Numéro attendu : 77 123 45 67' : '';
const daysTo = d => Math.round((new Date(d + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 864e5);
const yearOf = db => ((db.settings[0] || {}).annee || '').slice(0, 4) || String(new Date().getFullYear());
const nextSeq = (rows, key) => rows.reduce((m, r) => { const x = /(\d+)$/.exec(r[key] || ''); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
const nextAdmission = db => 'ADM-' + yearOf(db) + '-' + pad(nextSeq(db.students, 'admission'));
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
  const table = cfg.table || cfg.key, canEdit = can(cfg.key, 'edit');
  const [q, setQ] = useState(''), [flt, setFlt] = useState({}), [limit, setLimit] = useState(60);
  const fields = typeof cfg.fields === 'function' ? cfg.fields(app) : cfg.fields;
  const cols = cfg.cols.map(c => typeof c === 'string' ? colFromField(fields.find(f => f.k === c), db) : c);
  let rows = cfg.scope ? cfg.scope(db[table], app) : db[table];
  rows = rows.filter(r => (cfg.filters || []).every(f => !flt[f.k] || r[f.k] === flt[f.k]));
  if (q.trim()) { const s = q.trim().toLowerCase(); rows = rows.filter(r => cols.some(c => String(c.v(r, db) ?? '').toLowerCase().includes(s))); }
  if (cfg.sort) rows = [...rows].sort(cfg.sort);

  const openForm = async row => {
    const initial = row ? { ...row } : { ...(cfg.defaults ? cfg.defaults(db, app) : {}) };
    const v = await ask({ title: row ? 'Modifier — ' + (cfg.rowTitle ? cfg.rowTitle(row, db) : cfg.singular) : cfg.nl, fields, initial, editing: row, onChange: cfg.onChange, validate: cfg.validate ? (vals, d) => cfg.validate(vals, d, row, app) : null, wide: fields.length > 8 });
    if (!v) return;
    const out = cfg.beforeSave ? cfg.beforeSave({ ...v }, db, app, row) : v;
    const saved = await save(table, out);
    notify(row ? 'Modifications enregistrées' : 'Enregistrement ajouté');
    if (cfg.afterSave) cfg.afterSave(saved, db, app);
  };
  const del = async row => {
    const ok = await ask({ title: 'Supprimer cet enregistrement ?', message: cfg.delMsg || 'Cette action est définitive.', submit: 'Supprimer', danger: true });
    if (!ok) return; await remove(table, [row.id]); notify('Enregistrement supprimé');
  };
  const acts = (cfg.rowActions || []).filter(a => a.open || canEdit);
  const rowActs = r => html`${acts.filter(a => !a.show || a.show(r, app)).map(a => html`<button type="button" key=${a.l} className="icon-btn txt" title=${a.l} onClick=${() => a.run(r, app)}><${Icon} n=${a.i || 'check'} s=${15} /><span>${a.l}</span></button>`)}${canEdit && html`<button type="button" className="icon-btn" title="Modifier" aria-label="Modifier" onClick=${() => openForm(r)}><${Icon} n="edit" s=${16} /></button>`}${canEdit && cfg.canDelete !== false && html`<button type="button" className="icon-btn danger" title="Supprimer" aria-label="Supprimer" onClick=${() => del(r)}><${Icon} n="trash" s=${16} /></button>`}`;
  const showActs = canEdit || acts.length > 0;

  return html`<section>
    <${PageHead} title=${cfg.title} sub=${cfg.sub}>${cfg.headExtra && cfg.headExtra(app)}${canEdit && html`<${Btn} tone="primary" icon="plus" onClick=${() => openForm()}>${cfg.nl}<//>`}<//>
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
      ${rows.length === 0 ? html`<${Empty} icon=${cfg.icon || 'file'} title="Aucun enregistrement">${q || Object.values(flt).some(Boolean) ? 'Aucun résultat pour ces critères.' : canEdit ? 'Utilisez le bouton « ' + cfg.nl + ' » pour commencer.' : 'Rien à afficher pour le moment.'}<//>`
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
    { k: 'admission', l: 'N° d’admission', req: true, ph: 'ADM-2026-031', hint: 'Format ADM-AAAA-NNN, unique pour chaque élève.', check: (v, vals, db, ed) => !/^ADM-\d{4}-\d{3}$/.test(v) ? 'Format attendu : ADM-2026-031' : db.students.some(s => s.admission === v && (!ed || s.id !== ed.id)) ? 'Ce numéro est déjà attribué' : '' },
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
  fields: [{ k: 'prenom', l: 'Prénom', req: true }, { k: 'nom', l: 'Nom', req: true }, { k: 'lien', l: 'Lien avec l’élève', t: 'select', o: ['Père', 'Mère', 'Tuteur', 'Tutrice'], req: true },
    { k: 'tel', l: 'Téléphone', t: 'tel', req: true, ph: '77 123 45 67', check: PHONE }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'profession', l: 'Profession' }, { k: 'adresse', l: 'Adresse / quartier', w: 'full' }],
  cols: [{ l: 'Responsable', v: p => fullName(p) }, 'lien', 'tel', { l: 'Enfants scolarisés', v: (p, db) => db.students.filter(s => s.parentId === p.id).map(s => s.prenom).join(', ') || '—' }, 'profession'],
  sort: byName,
  rowActions: [{ l: 'Lier un élève', i: 'link', run: async (p, app) => { const v = await app.ask({ title: 'Lier un élève à ' + fullName(p), fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true }], submit: 'Lier' }); if (!v) return; const s = app.db.students.find(x => x.id === v.studentId); await app.save('students', { ...s, parentId: p.id }); app.notify(fullName(s) + ' est lié(e) à ' + fullName(p)); } }]
};

CFG.admissions = {
  key: 'admissions', icon: 'clip', title: 'Admissions', sub: 'Candidatures reçues. Admettre un candidat crée son dossier élève et la fiche du parent.', nl: 'Nouvelle candidature', singular: 'candidature', rowTitle: a => fullName(a),
  fields: [dateF('date', 'Date de la demande'), { k: 'statut', l: 'Décision', t: 'select', o: ['En attente', 'Admis', 'Refusé'], req: true },
    { k: 'prenom', l: 'Prénom du candidat', req: true }, { k: 'nom', l: 'Nom du candidat', req: true }, { k: 'sexe', l: 'Sexe', t: 'select', o: SEXE, req: true }, dateF('naissance', 'Date de naissance'),
    { k: 'classId', l: 'Classe demandée', t: 'ref', ref: 'classes', req: true },
    { k: 'parentPrenom', l: 'Prénom du parent', req: true }, { k: 'parentNom', l: 'Nom du parent', req: true }, { k: 'parentTel', l: 'Téléphone du parent', t: 'tel', req: true, check: PHONE }, { k: 'lien', l: 'Lien', t: 'select', o: ['Père', 'Mère', 'Tuteur', 'Tutrice'] }, { k: 'remarque', l: 'Remarque', w: 'full' }],
  defaults: () => ({ date: todayStr(), statut: 'En attente' }),
  cols: [{ l: 'Date', v: a => fmtDate(a.date) }, { l: 'Candidat', v: a => fullName(a) }, 'classId', { l: 'Parent', v: a => a.parentPrenom + ' ' + a.parentNom + ' · ' + a.parentTel }, { l: 'Décision', v: a => a.statut, r: a => B(a.statut === 'Admis' ? 'ok' : a.statut === 'Refusé' ? 'bad' : 'warn', a.statut) }],
  filters: [{ k: 'statut', l: 'Décision', t: 'select', o: ['En attente', 'Admis', 'Refusé'] }],
  sort: (a, b) => b.date.localeCompare(a.date), canDelete: true,
  rowActions: [{
    l: 'Admettre', i: 'check', show: a => a.statut !== 'Admis',
    run: async (a, app) => {
      const db = app.db;
      const v = await app.ask({
        title: 'Admettre ' + fullName(a), message: 'Le dossier élève et la fiche du parent seront créés automatiquement.',
        fields: [{ k: 'classId', l: 'Classe d’affectation', t: 'ref', ref: 'classes', req: true }, { k: 'admission', l: 'N° d’admission', req: true, check: v => !/^ADM-\d{4}-\d{3}$/.test(v) ? 'Format attendu : ADM-2026-031' : db.students.some(s => s.admission === v) ? 'Numéro déjà attribué' : '' }],
        initial: { classId: a.classId, admission: nextAdmission(db) }, submit: 'Admettre',
        validate: (vals, d) => { const c = d.classes.find(x => x.id === vals.classId); const eff = d.students.filter(s => s.classId === vals.classId && s.statut === 'Actif').length; return c && eff >= c.effectifMax ? 'La classe ' + c.nom + ' est complète (' + eff + '/' + c.effectifMax + ').' : ''; }
      });
      if (!v) return;
      const tel = x => (x || '').replace(/\s/g, '');
      let par = a.parentTel ? db.parents.find(p => tel(p.tel) === tel(a.parentTel)) : null;
      if (!par) par = await app.save('parents', { nom: a.parentNom, prenom: a.parentPrenom, lien: a.lien || 'Tuteur', tel: a.parentTel, email: '', profession: '', adresse: '' });
      const st = await app.save('students', { admission: v.admission, nom: a.nom, prenom: a.prenom, sexe: a.sexe, naissance: a.naissance, classId: v.classId, parentId: par.id, tel: a.parentTel, adresse: '', statut: 'Actif', nin: '' });
      await app.save('admissions', { ...a, statut: 'Admis', classId: v.classId, studentId: st.id });
      app.notify(fullName(a) + ' est admis(e) en ' + clsName(db, v.classId));
    }
  }]
};

CFG.classes = {
  key: 'classes', icon: 'school', title: 'Classes et sections', sub: 'Organisation des classes, titulaires et effectifs.', nl: 'Nouvelle classe', singular: 'classe', rowTitle: c => c.nom,
  fields: [{ k: 'nom', l: 'Nom de la classe', req: true, ph: '6ème A' }, { k: 'niveau', l: 'Niveau', t: 'select', o: ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'], req: true }, { k: 'section', l: 'Section', ph: 'A' },
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
  fields: [{ k: 'matricule', l: 'Matricule', req: true, ph: 'ENS-009', check: (v, vals, db, ed) => db.teachers.some(t => t.matricule === v && (!ed || t.id !== ed.id)) ? 'Matricule déjà utilisé' : '' }, { k: 'statut', l: 'Statut', t: 'select', o: ['Permanent', 'Vacataire'], req: true },
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

CFG.users = {
  key: 'users', icon: 'shield', title: 'Utilisateurs et rôles', sub: 'Comptes du personnel, des élèves et des parents. Le rôle détermine les modules visibles.', nl: 'Nouvel utilisateur', singular: 'utilisateur', rowTitle: u => u.nom,
  fields: [{ k: 'nom', l: 'Nom complet', req: true }, { k: 'email', l: 'Adresse Google', t: 'email', req: true, hint: 'Le compte Google qui ouvre l’application.', check: (v, vals, db, ed) => db.users.some(u => u.email.toLowerCase() === (v || '').toLowerCase() && (!ed || u.id !== ed.id)) ? 'Cette adresse a déjà un compte' : '' },
    { k: 'role', l: 'Rôle', t: 'select', o: ROLES.map(([v, l]) => ({ v, l })), req: true },
    { k: 'linkId', l: 'Fiche liée', t: 'select', show: v => ['enseignant', 'eleve', 'parent'].includes(v.role), hint: 'Relie le compte à l’enseignant, l’élève ou le parent concerné.', o: (v, db) => v.role === 'enseignant' ? teacherOptions(db) : v.role === 'eleve' ? db.students.map(s => ({ v: s.id, l: LABEL.students(s, db) })) : v.role === 'parent' ? db.parents.map(p => ({ v: p.id, l: fullName(p) })) : [] },
    { k: 'tel', l: 'Téléphone', t: 'tel' }, { k: 'actif', l: 'Compte', t: 'bool', cl: 'Actif' }],
  defaults: () => ({ role: 'enseignant', actif: true }),
  cols: ['nom', { l: 'E-mail', v: u => u.email }, { l: 'Rôle', v: u => ROLE_LABEL[u.role], r: u => B(u.role === 'admin' ? 'accent' : 'info', ROLE_LABEL[u.role]) }, { l: 'Compte', v: u => u.actif ? 'Actif' : 'Désactivé', r: u => B(u.actif ? 'ok' : 'mute', u.actif ? 'Actif' : 'Désactivé') }],
  sort: byName, delMsg: 'Cet utilisateur ne pourra plus ouvrir l’application.',
  rowActions: IN_GAS ? [{ l: 'Mot de passe', i: 'shield', run: async (u, app) => { const v = await app.ask({ title: 'Définir le mot de passe de ' + u.nom, message: 'Communiquez ce mot de passe à la personne. Elle pourra ensuite le changer depuis son profil.', fields: [{ k: 'pwd', l: 'Nouveau mot de passe', t: 'text', req: true, hint: '8 caractères minimum.', check: x => x && x.length < 8 ? 'Au moins 8 caractères' : '' }], submit: 'Enregistrer' }); if (!v) return; try { await Api.setPassword(u.id, v.pwd); app.notify('Mot de passe défini pour ' + u.nom); } catch (e) { app.notify(e.message, 'bad'); } } }] : []
};

CFG.exams = {
  key: 'exams', icon: 'clip', title: 'Examens et évaluations', sub: 'Programmation des devoirs et compositions, classe par classe.', nl: 'Nouvelle épreuve', singular: 'épreuve', rowTitle: (e, db) => LABEL.exams(e, db),
  fields: [{ k: 'session', l: 'Session', req: true, ph: 'Composition 1 – T1', hint: 'Les épreuves d’une même session sont regroupées dans les résultats et les convocations.', list: db => [...new Set(db.exams.map(e => e.session))] },
    { k: 'type', l: 'Type', t: 'select', o: ['Devoir', 'Composition', 'Examen blanc', 'Examen final'], req: true },
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
  fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full' }, { k: 'activite', l: 'Activité', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Sport', 'Culture', 'Club', 'Concours', 'Bénévolat'], req: true }, dateF('date', 'Date de début'), { k: 'resultat', l: 'Rôle ou résultat' }],
  defaults: () => ({ date: todayStr() }),
  cols: [{ l: 'Élève', v: (a, db) => refLabel(db, 'students', a.studentId) }, 'activite', 'categorie', { l: 'Début', v: a => fmtDate(a.date) }, { l: 'Rôle / résultat', v: a => a.resultat }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: ['Sport', 'Culture', 'Club', 'Concours', 'Bénévolat'] }], sort: (a, b) => b.date.localeCompare(a.date)
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
  fields: [{ k: 'titre', l: 'Événement', req: true, w: 'full' }, dateF('date', 'Début'), { k: 'fin', l: 'Fin', t: 'date', check: (v, vals) => v && vals.date && v < vals.date ? 'La fin précède le début' : '' }, { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Examen', 'Réunion', 'Fête', 'Vacances', 'Autre'], req: true }, { k: 'lieu', l: 'Lieu' }],
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
  fields: [{ k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full' }, { k: 'type', l: 'Type de pièce', t: 'select', o: ['Acte de naissance', 'Certificat médical', 'Bulletin précédent', 'Pièce d’identité du tuteur', 'Certificat de scolarité', 'Autorisation parentale'], req: true }, { k: 'titre', l: 'Intitulé', req: true }, { k: 'fichier', l: 'Fichier', t: 'file', hint: 'Seul le nom du fichier est enregistré dans la feuille de calcul.' }, { k: 'expiration', l: 'Date d’expiration', t: 'date' }, { k: 'verifie', l: 'Vérification', t: 'bool', cl: 'Document vérifié' }],
  defaults: () => ({ verifie: false }),
  onChange: (v, k, db) => k === 'type' && !v.titre ? { titre: v.type } : null,
  cols: [{ l: 'Intitulé', v: d => d.titre }, { l: 'Élève', v: (d, db) => refLabel(db, 'students', d.studentId) }, { l: 'Fichier', v: d => d.fichier, mono: true }, { l: 'Vérifié', v: d => d.verifie ? 'Oui' : 'Non', r: d => B(d.verifie ? 'ok' : 'warn', d.verifie ? 'Vérifié' : 'À vérifier') }, { l: 'Échéance', v: d => expInfo(d.expiration).txt, r: d => B(expInfo(d.expiration).tone, expInfo(d.expiration).txt) }],
  filters: [{ k: 'type', l: 'Type', t: 'select', o: ['Acte de naissance', 'Certificat médical', 'Bulletin précédent', 'Pièce d’identité du tuteur', 'Certificat de scolarité', 'Autorisation parentale'] }],
  sort: (a, b) => (a.expiration || '9999').localeCompare(b.expiration || '9999'),
  rowActions: [{ l: 'Vérifier', i: 'check', show: d => !d.verifie, run: async (d, app) => { await app.save('documents', { ...d, verifie: true }); app.notify('Document marqué comme vérifié'); } }]
};

CFG.assets = {
  key: 'assets', icon: 'tool', title: 'Équipements', sub: 'Registre des biens de l’école et historique d’entretien.', nl: 'Nouvel équipement', singular: 'équipement', rowTitle: a => a.nom,
  fields: [{ k: 'tag', l: 'Code d’inventaire', req: true, ph: 'IMM-007', check: (v, vals, db, ed) => db.assets.some(a => a.tag === v && (!ed || a.id !== ed.id)) ? 'Code déjà utilisé' : '' }, { k: 'nom', l: 'Désignation', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Informatique', 'Bureautique', 'Mobilier', 'Énergie', 'Transport', 'Sport', 'Autre'], req: true }, { k: 'lieu', l: 'Emplacement' },
    { k: 'achat', l: 'Date d’achat', t: 'date' }, { k: 'valeur', l: 'Valeur d’achat (FCFA)', t: 'num', min: 0, step: 1000 }, { k: 'etat', l: 'État', t: 'select', o: ['Bon', 'Passable', 'Usagé', 'En panne'], req: true }, { k: 'responsable', l: 'Responsable' }],
  defaults: db => ({ tag: 'IMM-' + pad(nextSeq(db.assets, 'tag')), etat: 'Bon' }),
  cols: [{ l: 'Code', v: a => a.tag, mono: true }, 'nom', 'categorie', 'lieu', { l: 'Valeur', v: a => money(a.valeur), num: true }, { l: 'État', v: a => a.etat, r: a => B({ Bon: 'ok', Passable: 'info', Usagé: 'warn', 'En panne': 'bad' }[a.etat], a.etat) }, { l: 'Dernier entretien', v: (a, db) => { const m = db.maintenance.filter(x => x.assetId === a.id).sort((p, q) => q.date.localeCompare(p.date))[0]; return m ? fmtDate(m.date) : '—'; } }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: ['Informatique', 'Bureautique', 'Mobilier', 'Énergie', 'Transport', 'Sport', 'Autre'] }, { k: 'etat', l: 'État', t: 'select', o: ['Bon', 'Passable', 'Usagé', 'En panne'] }],
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
  fields: [{ k: 'code', l: 'Code article', req: true, check: (v, vals, db, ed) => db.stock.some(s => s.code === v && (!ed || s.id !== ed.id)) ? 'Code déjà utilisé' : '' }, { k: 'nom', l: 'Désignation', req: true }, { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Fournitures', 'Bureautique', 'Entretien', 'Sport', 'Autre'], req: true }, { k: 'unite', l: 'Unité', req: true, ph: 'pièce, boîte, ramette…' },
    { k: 'initial', l: 'Quantité initiale', t: 'num', min: 0, req: true }, { k: 'seuil', l: 'Seuil de réapprovisionnement', t: 'num', min: 0, req: true }, { k: 'prix', l: 'Prix unitaire (FCFA)', t: 'num', min: 0, step: 50 }],
  defaults: () => ({ initial: 0, seuil: 5, unite: 'pièce' }),
  cols: [{ l: 'Code', v: s => s.code, mono: true }, 'nom', 'categorie', { l: 'Quantité', v: (s, db) => stockQty(db, s) + ' ' + s.unite, num: true }, { l: 'Seuil', v: s => s.seuil, num: true }, { l: 'Valeur', v: (s, db) => money(stockQty(db, s) * s.prix), num: true }, { l: 'Statut', v: (s, db) => stockQty(db, s) <= 0 ? 'Rupture' : stockQty(db, s) <= s.seuil ? 'À réapprovisionner' : 'Suffisant', r: (s, db) => { const q = stockQty(db, s); return q <= 0 ? B('bad', 'Rupture') : q <= s.seuil ? B('warn', 'À réapprovisionner') : B('ok', 'Suffisant'); } }],
  filters: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: ['Fournitures', 'Bureautique', 'Entretien', 'Sport', 'Autre'] }],
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
  fields: [dateF('date', 'Date'), { k: 'mode', l: 'Mode de paiement', t: 'select', o: ['Espèces', 'Wave', 'Orange Money', 'Virement', 'Chèque'], req: true }, { k: 'studentId', l: 'Élève', t: 'ref', ref: 'students', req: true, w: 'full', fl: s => s.statut === 'Actif' },
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
  filters: [{ k: 'type', l: 'Nature', t: 'select', o: ['Inscription', 'Mensualité', 'Transport', 'Cantine', 'Autre'] }, { k: 'mode', l: 'Mode', t: 'select', o: ['Espèces', 'Wave', 'Orange Money', 'Virement', 'Chèque'] }, { k: 'mois', l: 'Mois', t: 'select', o: MOIS }],
  sort: (a, b) => b.date.localeCompare(a.date) || b.recu.localeCompare(a.recu),
  delMsg: 'Supprimer un encaissement efface aussi son numéro de reçu. Préférez une correction par écriture contraire si le reçu a déjà été remis.',
  rowActions: [{ l: 'Reçu', i: 'receipt', open: true, run: (p, app) => app.ask({ title: 'Reçu ' + p.recu, wide: true, noCancel: true, submit: 'Fermer', extra: () => html`<${Receipt} p=${p} />` }) }]
};
