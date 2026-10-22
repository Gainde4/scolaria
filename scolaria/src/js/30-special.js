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
  const app = useApp(); const { db, me } = app, kids = me.role === 'parent' ? myKids(app) : null;
  const [cid, setCid] = useState(''), [q, setQ] = useState(''), [only, setOnly] = useState(false);
  let studs = db.students.filter(s => s.statut === 'Actif' && (!kids || kids.some(k => k.id === s.id)) && (!cid || s.classId === cid)).sort(byName);
  if (q.trim()) studs = studs.filter(s => fullName(s).toLowerCase().includes(q.trim().toLowerCase()));
  let rows = studs.map(s => ({ s, d: studentDues(db, s) })); if (only) rows = rows.filter(r => r.d.reste > 0);
  const total = rows.reduce((a, r) => a + r.d.reste, 0), n = monthsElapsed();
  const lab = { ok: 'Payé', part: 'Partiel', no: 'Impayé', fut: 'À venir' };
  return html`<section>
    <${PageHead} title="Suivi des mensualités" sub=${'Situation de chaque élève, mois par mois (' + MOIS[0] + ' à ' + MOIS[8] + '). Les mois à venir ne comptent pas encore dans le reste dû.'} />
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
  const conduct = db.conduct.filter(c => studs.some(s => s.id === c.studentId));
  const girls = studs.filter(s => s.sexe === 'F').length;
  const body = () => '<h2>Rapport de classe — ' + clsName(db, cid) + '</h2><ul><li>Effectif : ' + studs.length + ' (' + girls + ' filles, ' + (studs.length - girls) + ' garçons)</li><li>Présence sur 30 jours : ' + (att.length ? dec(here / att.length * 100, 1) + ' %' : 'n/d') + '</li><li>Moyenne de classe (' + (session || 'aucune session') + ') : ' + (avg === null ? 'n/d' : dec(avg)) + '</li><li>Taux de réussite : ' + (pass === null ? 'n/d' : dec(pass, 0) + ' %') + '</li><li>Élèves en grande difficulté (< 8) : ' + weak.length + '</li><li>Élèves avec impayés : ' + dues.length + '</li></ul>';
  const email = async () => {
    if (!IN_GAS) { await ask({ title: 'Envoi par e-mail', noCancel: true, submit: 'Compris', message: 'L’envoi automatique des rapports est disponible une fois l’application déployée sur Google Apps Script. Le rapport est alors envoyé à la direction depuis votre compte Google.' }); return; }
    try { await Api.email('Rapport de classe — ' + clsName(db, cid), body()); notify('Rapport envoyé à la direction'); } catch (e) { notify('Envoi impossible : ' + e.message, 'bad'); }
  };
  return html`<section>
    <${PageHead} title="Rapports de classe" sub="Vue d’ensemble d’une classe : effectifs, assiduité, résultats, conduite et impayés.">${can('reports', 'edit') && html`<${Btn} icon="mail" onClick=${email}>Envoyer par e-mail<//>`}${printBtn()}<//>
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
      <div className="card"><h2 className="card-title">Vie de classe</h2><ul className="facts"><li><span>Mentions de conduite</span><strong className="mono">${conduct.length}</strong></li><li><span>Sanctions (retenue, blâme, exclusion)</span><strong className="mono">${conduct.filter(c => ['Retenue', 'Blâme', 'Exclusion temporaire'].includes(c.type)).length}</strong></li><li><span>Éloges</span><strong className="mono">${conduct.filter(c => c.type === 'Éloge').length}</strong></li>${can('payments', 'view') && html`<li><span>Élèves avec impayés</span><strong className="mono">${dues.length}</strong></li><li><span>Montant à recouvrer</span><strong className="mono">${money(dues.reduce((a, x) => a + x.d.reste, 0))}</strong></li>`}</ul></div>
    </div></section>`;
}

/* ---------- Plaintes anonymes ---------- */
CFG.complaints = {
  key: 'complaints', icon: 'shield', title: 'Plaintes anonymes', sub: 'Signalements déposés sans nom. La direction suit leur traitement et répond ici.', nl: 'Nouvelle plainte', singular: 'plainte', rowTitle: () => 'plainte',
  fields: [dateF('date', 'Date'), { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Cantine', 'Discipline', 'Enseignement', 'Sécurité', 'Transport', 'Autre'], req: true }, { k: 'message', l: 'Message', t: 'area', req: true, rows: 4 }, { k: 'statut', l: 'Traitement', t: 'select', o: ['Nouvelle', 'En cours', 'Résolue'], req: true }, { k: 'reponse', l: 'Réponse de l’école', t: 'area' }],
  defaults: () => ({ date: todayStr(), statut: 'Nouvelle' }),
  cols: [{ l: 'Date', v: c => fmtDate(c.date) }, 'categorie', { l: 'Message', v: c => c.message }, { l: 'Traitement', v: c => c.statut, r: c => B(c.statut === 'Résolue' ? 'ok' : c.statut === 'En cours' ? 'info' : 'warn', c.statut) }, { l: 'Réponse', v: c => c.reponse }],
  filters: [{ k: 'statut', l: 'Traitement', t: 'select', o: ['Nouvelle', 'En cours', 'Résolue'] }], sort: (a, b) => b.date.localeCompare(a.date)
};
function ComplaintsPage() {
  const app = useApp(); const { can, ask, save, notify } = app;
  if (can('complaints', 'edit')) return html`<${CrudPage} cfg=${CFG.complaints} />`;
  const send = async () => {
    const v = await ask({ title: 'Déposer une plainte anonyme', message: 'Aucun nom, compte ou adresse n’est enregistré avec ce message.', fields: [{ k: 'categorie', l: 'Catégorie', t: 'select', o: CFG.complaints.fields[1].o, req: true }, { k: 'message', l: 'Votre message', t: 'area', req: true, rows: 5 }], submit: 'Envoyer' });
    if (!v) return; await save('complaints', { date: todayStr(), categorie: v.categorie, message: v.message, statut: 'Nouvelle', reponse: '' }); notify('Votre message a été transmis à la direction');
  };
  return html`<section><${PageHead} title="Plaintes anonymes" sub="Signalez un problème à la direction sans vous identifier." />
    <div className="card center"><${Icon} n="shield" s=${32} /><h2 className="card-title">Votre message reste anonyme</h2><p className="muted">Cantine, discipline, sécurité, transport : décrivez la situation. La direction lit chaque signalement et y répond. Pour une urgence, contactez directement l’école.</p><${Btn} tone="primary" icon="send" onClick=${send}>Écrire un message<//></div></section>`;
}

/* ---------- Mon espace (élèves et parents) ---------- */
function FamilyHome() {
  const app = useApp(); const { db, me, go } = app, kids = myKids(app), t = todayStr();
  const notices = CFG.notices.scope(db.notices, app).sort(CFG.notices.sort).slice(0, 3);
  const next = db.events.filter(e => (e.fin || e.date) >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return html`<section>
    <${PageHead} title=${'Bonjour ' + (me.nom || '').split(' ')[0]} sub=${me.role === 'parent' ? 'Le suivi de la scolarité de vos enfants.' : 'Votre scolarité en un coup d’œil.'} />
    ${!kids.length && html`<${Empty} icon="users" title="Aucun élève lié à ce compte">Demandez au secrétariat de relier votre compte à la fiche élève.<//>`}
    <div className="kids">${kids.map(s => {
    const att = db.attendance.filter(a => a.studentId === s.id), here = att.filter(a => a.statut === 'Présent' || a.statut === 'Retard').length;
    const sess = sessionsWithMarks(db, s.classId)[0], r = sess ? computeResults(db, s.classId, sess).rows.find(x => x.s.id === s.id) : null, d = studentDues(db, s);
    const ex = db.exams.filter(e => e.classId === s.classId && e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    return html`<article key=${s.id} className="card kid"><header><div className="avatar">${(s.prenom[0] || '') + (s.nom[0] || '')}</div><div><h2>${fullName(s)}</h2><span className="muted">${clsName(db, s.classId)} · ${s.admission}</span></div></header>
      <dl><div><dt>Assiduité</dt><dd className="mono">${att.length ? dec(here / att.length * 100, 1) + ' %' : '—'}</dd></div>
      <div><dt>Moyenne ${sess ? '(' + sess + ')' : ''}</dt><dd className="mono">${r && r.moy !== null ? dec(r.moy) + ' · ' + r.rang + (r.rang === 1 ? 'er' : 'e') : '—'}</dd></div>
      ${me.role === 'parent' && html`<div><dt>Reste à payer</dt><dd className=${'mono' + (d.reste ? ' due' : '')}>${d.reste ? money(d.reste) : 'À jour'}</dd></div>`}
      <div><dt>Prochaine épreuve</dt><dd>${ex ? fmtDate(ex.date) + ' · ' + ((db.subjects.find(x => x.id === ex.subjectId) || {}).nom || '') : '—'}</dd></div></dl>
      <div className="kid-actions"><${Btn} sm onClick=${() => go('results')}>Résultats<//><${Btn} sm onClick=${() => go('timetable')}>Emploi du temps<//>${me.role === 'parent' && html`<${Btn} sm onClick=${() => go('dues')}>Mensualités<//>`}</div></article>`;
  })}</div>
    <div className="grid2"><div className="card"><h2 className="card-title">Avis de l’école</h2>${notices.length ? notices.map(n => html`<div key=${n.id} className="mininote"><strong>${n.titre}</strong><span className="muted">${fmtDate(n.date)}</span><p>${n.contenu}</p></div>`) : html`<p className="muted">Aucun avis.</p>`}</div>
      <div className="card"><h2 className="card-title">À venir</h2>${next.length ? html`<ul className="evlist">${next.map(e => html`<li key=${e.id}><span className="mono">${fmtDate(e.date)}</span><span>${e.titre}</span>${B(EVT_TONE[e.categorie] || 'mute', e.categorie)}</li>`)}</ul>` : html`<p className="muted">Aucun événement à venir.</p>`}</div></div>
  </section>`;
}

/* ---------- Paramètres, profil, journal d'audit ---------- */
const SETTINGS_FIELDS = [{ k: 'ecole', l: 'Nom de l’établissement', req: true, w: 'full' }, { k: 'slogan', l: 'Devise de l’école', w: 'full' }, { k: 'adresse', l: 'Adresse', w: 'full' }, { k: 'tel', l: 'Téléphone' }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'annee', l: 'Année scolaire', req: true, ph: '2026-2027', check: v => /^\d{4}-\d{4}$/.test(v) ? '' : 'Format attendu : 2026-2027' }, { k: 'responsable', l: 'Directeur ou directrice' }, { k: 'devise', l: 'Devise monétaire', req: true }, { k: 'notePassage', l: 'Note de passage (sur 20)', t: 'num', min: 0, max: 20, step: 0.5, req: true }];
function SettingsPage() {
  const app = useApp(); const { db, save, notify, resetDemo, ask } = app, [v, setV] = useState({ ...(db.settings[0] || { id: 'main', noteMax: 20 }) }), [err, setErr] = useState({}), [per, setPer] = useState(false);
  const submit = async e => { e.preventDefault(); const er = validateFields(SETTINGS_FIELDS, v, db); setErr(er); if (Object.keys(er).length) return; await save('settings', { ...v, id: v.id || 'main' }); notify('Paramètres enregistrés'); };
  const reset = async () => { const ok = await ask({ title: 'Réinitialiser la démonstration ?', message: 'Toutes les modifications faites dans cette démonstration seront perdues et les données d’exemple reviendront.', submit: 'Réinitialiser', danger: true }); if (ok) { resetDemo(); notify('Données d’exemple restaurées'); } };
  return html`<section><${PageHead} title="Paramètres" sub="Identité de l’établissement, année scolaire et règles de notation." />
    <form className="card" onSubmit=${submit}><h2 className="card-title">Établissement</h2><${FormFields} fields=${SETTINGS_FIELDS} values=${v} set=${(k, x) => setV(p => ({ ...p, [k]: x }))} db=${db} errors=${err} /><div className="form-foot"><${Btn} tone="primary" onClick=${submit}>Enregistrer<//></div></form>
    <div className="card"><h2 className="card-title">Périodes de la journée</h2><p className="muted">${db.periods.length} périodes définies, dont ${db.periods.filter(p => p.pause).length} pause(s).</p><${Btn} icon="clock" onClick=${() => setPer(true)}>Modifier les périodes<//></div>
    ${IN_GAS && db.students.length === 0 && db.classes.length === 0 && html`<div className="card"><h2 className="card-title">Données d’exemple</h2><p className="muted">La base est vide. Vous pouvez y charger une école fictive (5 classes, 30 élèves, notes, paiements) pour essayer l’application, puis la remplacer par vos vraies données.</p><${Btn} icon="plus" onClick=${async () => { const ok = await ask({ title: 'Charger les données d’exemple ?', message: 'Les données fictives seront ajoutées à votre feuille Google Sheets.', submit: 'Charger' }); if (!ok) return; try { const n = await Api.importAll(buildSeed()); notify(n + ' lignes importées'); setTimeout(() => location.reload(), 900); } catch (e) { notify(e.message, 'bad'); } }}>Charger les données d’exemple<//></div>`}
    ${!IN_GAS && html`<div className="card"><h2 className="card-title">Démonstration</h2><p className="muted">Les données de cette démonstration sont gardées dans votre navigateur. Sur Google Apps Script, elles sont stockées dans votre feuille Google Sheets.</p><${Btn} tone="danger" onClick=${reset}>Réinitialiser les données d’exemple<//></div>`}
    ${per && html`<${PeriodsEditor} onClose=${() => setPer(false)} />`}</section>`;
}
function ProfilePage() {
  const app = useApp(); const { db, me, save, notify } = app, rec = db.users.find(u => u.id === me.id) || me;
  const F_ = [{ k: 'nom', l: 'Nom complet', req: true }, { k: 'tel', l: 'Téléphone', t: 'tel', check: PHONE }];
  const [v, setV] = useState({ nom: rec.nom, tel: rec.tel || '' }), [err, setErr] = useState({});
  const linked = me.role === 'enseignant' ? db.teachers.find(t => t.id === me.linkId) : me.role === 'eleve' ? db.students.find(s => s.id === me.linkId) : me.role === 'parent' ? db.parents.find(p => p.id === me.linkId) : null;
  const submit = async e => { e.preventDefault(); const er = validateFields(F_, v, db); setErr(er); if (Object.keys(er).length) return; await save('users', { ...rec, ...v }); notify('Profil mis à jour'); };
  return html`<section><${PageHead} title="Mon profil" sub="Vos informations personnelles et votre rôle dans l’application." />
    <div className="grid2"><form className="card" onSubmit=${submit}><h2 className="card-title">Modifier mes informations</h2><${FormFields} fields=${F_} values=${v} set=${(k, x) => setV(p => ({ ...p, [k]: x }))} db=${db} errors=${err} /><div className="form-foot"><${Btn} tone="primary" onClick=${submit}>Enregistrer<//></div></form>
      <div className="card"><h2 className="card-title">Compte</h2><ul className="facts"><li><span>Adresse</span><strong>${rec.email}</strong></li><li><span>Rôle</span><strong>${B('accent', ROLE_LABEL[me.role])}</strong></li>${linked && html`<li><span>Fiche liée</span><strong>${fullName(linked)}</strong></li>`}${linked && linked.matricule && html`<li><span>Matricule</span><strong className="mono">${linked.matricule}</strong></li>`}${linked && linked.admission && html`<li><span>N° d’admission</span><strong className="mono">${linked.admission}</strong></li>`}</ul></div></div>
    ${IN_GAS && html`<div className="card"><h2 className="card-title">Mot de passe</h2><p className="muted">Choisissez un mot de passe que vous n’utilisez nulle part ailleurs.</p><${Btn} icon="shield" onClick=${async () => { const x = await app.ask({ title: 'Changer mon mot de passe', fields: [{ k: 'a', l: 'Mot de passe actuel', t: 'password', req: true }, { k: 'b', l: 'Nouveau mot de passe', t: 'password', req: true, hint: '8 caractères minimum.', check: y => y && y.length < 8 ? 'Au moins 8 caractères' : '' }], submit: 'Changer' }); if (!x) return; try { await Api.changePassword(x.a, x.b); notify('Mot de passe modifié'); } catch (e) { notify(e.message, 'bad'); } }}>Changer mon mot de passe<//></div>`}</section>`;
}
const TLAB = { payments: 'Encaissements', students: 'Élèves', parents: 'Parents', notices: 'Avis', marks: 'Notes', attendance: 'Présences', timetable: 'Emploi du temps', users: 'Utilisateurs', exams: 'Examens', tickets: 'Assistance', settings: 'Paramètres' };
function AuditPage() {
  const { db } = useApp(); const rows = [...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  return html`<section><${PageHead} title="Journal d’audit" sub="Qui a créé, modifié ou supprimé quoi, et quand. Les 300 dernières actions." />
    <div className="card flush">${rows.length ? html`<div className="tablewrap"><table className="t"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Module</th><th>Détail</th></tr></thead><tbody>${rows.map(a => html`<tr key=${a.id}><td className="mono">${fmtDT(a.at)}</td><td>${a.user}</td><td>${B(a.action === 'supprimé' ? 'bad' : a.action === 'créé' ? 'ok' : 'info', a.action)}</td><td>${TLAB[a.table] || a.table}</td><td>${a.detail}</td></tr>`)}</tbody></table></div>` : html`<${Empty} icon="shield" title="Journal vide">Les actions apparaîtront ici dès la première modification.<//>`}</div></section>`;
}
