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
