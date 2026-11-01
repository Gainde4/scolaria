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
