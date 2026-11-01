/* ===== Scolaria : panneau d'administration (modules, autorisations, canaux) et messages ===== */
const CH_LABEL = { email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' };
const slug_ = l => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 20) || 'champ';
const CF_LABEL = { text: 'Texte court', area: 'Texte long', num: 'Nombre', date: 'Date', select: 'Liste de choix', bool: 'Case à cocher' };
const isLinkOk = u => /^(https:\/\/wa\.me\/\d+\?text=|sms:\+?\d+\?body=)/.test(u || '');
const modRowOf = (db, k) => ({ id: k, label: '', sub: '', actif: true, ordre: 0, champs: '', listes: '', options: '', ...(db.modules.find(x => x.id === k) || {}) });

/* ---------- Résultat d'un envoi (messages, rappels) ---------- */
function SendSummary({ r }) {
  return html`<div className="sendsum">
    <ul className="facts"><li><span>Messages préparés</span><strong className="mono">${r.total}</strong></li>
      ${r.destinataires !== undefined && html`<li><span>Destinataires</span><strong className="mono">${r.destinataires}</strong></li>`}
      <li><span>${r.simule ? 'Envoyés (simulation)' : 'Envoyés'}</span><strong className="mono">${r.envoyes}</strong></li>
      ${r.aEnvoyer > 0 && html`<li><span>À envoyer vous-même (liens ci-dessous)</span><strong className="mono">${r.aEnvoyer}</strong></li>`}
      ${r.echecs > 0 && html`<li><span>Échecs (détail dans « Journal des envois »)</span><strong className="mono due">${r.echecs}</strong></li>`}</ul>
    ${r.simule && html`<p className="muted">Démonstration : rien n’est réellement envoyé par e-mail ou par une passerelle. Sur Google Apps Script, les envois partent vraiment.</p>`}
    ${r.liens && r.liens.length > 0 && html`<h3 className="mini-title">Envoi manuel</h3><p className="muted">Ouvrez chaque lien depuis un téléphone ou un ordinateur où WhatsApp ou la messagerie SMS est installé : le message est déjà écrit.</p>
      <ul className="links">${r.liens.map(l => html`<li key=${l.id}><span>${l.nom} <small className="muted">${CH_LABEL[l.canal]}</small></span>${isLinkOk(l.lien) && html`<a className="btn sm" href=${l.lien} target="_blank" rel="noopener noreferrer">Ouvrir</a>`}</li>`)}</ul>`}
  </div>`;
}

/* ---------- Identifiants créés à l'admission ---------- */
function CredentialsView({ comptes }) {
  const [done, setDone] = useState(false);
  const text = comptes.filter(c => c.pwd).map(c => (c.role === 'eleve' ? 'Élève' : 'Parent') + ' ' + c.nom + ' — identifiant : ' + c.login + ' — mot de passe provisoire : ' + c.pwd).join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); } catch (e) { setDone(false); } };
  return html`<div className="creds">
    <p className="dlg-msg">Ces mots de passe provisoires ne seront <strong>plus jamais affichés</strong>. Chaque personne devra choisir son propre mot de passe à sa première connexion.</p>
    ${comptes.map((c, i) => html`<div key=${i} className="cred"><strong>${c.role === 'eleve' ? 'Compte élève' : 'Compte parent'} — ${c.nom}</strong>
      <dl><dt>Identifiant</dt><dd className="mono">${c.login || '—'}</dd>${c.pwd ? html`<dt>Mot de passe provisoire</dt><dd className="mono pwd">${c.pwd}</dd>` : html`<dt>Mot de passe</dt><dd>${c.nouveau === false ? 'Compte déjà existant : mot de passe inchangé.' : '—'}</dd>`}</dl>
      ${c.note && html`<small className="hint">${c.note}</small>`}</div>`)}
    ${text && html`<${Btn} icon="copy" onClick=${copy}>${done ? 'Copié ✓' : 'Copier les accès'}<//>`}</div>`;
}

/* ---------- Page « Modules » : activer, renommer, personnaliser ---------- */
function ModuleEditor({ m, onClose }) {
  const app = useApp(); const { db, save, notify } = app, row = modRowOf(db, m.k);
  const listKeys = Object.keys(LIST_DEFS).filter(k => LIST_DEFS[k].mod === m.k);
  const [label, setLabel] = useState(row.label || ''), [sub, setSub] = useState(row.sub || ''), [ordre, setOrdre] = useState(row.ordre || 0);
  const [defs, setDefs] = useState(customDefs_(db, m.k).map(d => ({ ...d, o: (d.o || []).join(', ') })));
  const [lists, setLists] = useState(Object.fromEntries(listKeys.map(k => [k, listOf_(db, k).join('\n')])));
  const [opt, setOpt] = useState(modOpt_(db, m.k)), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const upd = (i, p) => setDefs(d => d.map((x, j) => j === i ? { ...x, ...p } : x));
  const submit = async () => {
    setErr('');
    const keys = new Set(), out = [];
    for (const d of defs) {
      if (!String(d.l || '').trim()) { setErr('Chaque champ personnalisé doit avoir un libellé.'); return; }
      let k = d.k || slug_(d.l), base = k, n = 2; while (keys.has(k)) k = base.slice(0, 17) + '_' + (n++); keys.add(k);
      const o = d.t === 'select' ? String(d.o || '').split(',').map(x => x.trim()).filter(Boolean) : undefined;
      if (d.t === 'select' && !o.length) { setErr('Le champ « ' + d.l + ' » est une liste de choix : indiquez au moins un choix, séparés par des virgules.'); return; }
      out.push({ k, l: d.l.trim(), t: d.t, req: !!d.req, liste: !!d.liste, o });
    }
    const outLists = {}; listKeys.forEach(k => { const a = lists[k].split('\n').map(x => x.trim()).filter(Boolean); if (a.length && a.join('|') !== LIST_DEFS[k].def.join('|')) outLists[k] = a; });
    setBusy(true);
    try {
      await save('modules', { id: m.k, label: label.trim() === m.l ? '' : label.trim(), sub: sub.trim(), actif: row.actif, ordre: Number(ordre) || 0, champs: out.length ? JSON.stringify(out) : '', listes: Object.keys(outLists).length ? JSON.stringify(outLists) : '', options: (OPTION_DEFS[m.k] || []).length ? JSON.stringify(opt) : '' });
      notify('Module « ' + (label.trim() || m.l) + ' » enregistré'); onClose();
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  const foot = html`<span className="grow"></span><${Btn} onClick=${onClose}>Annuler<//><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer<//>`;
  return html`<${Modal} title=${'Personnaliser — ' + m.l} onClose=${onClose} wide foot=${foot}>
    <div className="editor">
      <section className="ed-sec"><h3>Apparence</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="me-label">Nom affiché dans le menu</label><input id="me-label" value=${label} placeholder=${m.l} onChange=${e => setLabel(e.target.value)} /></div>
          <div className="field"><label htmlFor="me-ordre">Position dans son groupe</label><input id="me-ordre" type="number" min="0" max="99" value=${ordre} onChange=${e => setOrdre(e.target.value)} /><small className="hint">1 = en premier. 0 = ordre habituel.</small></div>
          <div className="field full"><label htmlFor="me-sub">Description sous le titre</label><input id="me-sub" value=${sub} placeholder="Texte d’aide affiché en haut de la page" onChange=${e => setSub(e.target.value)} /></div>
        </div></section>
      ${m.custom && html`<section className="ed-sec"><h3>Champs personnalisés</h3>
        <p className="muted">Ajoutez les informations propres à votre école. Elles apparaissent dans le formulaire de ce module${m.k === 'admissions' ? ' et dans le formulaire d’inscription en ligne' : ''}, et dans la liste si vous le demandez. Elles sont enregistrées dans la colonne « extra » de la feuille.</p>
        ${defs.map((d, i) => html`<div key=${i} className="cf-row">
          <div className="field"><label htmlFor=${'cf-l-' + i}>Libellé</label><input id=${'cf-l-' + i} value=${d.l || ''} onChange=${e => upd(i, { l: e.target.value })} placeholder="Ex. École précédente" /></div>
          <div className="field"><label htmlFor=${'cf-t-' + i}>Type</label><select id=${'cf-t-' + i} value=${d.t} onChange=${e => upd(i, { t: e.target.value })}>${Object.keys(CF_LABEL).map(t => html`<option key=${t} value=${t}>${CF_LABEL[t]}</option>`)}</select></div>
          ${d.t === 'select' && html`<div className="field"><label htmlFor=${'cf-o-' + i}>Choix (séparés par des virgules)</label><input id=${'cf-o-' + i} value=${d.o || ''} onChange=${e => upd(i, { o: e.target.value })} placeholder="Bus, À pied" /></div>`}
          <div className="cf-flags"><label className="check"><input type="checkbox" checked=${!!d.req} onChange=${e => upd(i, { req: e.target.checked })} /> <span>Obligatoire</span></label><label className="check"><input type="checkbox" checked=${!!d.liste} onChange=${e => upd(i, { liste: e.target.checked })} /> <span>Dans la liste</span></label>
            <button type="button" className="icon-btn danger" aria-label=${'Retirer le champ ' + (d.l || i + 1)} title="Retirer" onClick=${() => setDefs(x => x.filter((_, j) => j !== i))}><${Icon} n="trash" s=${16} /></button></div>
        </div>`)}
        ${defs.length < 15 ? html`<${Btn} icon="plus" sm onClick=${() => setDefs(x => [...x, { k: '', l: '', t: 'text', req: false, liste: false, o: '' }])}>Ajouter un champ<//>` : html`<p className="muted">15 champs au maximum par module.</p>`}
        ${defs.length > 0 && html`<p className="hint">Retirer un champ le masque ; les valeurs déjà saisies restent dans la feuille jusqu’à la prochaine modification de chaque fiche.</p>`}</section>`}
      ${listKeys.length > 0 && html`<section className="ed-sec"><h3>Listes de choix</h3><p className="muted">Une valeur par ligne. Les valeurs déjà utilisées restent affichées même si vous les retirez de la liste.</p>
        ${listKeys.map(k => html`<div key=${k} className="field full"><label htmlFor=${'ls-' + k}>${LIST_DEFS[k].l}</label><textarea id=${'ls-' + k} rows="5" value=${lists[k]} onChange=${e => setLists(x => ({ ...x, [k]: e.target.value }))}></textarea><div><button type="button" className="linkbtn" onClick=${() => setLists(x => ({ ...x, [k]: LIST_DEFS[k].def.join('\n') }))}>Rétablir les valeurs d’origine</button></div></div>`)}</section>`}
      ${(OPTION_DEFS[m.k] || []).length > 0 && html`<section className="ed-sec"><h3>Réglages</h3>
        ${OPTION_DEFS[m.k].map(d => html`<div key=${d.k} className="field full">${d.t === 'bool' ? html`<label className="check"><input id=${'op-' + d.k} type="checkbox" checked=${!!opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.checked }))} /> <span>${d.l}</span></label>`
          : html`<label htmlFor=${'op-' + d.k}>${d.l}</label>${d.t === 'select' ? html`<select id=${'op-' + d.k} value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value }))}>${d.o.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>` : d.t === 'num' ? html`<input id=${'op-' + d.k} type="number" min=${d.min} max=${d.max} value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value === '' ? '' : Number(e.target.value) }))} />` : html`<textarea id=${'op-' + d.k} rows="2" value=${opt[d.k]} onChange=${e => setOpt(x => ({ ...x, [d.k]: e.target.value }))}></textarea>`}`}</div>`)}
        ${m.k === 'admissions' && opt.mode === 'auto' && html`<p className="form-err">Attention : en validation automatique, n’importe qui peut occuper des places dans vos classes et créer des comptes sans contrôle humain. À réserver aux établissements qui surveillent le journal d’audit.</p>`}</section>`}
      ${err && html`<p className="form-err" role="alert">${err}</p>`}
    </div></${Modal}>`;
}
function ModulesPage() {
  const app = useApp(); const { db, save, notify } = app, [edit, setEdit] = useState(null);
  const toggle = async m => {
    const row = modRowOf(db, m.k), next = !row.actif;
    if (!next) { const ok = await app.ask({ title: 'Désactiver « ' + (row.label || m.l) + ' » ?', message: 'Le module disparaît du menu pour tout le monde et ses données ne sont plus envoyées aux utilisateurs. Rien n’est supprimé : vous pouvez le réactiver à tout moment.' + (m.k === 'admissions' ? ' Le formulaire d’inscription en ligne sera fermé.' : ''), submit: 'Désactiver', danger: true }); if (!ok) return; }
    try { await save('modules', { ...row, actif: next }); notify('Module ' + (next ? 'activé' : 'désactivé')); } catch (e) { notify(e.message, 'bad'); }
  };
  const groups = GROUPS.map(g => [g, MODS.filter(m => m.g === g && !m.sys && !m.fixed)]).filter(x => x[1].length);
  return html`<section><${PageHead} title="Modules" sub="Activez, renommez et personnalisez chaque module : champs supplémentaires, listes de choix, réglages. Les droits d’accès se règlent dans « Autorisations »." >${html`<${Btn} icon="shield" onClick=${() => app.go('perms')}>Autorisations<//>`}<//>
    ${groups.map(([g, mods]) => html`<div key=${g} className="card flush"><h2 className="card-title pad">${g}</h2><div className="tablewrap"><table className="t stack"><thead><tr><th>Module</th><th>Personnalisation</th><th>État</th><th className="actions"><span className="sr">Actions</span></th></tr></thead><tbody>
      ${mods.map(m => { const row = modRowOf(db, m.k), n = customDefs_(db, m.k).length, lists = Object.keys(parseJson_(row.listes, {})).length;
    return html`<tr key=${m.k} className=${row.actif ? '' : 'off'}><td data-l="Module"><strong>${row.label || m.l}</strong>${row.label && row.label !== m.l && html` <small className="muted">(${m.l})</small>`}</td>
      <td data-l="Personnalisation">${n > 0 && B('info', n + ' champ' + (n > 1 ? 's' : ''))} ${lists > 0 && B('info', lists + ' liste' + (lists > 1 ? 's' : ''))} ${m.custom || Object.keys(LIST_DEFS).some(k => LIST_DEFS[k].mod === m.k) || OPTION_DEFS[m.k] ? '' : html`<span className="muted">Nom et position</span>`}${n === 0 && lists === 0 && (m.custom || OPTION_DEFS[m.k]) && html`<span className="muted">Standard</span>`}</td>
      <td data-l="État">${B(row.actif ? 'ok' : 'mute', row.actif ? 'Actif' : 'Désactivé')}</td>
      <td className="actions"><button type="button" className="icon-btn txt" aria-label=${(row.actif ? 'Désactiver ' : 'Activer ') + (row.label || m.l)} onClick=${() => toggle(m)}><span>${row.actif ? 'Désactiver' : 'Activer'}</span></button><button type="button" className="icon-btn txt" aria-label=${'Personnaliser ' + (row.label || m.l)} onClick=${() => setEdit(m)}><${Icon} n="sliders" s=${15} /><span>Personnaliser</span></button></td></tr>`; })}
    </tbody></table></div></div>`)}
    ${edit && html`<${ModuleEditor} m=${edit} onClose=${() => setEdit(null)} />`}</section>`;
}

/* ---------- Matrice d'autorisations ---------- */
const VERB_L = { v: 'Voir', c: 'Créer', m: 'Modifier', s: 'Supprimer' };
function PermsPage() {
  const app = useApp(); const { db, save, remove, ask, notify } = app, [busy, setBusy] = useState(false);
  const roles = ROLE_IDS.slice(1);
  const ov = (role, k) => db.perms.find(p => p.role === role && p.module === k);
  const eff = (role, m) => { const o = ov(role, m.k); return normRights_(m, o ? o.droits : defRights_(role, m.k)); };
  const flip = async (role, m, verb) => {
    const set = new Set(eff(role, m).split('')); if (set.has(verb)) { set.delete(verb); if (verb === 'v') set.clear(); } else { set.add(verb); set.add('v'); }
    const droits = 'vcms'.split('').filter(c => set.has(c)).join('');
    setBusy(true); try { await save('perms', { role, module: m.k, droits }); } catch (e) { notify(e.message, 'bad'); } setBusy(false);
  };
  const reset = async role => {
    const ids = db.perms.filter(p => p.role === role).map(p => p.id); if (!ids.length) { notify('Ce rôle utilise déjà les droits standard'); return; }
    const ok = await ask({ title: 'Rétablir les droits standard ?', message: 'Les ' + ids.length + ' réglage(s) personnalisés du rôle « ' + ROLE_LABEL[role] + ' » sont effacés ; ses droits redeviennent ceux d’origine.', submit: 'Rétablir', danger: true }); if (!ok) return;
    await remove('perms', ids); notify('Droits standard rétablis pour ' + ROLE_LABEL[role]);
  };
  const groups = GROUPS.map(g => [g, MODS.filter(m => m.g === g && !m.sys && !m.fixed)]).filter(x => x[1].length);
  const nMod = db.perms.length;
  return html`<section><${PageHead} title="Autorisations" sub="Qui peut voir, créer, modifier ou supprimer dans chaque module. Un clic sur une lettre active ou retire le droit.">${html`<${Btn} icon="sliders" onClick=${() => app.go('modules')}>Modules<//>`}<//>
    <div className="card"><div className="perm-legend">${Object.keys(VERB_L).map(v => html`<span key=${v}><i className="vchip on">${v.toUpperCase()}</i>${VERB_L[v]}</span>`)}<span><i className="vchip on diff">V</i>Réglage modifié</span></div>
      <p className="muted">La direction a toujours tous les droits. Chaque module a un plafond de sécurité : par exemple, les paiements et le barème ne peuvent être confiés qu’au secrétariat, et les familles ne peuvent jamais modifier de données. ${nMod > 0 ? nMod + ' réglage(s) personnalisé(s) en vigueur.' : 'Tous les rôles utilisent les droits standard.'}</p></div>
    <div className="card flush"><div className="tablewrap perm"><table className="t perm-t"><thead><tr><th>Module</th>${roles.map(r => html`<th key=${r} className="rolecol"><span>${ROLE_LABEL[r]}</span><button type="button" className="linkbtn" aria-label=${'Rétablir les droits standard : ' + ROLE_LABEL[r]} onClick=${() => reset(r)}>Rétablir</button></th>`)}</tr></thead>
      <tbody>${groups.map(([g, mods]) => html`<${Fragment} key=${g}><tr className="grp-row"><th colSpan=${roles.length + 1}>${g}</th></tr>${mods.map(m => {
    const row = modRowOf(db, m.k), label = row.label || m.l;
    return html`<tr key=${m.k} className=${row.actif ? '' : 'off'}><th scope="row">${label}${!row.actif && html` <small className="muted">(désactivé)</small>`}</th>${roles.map(r => {
      if (m.el.indexOf(r) < 0) return html`<td key=${r} className="na" title="Ce rôle ne peut pas recevoir de droits sur ce module">—</td>`;
      const cur = eff(r, m), changed = !!ov(r, m.k) && ov(r, m.k).droits !== normRights_(m, defRights_(r, m.k));
      return html`<td key=${r}><div className="vchips">${m.verbs.split('').map(v => { const on = cur.indexOf(v) >= 0; return html`<button type="button" key=${v} disabled=${busy} className=${'vchip' + (on ? ' on' : '') + (on && changed ? ' diff' : '')} aria-pressed=${on} aria-label=${ROLE_LABEL[r] + ' — ' + label + ' — ' + VERB_L[v]} title=${VERB_L[v]} onClick=${() => flip(r, m, v)}>${v.toUpperCase()}</button>`; })}</div></td>`;
    })}</tr>`;
  })}<//>`)}</tbody></table></div></div></section>`;
}

/* ---------- Canaux de communication ---------- */
const SAMPLE_VARS = () => ({ ecole: (APP_DB.settings[0] || {}).ecole || 'Votre école', parent: 'Fatou Ndiaye', nom: 'Fatou Ndiaye', eleve: 'Awa Ndiaye', ref: 'INS-2026-0001', identifiant: 'fatou@exemple.sn', classe: '6ème A', admission: 'ADM-2026-031', acces: '', montant: '22 000 F', nature: 'Mensualité Octobre', recu: 'REC-2026-0042', date: fmtDate(todayStr()), reste: '44 000 F' });
let APP_DB = { settings: [] };
const PROVIDER_HELP = {
  gmail: 'Les e-mails partent du compte Google qui a déployé l’application (Gmail). Limite journalière : environ 100 destinataires avec un compte Gmail gratuit, 1 500 avec Google Workspace.',
  lien: 'Aucun envoi automatique : l’application prépare le message et un lien (WhatsApp ou SMS) que vous ouvrez depuis un téléphone. Gratuit, mais manuel.',
  twilio: 'Envoi automatique par votre compte Twilio (payant à l’usage). Indiquez le numéro expéditeur (ex. +1…, ou « whatsapp:+14155238886 » pour le bac à sable WhatsApp, ou l’identifiant d’un service de messagerie MG… pour les SMS). Pour WhatsApp, un message à un parent qui n’a pas écrit à l’école depuis 24 h doit utiliser un modèle approuvé par WhatsApp : sinon Twilio refuse l’envoi.',
  webhook: 'Chaque message est envoyé en JSON { canal, to, nom, texte, event } à une adresse https que vous contrôlez (passerelle SMS locale, opérateur, Make, Zapier…). Un secret facultatif est transmis dans l’en-tête X-Scolaria-Secret.'
};
function ChannelCard({ c, status, onStatus }) {
  const app = useApp(); const { db, save, notify } = app, cur = chanOf_(db, c), def = CHANNEL_DEFS[c];
  const [actif, setActif] = useState(cur.actif), [prov, setProv] = useState(cur.fournisseur), [exp, setExp] = useState(cur.expediteur || ''), [from, setFrom] = useState(cur.options.from || ''), [sec, setSec] = useState({}), [to, setTo] = useState(''), [busy, setBusy] = useState(false);
  const names = (def.secrets || {})[prov] || [], has = (status[c] || {});
  const submit = async () => {
    setBusy(true);
    try { await save('channels', { id: c, actif, fournisseur: prov, expediteur: c === 'email' ? exp : '', options: prov === 'twilio' && from.trim() ? JSON.stringify({ from: from.trim() }) : '' }); notify(def.l + ' : réglages enregistrés'); } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  const saveSecret = async n => {
    if (!IN_GAS) { notify('Démonstration : les clés ne sont enregistrées que sur Google Apps Script.', 'bad'); return; }
    try { await Api.setSecret(c, n, sec[n] || ''); setSec(x => ({ ...x, [n]: '' })); notify(sec[n] ? 'Clé enregistrée (stockée hors de la feuille)' : 'Clé effacée'); onStatus(); } catch (e) { notify(e.message, 'bad'); }
  };
  const test = async () => {
    setBusy(true);
    try {
      if (!IN_GAS) notify('Démonstration : aucun message réel n’est envoyé.');
      else { const r = await Api.testChannel(c, to); notify(r.statut === 'Envoyé' ? 'Message d’essai envoyé' : r.statut === 'À envoyer' ? 'Lien d’essai prêt dans le journal des envois' : 'Échec : ' + r.detail, r.statut === 'Échec' ? 'bad' : ''); await app.reload(); }
    } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  return html`<article className="card ch-card" id=${'ch-' + c}><header><h2 className="card-title">${def.l}</h2><label className="check"><input type="checkbox" id=${'ch-actif-' + c} checked=${actif} onChange=${e => setActif(e.target.checked)} /> <span>Activé</span></label></header>
    <div className="form-grid">
      <div className="field"><label htmlFor=${'ch-prov-' + c}>Fournisseur</label><select id=${'ch-prov-' + c} value=${prov} onChange=${e => setProv(e.target.value)}>${def.providers.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>
      ${c === 'email' && html`<div className="field"><label htmlFor="ch-exp-email">Nom de l’expéditeur</label><input id="ch-exp-email" value=${exp} placeholder="Nom de l’école" onChange=${e => setExp(e.target.value)} /></div>`}
      ${prov === 'twilio' && html`<div className="field"><label htmlFor=${'ch-from-' + c}>Numéro ou service expéditeur</label><input id=${'ch-from-' + c} value=${from} placeholder=${c === 'whatsapp' ? 'whatsapp:+14155238886' : '+12025550123 ou MG…'} onChange=${e => setFrom(e.target.value)} /></div>`}
    </div>
    <p className="muted small">${PROVIDER_HELP[prov]}${c === 'email' && status.quota >= 0 ? ' Envois restants aujourd’hui : ' + status.quota + '.' : ''}</p>
    ${names.length > 0 && html`<div className="secrets"><h3 className="mini-title">Clés d’accès</h3><p className="muted small">Gardées dans les propriétés protégées du script, jamais dans la feuille. Une fois enregistrée, une clé ne s’affiche plus ; pour la remplacer, saisissez la nouvelle.</p>
      ${names.map(n => html`<div key=${n} className="secret-row"><div className="field"><label htmlFor=${'sec-' + c + '-' + n}>${SECRET_LABELS[n]}</label><input id=${'sec-' + c + '-' + n} type="password" autoComplete="off" value=${sec[n] || ''} placeholder=${has[n] ? '•••••••• (enregistrée)' : 'Non renseignée'} onChange=${e => setSec(x => ({ ...x, [n]: e.target.value }))} /></div>
        <${Btn} sm onClick=${() => saveSecret(n)}>${sec[n] ? 'Enregistrer' : has[n] ? 'Effacer' : 'Enregistrer'}<//>${has[n] && B('ok', 'Enregistrée')}</div>`)}</div>`}
    <div className="form-foot split"><div className="inline-test"><label className="sr" htmlFor=${'ch-test-' + c}>Destinataire de l’essai</label><input id=${'ch-test-' + c} value=${to} placeholder=${c === 'email' ? 'votre e-mail (vide = le vôtre)' : 'numéro, ex. 77 123 45 67'} onChange=${e => setTo(e.target.value)} /><${Btn} sm disabled=${busy} onClick=${test}>Envoyer un essai<//></div><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer ${def.l}<//></div></article>`;
}
function TemplateCard({ ev }) {
  const app = useApp(); const { db, save, remove, notify } = app, d = EVENTS[ev], cur = tplOf_(db, ev), custom = !!db.templates.find(x => x.id === ev);
  const [v, setV] = useState({ actif: cur.actif, email: cur.email, sms: cur.sms, whatsapp: cur.whatsapp, sujet: cur.sujet, texte: cur.texte }), [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await save('templates', { id: ev, ...v }); notify('Message « ' + d.l + ' » enregistré'); } catch (e) { notify(e.message, 'bad'); } setBusy(false); };
  const back = async () => { setV({ actif: d.def.actif, email: d.def.email, sms: d.def.sms, whatsapp: d.def.whatsapp, sujet: d.def.sujet, texte: d.def.texte }); if (custom) await remove('templates', [ev]); notify('Modèle d’origine rétabli'); };
  const chk = k => html`<label className="check"><input type="checkbox" id=${'tp-' + ev + '-' + k} checked=${!!v[k]} onChange=${e => setV({ ...v, [k]: e.target.checked })} /> <span>${CH_LABEL[k]}</span></label>`;
  return html`<article className="card tpl-card" id=${'tp-' + ev}><header><h3 className="card-title">${d.l}</h3><label className="check"><input type="checkbox" id=${'tp-' + ev + '-actif'} checked=${!!v.actif} onChange=${e => setV({ ...v, actif: e.target.checked })} /> <span>Envoi automatique</span></label></header>
    <div className="tpl-ch">${['email', 'sms', 'whatsapp'].map(k => html`<${Fragment} key=${k}>${chk(k)}<//>`)}</div>
    ${v.email && html`<div className="field"><label htmlFor=${'tp-' + ev + '-sujet'}>Objet de l’e-mail</label><input id=${'tp-' + ev + '-sujet'} value=${v.sujet} onChange=${e => setV({ ...v, sujet: e.target.value })} /></div>`}
    <div className="field"><label htmlFor=${'tp-' + ev + '-texte'}>Texte du message</label><textarea id=${'tp-' + ev + '-texte'} rows="4" value=${v.texte} onChange=${e => setV({ ...v, texte: e.target.value })}></textarea><small className="hint">Variables : ${d.vars.split(', ').map(x => '{' + x + '}').join(' ')}</small></div>
    <div className="preview"><small className="muted">Aperçu</small><p>${renderTpl_(v.texte, SAMPLE_VARS())}</p></div>
    <div className="form-foot split"><button type="button" className="linkbtn" onClick=${back}>Rétablir le modèle d’origine</button><${Btn} tone="primary" disabled=${busy} onClick=${submit}>Enregistrer<//></div></article>`;
}
function ChannelsPage() {
  const app = useApp(); const { db } = app; APP_DB = db;
  const [status, setStatus] = useState({ quota: -1 });
  const refresh = useCallback(() => { if (IN_GAS) Api.secretsStatus().then(setStatus).catch(() => { /* réservé à la direction */ }); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return html`<section><${PageHead} title="Canaux de communication" sub="E-mail, SMS et WhatsApp : fournisseur, clés d’accès et messages automatiques envoyés aux familles." />
    <div className="card note-info"><${Icon} n="send" s=${20} /><div><strong>Chaque famille garde la main.</strong><p className="muted">Depuis son profil, chacun choisit les moyens par lesquels l’école peut le joindre. Les messages ne partent que par les canaux activés ici ET acceptés par le destinataire. Vous pouvez aussi écrire à tout le monde depuis « Envoyer un message ».</p></div></div>
    ${!IN_GAS && html`<div className="card note-info"><${Icon} n="alert" s=${20} /><div><strong>Démonstration</strong><p className="muted">Les réglages sont enregistrés dans ce navigateur, mais aucun message réel n’est envoyé et les clés d’accès ne sont pas conservées.</p></div></div>`}
    <div className="chgrid">${CH_ALL.map(c => html`<${ChannelCard} key=${c + db.channels.length} c=${c} status=${status} onStatus=${refresh} />`)}</div>
    <h2 className="sec-title">Messages automatiques</h2>
    <div className="tplgrid">${Object.keys(EVENTS).filter(e => !EVENTS[e].hidden).map(e => html`<${TemplateCard} key=${e} ev=${e} />`)}</div></section>`;
}

/* ---------- Envoyer un message ---------- */
const AUDIENCES = [['classe', 'Les parents d’une classe'], ['parents', 'Tous les parents'], ['enseignants', 'Les enseignants'], ['personnel', 'Enseignants et personnel']];
function MessagesPage() {
  const app = useApp(); const { db, notify, ask } = app, active = CH_ALL.filter(c => chanOf_(db, c).actif);
  const [aud, setAud] = useState('classe'), [cid, setCid] = useState((sortedClasses(db)[0] || {}).id || ''), [canaux, setCanaux] = useState(active), [sujet, setSujet] = useState(''), [texte, setTexte] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null);
  const spec = { audience: aud, classId: cid, canaux, sujet, texte };
  let est = null; try { est = texte.trim() && canaux.length ? broadcastPlan_(db, spec).plan.length : null; } catch (e) { est = null; }
  const toggle = c => setCanaux(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c]);
  const send = async () => {
    if (!canaux.length) { notify('Choisissez au moins un canal', 'bad'); return; }
    if (!texte.trim()) { notify('Écrivez le message', 'bad'); return; }
    const ok = await ask({ title: 'Envoyer ce message ?', message: (est !== null ? 'Environ ' + est + ' message(s) vont être préparés' : 'Le message va être préparé') + ' (' + canaux.map(c => CH_LABEL[c]).join(', ') + '). Les destinataires qui n’acceptent pas un canal sont ignorés pour ce canal.', submit: 'Envoyer' }); if (!ok) return;
    setBusy(true); setRes(null);
    try { setRes(await app.broadcast(spec)); notify('Message traité'); } catch (e) { notify(e.message, 'bad'); }
    setBusy(false);
  };
  return html`<section><${PageHead} title="Envoyer un message" sub="Écrivez une fois, l’école l’envoie par e-mail, SMS ou WhatsApp selon les canaux activés et les préférences de chaque famille.">${app.can('outbox', 'view') && html`<${Btn} icon="mail" onClick=${() => app.go('outbox')}>Journal des envois<//>`}<//>
    ${!active.length ? html`<${Empty} icon="send" title="Aucun canal activé">La direction peut activer l’e-mail, les SMS ou WhatsApp dans « Canaux de communication ».<//>` : html`<div className="card"><div className="form-grid">
      <div className="field"><label htmlFor="ms-aud">Destinataires</label><select id="ms-aud" value=${aud} onChange=${e => setAud(e.target.value)}>${AUDIENCES.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>
      ${aud === 'classe' && html`<${ClassSelect} id="ms-class" classes=${sortedClasses(db)} value=${cid} onChange=${setCid} />`}
      <fieldset className="field full prefs"><legend>Canaux</legend>${CH_ALL.map(c => { const ch = chanOf_(db, c); return html`<label key=${c} className="check"><input type="checkbox" id=${'ms-ch-' + c} disabled=${!ch.actif} checked=${canaux.includes(c) && ch.actif} onChange=${() => toggle(c)} /> <span>${CH_LABEL[c]}${!ch.actif ? ' (désactivé)' : ch.fournisseur === 'lien' && c !== 'email' ? ' — liens manuels' : ''}</span></label>`; })}</fieldset>
      ${canaux.includes('email') && html`<div className="field full"><label htmlFor="ms-sujet">Objet de l’e-mail</label><input id="ms-sujet" value=${sujet} placeholder=${'Message de ' + ((db.settings[0] || {}).ecole || 'l’école')} onChange=${e => setSujet(e.target.value)} /></div>`}
      <div className="field full"><label htmlFor="ms-texte">Message</label><textarea id="ms-texte" rows="5" maxLength="600" value=${texte} onChange=${e => setTexte(e.target.value)}></textarea><small className="hint">${texte.length} / 600 caractères.${canaux.includes('sms') && texte.length > 160 ? ' Au-delà de 160 caractères, un SMS est facturé comme plusieurs messages.' : ''}${est !== null ? ' Environ ' + est + ' message(s) seront préparés.' : ''}</small></div>
    </div><div className="form-foot"><${Btn} tone="primary" icon="send" disabled=${busy} onClick=${send}>${busy ? 'Envoi…' : 'Envoyer'}<//></div></div>`}
    ${res && html`<div className="card" id="ms-result"><h2 className="card-title">Résultat</h2><${SendSummary} r=${res} /></div>`}</section>`;
}

/* ---------- Journal des envois ---------- */
const ST_TONE = { 'Envoyé': 'ok', 'Envoyé (manuel)': 'ok', 'Simulé': 'info', 'À envoyer': 'warn', 'Échec': 'bad', 'Non envoyé': 'bad' };
CFG.outbox = {
  key: 'outbox', icon: 'mail', title: 'Journal des envois', sub: 'Tous les messages préparés ou envoyés par l’école. Les mots de passe et clés n’y apparaissent jamais.', nl: '', singular: 'message', rowTitle: () => 'message', noEdit: true, custom: false,
  fields: [], cols: [{ l: 'Date', v: r => fmtDT(r.at) }, { l: 'Canal', v: r => CH_LABEL[r.canal] || r.canal }, { l: 'Destinataire', v: r => r.nom + ' · ' + r.to }, { l: 'Message', v: r => r.texte }, { l: 'Statut', v: r => r.statut, r: r => html`${B(ST_TONE[r.statut] || 'mute', r.statut)}${r.detail && html` <small className="muted">${r.detail}</small>`}` }],
  filters: [{ k: 'statut', l: 'Statut', t: 'select', o: db => [...new Set(db.outbox.map(r => r.statut))] }, { k: 'canal', l: 'Canal', t: 'select', o: CH_ALL.map(c => ({ v: c, l: CH_LABEL[c] })) }],
  sort: (a, b) => b.at.localeCompare(a.at), delMsg: 'Cette ligne du journal sera supprimée.',
  rowActions: [
    { l: 'Ouvrir', i: 'link', open: true, show: r => r.statut === 'À envoyer' && isLinkOk(r.lien), run: r => { window.open(r.lien, '_blank', 'noopener,noreferrer'); } },
    { l: 'Marquer envoyé', i: 'check', show: r => r.statut === 'À envoyer', run: async (r, app) => { try { await app.markSent(r.id); app.notify('Message marqué comme envoyé'); } catch (e) { app.notify(e.message, 'bad'); } } }]
};
