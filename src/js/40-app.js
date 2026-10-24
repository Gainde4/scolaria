/* ===== Scolaria : application (navigation, rôles, état global) ===== */
const ALL = ['admin', 'secretaire', 'surveillant', 'enseignant', 'eleve', 'parent'];
const STAFF = ['admin', 'secretaire', 'surveillant', 'enseignant'];
const PERM = {
  dashboard: { v: STAFF }, home: { v: ['eleve', 'parent'] },
  admissions: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  students: { v: STAFF, e: ['admin', 'secretaire'] },
  parents: { v: ['admin', 'secretaire', 'surveillant'], e: ['admin', 'secretaire'] },
  conduct: { v: STAFF, e: ['admin', 'surveillant', 'enseignant'] },
  activities: { v: STAFF, e: ['admin', 'secretaire', 'surveillant'] },
  documents: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  ptm: { v: ['admin', 'secretaire', 'enseignant', 'parent'], e: ['admin', 'secretaire', 'enseignant'] },
  classes: { v: STAFF, e: ['admin', 'secretaire'] },
  subjects: { v: STAFF, e: ['admin'] },
  assignments: { v: ['admin', 'secretaire', 'enseignant'], e: ['admin', 'secretaire'] },
  timetable: { v: ALL, e: ['admin', 'secretaire'] },
  lessons: { v: ['admin', 'enseignant'], e: ['admin', 'enseignant'] },
  logbook: { v: STAFF, e: ['admin', 'enseignant'] },
  substitutes: { v: STAFF, e: ['admin', 'secretaire', 'surveillant'] },
  attendance: { v: STAFF, e: ['admin', 'surveillant', 'enseignant'] },
  exams: { v: ['admin', 'secretaire', 'enseignant'], e: ['admin', 'secretaire'] },
  marks: { v: ['admin', 'enseignant'], e: ['admin', 'enseignant'] },
  results: { v: ALL },
  halltickets: { v: ['admin', 'secretaire'] },
  teachers: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  users: { v: ['admin'], e: ['admin'] },
  feeStructure: { v: ['admin', 'secretaire'], e: ['admin'] },
  payments: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  dues: { v: ['admin', 'secretaire', 'parent'] },
  cash: { v: ['admin', 'secretaire'] },
  notices: { v: ALL, e: ['admin', 'secretaire'] },
  events: { v: ALL, e: ['admin', 'secretaire'] },
  complaints: { v: ALL, e: ['admin'] },
  tickets: { v: STAFF, e: STAFF },
  assets: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  maintenance: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  stock: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  stockTx: { v: ['admin', 'secretaire'], e: ['admin', 'secretaire'] },
  reports: { v: ['admin', 'secretaire'], e: ['admin'] },
  audit: { v: ['admin'] }, settings: { v: ['admin'], e: ['admin'] }, profile: { v: ALL, e: ALL }
};
const crud = k => function CrudView() { return html`<${CrudPage} cfg=${CFG[k]} />`; };
const PAGES = {
  dashboard: Dashboard, home: FamilyHome, results: ResultsPage, marks: MarksPage, attendance: AttendancePage, timetable: TimetablePage, halltickets: HallTicketsPage,
  dues: DuesPage, cash: CashPage, reports: ReportsPage, complaints: ComplaintsPage, settings: SettingsPage, profile: ProfilePage, audit: AuditPage
};
['students', 'parents', 'admissions', 'classes', 'subjects', 'teachers', 'assignments', 'users', 'exams', 'lessons', 'logbook', 'substitutes', 'conduct', 'activities', 'ptm', 'notices', 'events', 'tickets', 'documents', 'assets', 'maintenance', 'stock', 'stockTx', 'feeStructure', 'payments'].forEach(k => { PAGES[k] = crud(k); });
const NAV = [
  ['Pilotage', [['dashboard', 'Tableau de bord', 'dash'], ['home', 'Mon espace', 'dash']]],
  ['Élèves et familles', [['admissions', 'Admissions', 'clip'], ['students', 'Élèves', 'users'], ['parents', 'Parents', 'users'], ['conduct', 'Conduite', 'shield'], ['activities', 'Activités', 'award'], ['documents', 'Documents', 'file'], ['ptm', 'Rencontres parents', 'cal']]],
  ['Enseignement', [['timetable', 'Emploi du temps', 'clock'], ['classes', 'Classes', 'school'], ['subjects', 'Matières', 'book'], ['assignments', 'Affectations', 'swap'], ['lessons', 'Plan de cours', 'book'], ['logbook', 'Cahier de textes', 'book'], ['substitutes', 'Remplacements', 'swap']]],
  ['Évaluations', [['attendance', 'Présences', 'check'], ['exams', 'Examens', 'clip'], ['marks', 'Notes', 'edit'], ['results', 'Résultats', 'chart'], ['halltickets', 'Convocations', 'file']]],
  ['Personnel', [['teachers', 'Enseignants', 'user'], ['users', 'Utilisateurs et rôles', 'shield']]],
  ['Finances', [['payments', 'Encaissement', 'receipt'], ['dues', 'Mensualités', 'cash'], ['cash', 'Caisse du jour', 'cash'], ['feeStructure', 'Frais de scolarité', 'sliders']]],
  ['Communication', [['notices', 'Avis', 'bell'], ['events', 'Calendrier', 'cal'], ['complaints', 'Plaintes anonymes', 'shield'], ['tickets', 'Assistance', 'help']]],
  ['Patrimoine', [['assets', 'Équipements', 'tool'], ['maintenance', 'Maintenance', 'tool'], ['stock', 'Stock', 'box'], ['stockTx', 'Mouvements', 'swap']]],
  ['Système', [['reports', 'Rapports de classe', 'chart'], ['audit', 'Journal d’audit', 'shield'], ['settings', 'Paramètres', 'sliders'], ['profile', 'Mon profil', 'user']]]
];
const MODULE_COUNT = NAV.reduce((a, g) => a + g[1].length, 0) - 1;  /* « Mon espace » remplace le tableau de bord pour les familles */
const TITLES = Object.fromEntries(NAV.flatMap(g => g[1].map(m => [m[0], m[1]])));
const can_ = (role, k, kind) => { const p = PERM[k]; if (!p) return false; return ((kind === 'edit' ? p.e : p.v) || []).includes(role); };
const home_ = role => role === 'eleve' || role === 'parent' ? 'home' : 'dashboard';

function Toasts({ list }) {
  return html`<div className="toasts" aria-live="polite">${list.map(t => html`<div key=${t.id} className=${'toast ' + (t.tone || '')} role="status">${t.msg}</div>`)}</div>`;
}

function LoginScreen({ info, onDone }) {
  const first = !info.hasUsers;
  const [v, setV] = useState({ email: '', nom: '', pwd: '', pwd2: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) { setErr('Saisissez une adresse e-mail valide.'); return; }
    if (first) { if (!v.nom.trim()) { setErr('Indiquez votre nom.'); return; } if (v.pwd.length < 8) { setErr('Le mot de passe doit contenir au moins 8 caractères.'); return; } if (v.pwd !== v.pwd2) { setErr('Les deux mots de passe ne correspondent pas.'); return; } }
    else if (!v.pwd) { setErr('Saisissez votre mot de passe.'); return; }
    setBusy(true);
    try { if (first) await Api.setup(v.email, v.nom, v.pwd); else await Api.login(v.email, v.pwd); onDone(); } catch (x) { setErr(x.message || String(x)); setBusy(false); }
  };
  return html`<div className="boot"><form className="boot-card login" onSubmit=${submit}>
    <div className="logo-mark">S</div><strong>${first ? 'Créer le compte de la direction' : 'Scolaria'}</strong>
    <p className="muted">${first ? 'Première utilisation : ce compte administrateur gérera les autres utilisateurs.' : (info.school || 'Connectez-vous pour accéder à la gestion de l’école.')}</p>
    ${first && html`<div className="field"><label htmlFor="lg-nom">Nom complet</label><input id="lg-nom" autoComplete="name" value=${v.nom} onChange=${set('nom')} /></div>`}
    <div className="field"><label htmlFor="lg-email">Adresse e-mail</label><input id="lg-email" type="email" autoComplete="username" value=${v.email} onChange=${set('email')} /></div>
    <div className="field"><label htmlFor="lg-pwd">Mot de passe</label><input id="lg-pwd" type="password" autoComplete=${first ? 'new-password' : 'current-password'} value=${v.pwd} onChange=${set('pwd')} /></div>
    ${first && html`<div className="field"><label htmlFor="lg-pwd2">Confirmer le mot de passe</label><input id="lg-pwd2" type="password" autoComplete="new-password" value=${v.pwd2} onChange=${set('pwd2')} /></div>`}
    ${err && html`<p className="form-err" role="alert">${err}</p>`}
    <${Btn} tone="primary" type="submit" disabled=${busy}>${busy ? 'Connexion…' : first ? 'Créer le compte' : 'Se connecter'}<//>
  </form></div>`;
}

function App() {
  const [boot, setBoot] = useState('loading'), [bootErr, setBootErr] = useState('');
  const [db, setDb] = useState(null), [me, setMe] = useState(null), [page, setPage] = useState(''), [dlg, setDlg] = useState(null), [toasts, setToasts] = useState([]), [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('scolaria-theme') || ''; } catch (e) { return ''; } });
  const first = useRef(true), dbRef = useRef(null);
  dbRef.current = db;

  useEffect(() => {
    const el = document.documentElement; if (theme) el.setAttribute('data-theme', theme); else el.removeAttribute('data-theme');
    try { if (theme) localStorage.setItem('scolaria-theme', theme); else localStorage.removeItem('scolaria-theme'); } catch (e) { /* ignore */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [loginInfo, setLoginInfo] = useState({ hasUsers: true, school: '' });
  const enter = r => {
    setDb(r.db); setMe(r.me);
    setPage(home_(r.me.role)); setBoot('ok');
  };
  const toLogin = () => Api.status().then(i => { setLoginInfo(i); setBoot('login'); }).catch(e => { setBootErr(e.message || String(e)); setBoot('error'); });
  const load = useCallback(() => {
    setBoot('loading');
    if (IN_GAS && !Api.hasToken()) { toLogin(); return; }
    Api.load().then(r => { if (!r.me) { setDb(r.db); setBoot('denied'); return; } enter(r); })
      .catch(e => { if (IN_GAS && isAuthErr(e)) { setToken(''); toLogin(); return; } setBootErr(e.message || String(e)); setBoot('error'); });
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
  const fail = e => { if (isAuthErr(e)) { setToken(''); notify('Votre session a expiré. Reconnectez-vous.', 'bad'); load(); return; } notify('Enregistrement impossible : ' + (e.message || e), 'bad'); load(); };
  const logout = async () => { await Api.logout(); setMe(null); setDb(null); load(); };

  const save = useCallback(async (table, row) => {
    const isNew = !row.id, r = normRow(table, { ...row, id: row.id || (table === 'settings' ? 'main' : uid()) });
    commit(prev => { const exist = prev[table].some(x => x.id === r.id); const next = { ...prev, [table]: exist ? prev[table].map(x => x.id === r.id ? r : x) : [...prev[table], r] }; if (!IN_GAS && table !== 'audit') next.audit = [...prev.audit, audit(isNew ? 'créé' : 'modifié', table, r.id, r.recu || r.nom || r.titre || r.session || '')]; return next; });
    if (IN_GAS) { try { await Api.save(table, r); } catch (e) { fail(e); } }
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
  const resetDemo = () => { lsClear(); first.current = true; Api.load(me.role).then(r => { setDb(r.db); setMe(r.db.users.find(u => u.role === me.role)); }); };
  const switchRole = role => { const u = db.users.find(x => x.role === role); if (!u) return; setMe(u); go(home_(role)); };

  if (boot === 'loading') return html`<div className="boot"><div className="boot-card"><div className="logo-mark">S</div><strong>Scolaria</strong><span className="muted">Chargement des données…</span><div className="loadbar"><i></i></div></div></div>`;
  if (boot === 'login') return html`<${LoginScreen} info=${loginInfo} onDone=${load} />`;
  if (boot === 'error') return html`<div className="boot"><div className="boot-card"><strong>Impossible de charger les données</strong><p className="muted">${bootErr}</p><${Btn} tone="primary" onClick=${load}>Réessayer<//></div></div>`;
  if (boot === 'denied') return html`<div className="boot"><div className="boot-card"><div className="logo-mark">S</div><strong>Accès non autorisé</strong><p className="muted">Votre compte Google n’est associé à aucun utilisateur de l’école. Demandez à la direction de vous ajouter dans « Utilisateurs et rôles ».</p></div></div>`;

  const can = (k, kind = 'view') => can_(me.role, k, kind);
  const app = { db, me, can, go, save, saveMany, remove, ask, notify, resetDemo };
  const cur = PAGES[page] && can(page, 'view') ? page : home_(me.role), Page = PAGES[cur], st = db.settings[0] || {};
  const badge = {
    admissions: db.admissions.filter(a => a.statut === 'En attente').length, tickets: db.tickets.filter(t => t.statut === 'Ouvert').length,
    complaints: can('complaints', 'edit') ? db.complaints.filter(c => c.statut === 'Nouvelle').length : 0, stock: db.stock.filter(s => stockQty(db, s) <= s.seuil).length,
    ptm: me.role === 'parent' ? db.ptm.filter(r => r.statut === 'Libre').length : 0
  };
  const initials = (me.nom || '?').split(' ').map(w => w[0]).slice(0, 2).join('');

  return html`<${Ctx.Provider} value=${app}>
    <div className=${'shell' + (menu ? ' menu-open' : '')}>
      <aside className="side no-print" aria-label="Navigation principale">
        <div className="brand"><div className="logo-mark">S</div><div><strong>Scolaria</strong><small>${st.ecole}</small></div></div>
        <nav>${NAV.map(([g, items]) => { const vis = items.filter(([k]) => can(k, 'view')); return vis.length ? html`<div key=${g} className="grp"><h3>${g}</h3>${vis.map(([k, l, ic]) => html`<button type="button" key=${k} className=${'nav' + (cur === k ? ' on' : '')} aria-current=${cur === k ? 'page' : undefined} onClick=${() => go(k)}><${Icon} n=${ic} s=${17} /><span>${l}</span>${badge[k] > 0 && html`<b>${badge[k]}</b>`}</button>`)}</div>` : null; })}</nav>
        <div className="side-foot"><div className="avatar sm">${initials}</div><div className="grow"><strong>${me.nom}</strong><small>${ROLE_LABEL[me.role]}</small></div>${IN_GAS && html`<button type="button" className="icon-btn out" onClick=${logout} aria-label="Se déconnecter" title="Se déconnecter"><${Icon} n="x" s=${16} /></button>`}</div>
      </aside>
      <div className="scrim" onClick=${() => setMenu(false)}></div>
      <div className="main">
        <header className="top no-print">
          <button type="button" className="icon-btn menu-btn" onClick=${() => setMenu(!menu)} aria-label="Menu"><${Icon} n="menu" /></button>
          <div className="crumbs"><span className="muted">${st.ecole}</span><${Icon} n="chev" s=${13} /><strong>${TITLES[cur]}</strong></div>
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
