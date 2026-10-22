/* ===== Scolaria : composants d'interface ===== */
const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const ICONS = {
  dash: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  users: C(9, 8, 3.5) + ' M2 20c0-3.5 3-6 7-6s7 2.5 7 6 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14.5c2.5.6 4 2.5 4 5.5',
  user: C(12, 8, 4) + ' M4 21c0-4 3.5-7 8-7s8 3 8 7',
  book: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  cal: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  clock: C(12, 12, 9) + ' M12 7v5l3 2',
  check: 'M5 12l5 5 9-10',
  cash: 'M3 7h18v10H3z ' + C(12, 12, 2.5) + ' M6 10v4 M18 10v4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h6',
  bell: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4',
  box: 'M3 8l9-5 9 5v9l-9 5-9-5z M3 8l9 5 9-5 M12 13v9',
  sliders: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 ' + C(16, 7, 2) + ' ' + C(8, 17, 2),
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: C(11, 11, 6) + ' M16 16l5 5',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  x: 'M6 6l12 12 M18 6L6 18',
  printer: 'M7 8V3h10v5 M5 8h14v8H5z M7 14h10v7H7z',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  award: C(12, 9, 5) + ' M8.5 13.5L7 21l5-3 5 3-1.5-7.5',
  school: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  clip: 'M8 4h8v3H8z M6 5H5v16h14V5h-1 M9 12h6 M9 16h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  swap: 'M4 8h14l-3-3 M20 16H6l3 3',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  chev: 'M9 6l6 6-6 6',
  send: 'M3 11l18-8-8 18-2-8z',
  tool: 'M14 6a4 4 0 0 0 5 5l-9 9a2.5 2.5 0 0 1-4-4z M14 6l-1-3 3 1',
  help: C(12, 12, 9) + ' M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7 M12 17v.5'
};
function Icon({ n, s = 18 }) {
  return html`<svg className="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[n] || ICONS.file} /></svg>`;
}
const Btn = ({ children, tone, sm, icon, ...p }) => html`<button type="button" className=${'btn' + (tone ? ' ' + tone : '') + (sm ? ' sm' : '')} ...${p}>${icon && html`<${Icon} n=${icon} s=${sm ? 15 : 17} />`}${children}</button>`;
const Badge = ({ tone = 'mute', children }) => html`<span className=${'badge ' + tone}>${children}</span>`;
const PageHead = ({ title, sub, children }) => html`<header className="page-head"><div><h1>${title}</h1>${sub && html`<p className="sub">${sub}</p>`}</div><div className="head-actions">${children}</div></header>`;
const Empty = ({ icon = 'file', title, children }) => html`<div className="empty"><${Icon} n=${icon} s=${28} /><strong>${title}</strong><span>${children}</span></div>`;
const Kpi = ({ l, v, sub, tone, icon }) => html`<div className=${'kpi ' + (tone || '')}><div className="kpi-top"><span>${l}</span>${icon && html`<${Icon} n=${icon} s=${16} />`}</div><strong className="mono">${v}</strong>${sub && html`<small>${sub}</small>`}</div>`;

function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return html`<div className="modal-back" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div className="modal-head"><h2>${title}</h2><button type="button" className="icon-btn" onClick=${onClose} aria-label="Fermer"><${Icon} n="x" /></button></div>
      <div className="modal-body">${children}</div>
      ${foot && html`<div className="modal-foot">${foot}</div>`}
    </div></div>`;
}

/* ---------- Champs de formulaire pilotés par configuration ---------- */
function Field({ f, values, set, db, error }) {
  const v = values[f.k], id = 'f-' + f.k;
  const c = { id, disabled: !!f.ro, 'aria-invalid': !!error };
  let input;
  if (f.t === 'area') input = html`<textarea ...${c} rows=${f.rows || 3} value=${v ?? ''} onChange=${e => set(f.k, e.target.value)}></textarea>`;
  else if (f.t === 'select' || f.t === 'ref') {
    let o;
    if (f.t === 'ref') o = db[f.ref].filter(r => !f.fl || f.fl(r, values, db)).map(r => ({ v: r.id, l: LABEL[f.ref](r, db) })).sort((a, b) => a.l.localeCompare(b.l, 'fr'));
    else o = (typeof f.o === 'function' ? f.o(values, db) : f.o).map(x => typeof x === 'string' ? { v: x, l: x } : x);
    input = html`<select ...${c} value=${v ?? ''} onChange=${e => set(f.k, e.target.value)}><option value="">—</option>${o.map(x => html`<option key=${x.v} value=${x.v}>${x.l}</option>`)}</select>`;
  }
  else if (f.t === 'bool') input = html`<label className="check"><input ...${c} type="checkbox" checked=${!!v} onChange=${e => set(f.k, e.target.checked)} /> <span>${f.cl || 'Oui'}</span></label>`;
  else if (f.t === 'num') input = html`<input ...${c} type="number" step=${f.step || 1} min=${f.min} max=${f.max} value=${v ?? ''} onChange=${e => set(f.k, e.target.value === '' ? '' : Number(e.target.value))} />`;
  else if (f.t === 'file') input = html`<div className="filepick"><input ...${c} type="file" onChange=${e => { const fl = e.target.files && e.target.files[0]; set(f.k, fl ? fl.name : v); }} />${v && html`<span className="mono small">${v}</span>`}</div>`;
  else {
    const list = f.list ? f.list(db) : null;
    input = html`<input ...${c} type=${f.t || 'text'} value=${v ?? ''} placeholder=${f.ph} list=${list ? id + '-l' : undefined} onChange=${e => set(f.k, e.target.value)} />${list && html`<datalist id=${id + '-l'}>${list.map(x => html`<option key=${x} value=${x} />`)}</datalist>`}`;
  }
  return html`<div className=${'field' + (f.w === 'full' || f.t === 'area' ? ' full' : '') + (error ? ' has-err' : '')}>
    <label htmlFor=${id}>${f.l}${f.req && html`<span className="req"> *</span>`}</label>${input}
    ${error ? html`<small className="err">${error}</small>` : f.hint && html`<small className="hint">${typeof f.hint === 'function' ? f.hint(values, db) : f.hint}</small>`}
  </div>`;
}
function validateFields(fields, values, db, editing) {
  const errs = {};
  fields.forEach(f => {
    if (f.show && !f.show(values)) return;
    const v = values[f.k];
    if (f.req && (v === '' || v === undefined || v === null)) { errs[f.k] = 'Champ obligatoire'; return; }
    if (f.t === 'num' && v !== '' && v !== undefined) { if (f.min !== undefined && v < f.min) { errs[f.k] = 'Minimum : ' + f.min; return; } if (f.max !== undefined && v > f.max) { errs[f.k] = 'Maximum : ' + f.max; return; } }
    if (f.t === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { errs[f.k] = 'Adresse e-mail invalide'; return; }
    if (f.check) { const m = f.check(v, values, db, editing); if (m) errs[f.k] = m; }
  });
  return errs;
}
function FormFields({ fields, values, set, db, errors }) {
  return html`<div className="form-grid">${fields.filter(f => !f.show || f.show(values)).map(f => html`<${Field} key=${f.k} f=${f} values=${values} set=${set} db=${db} error=${errors[f.k]} />`)}</div>`;
}

/* Boîte de dialogue générique : formulaire ou confirmation (remplace prompt/confirm) */
function AskDialog({ cfg, db, onDone }) {
  const [values, setValues] = useState(cfg.initial || {});
  const [errors, setErrors] = useState({});
  const [formErr, setFormErr] = useState('');
  const fields = cfg.fields || [];
  const set = (k, v) => setValues(prev => { let nv = { ...prev, [k]: v }; if (cfg.onChange) nv = { ...nv, ...(cfg.onChange(nv, k, db) || {}) }; return nv; });
  const submit = e => {
    if (e) e.preventDefault();
    const errs = validateFields(fields, values, db, cfg.editing); setErrors(errs);
    if (Object.keys(errs).length) return;
    const m = cfg.validate ? cfg.validate(values, db) : ''; if (m) { setFormErr(m); return; }
    onDone(values);
  };
  const foot = html`${cfg.secondary && html`<${Btn} tone=${cfg.secondary.tone || 'ghost'} onClick=${() => onDone({ __action: cfg.secondary.value })}>${cfg.secondary.l}<//>`}<span className="grow"></span>${!cfg.noCancel && html`<${Btn} onClick=${() => onDone(null)}>Annuler<//>`}<${Btn} tone=${cfg.danger ? 'danger solid' : 'primary'} onClick=${submit}>${cfg.submit || 'Enregistrer'}<//>`;
  return html`<${Modal} title=${cfg.title} onClose=${() => onDone(null)} wide=${cfg.wide} foot=${foot}>
    <form onSubmit=${submit}>
      ${cfg.message && html`<p className="dlg-msg">${cfg.message}</p>`}
      ${fields.length > 0 && html`<${FormFields} fields=${fields} values=${values} set=${set} db=${db} errors=${errors} />`}
      ${cfg.extra && cfg.extra(values, db)}
      ${formErr && html`<p className="form-err" role="alert">${formErr}</p>`}
      <button type="submit" hidden></button>
    </form></${Modal}>`;
}

/* ---------- Graphiques ---------- */
function Bars({ data, h = 150, fmt = num, label }) {
  const max = Math.max(1, ...data.map(d => d.v)), step = Math.max(46, 560 / Math.max(1, data.length)), w = step * data.length;
  return html`<div className="chartwrap"><svg viewBox=${`0 0 ${w} ${h + 28}`} className="chart" style=${{ minWidth: Math.min(w, 520) }} role="img" aria-label=${label || 'Histogramme'}>
    ${[0, .5, 1].map(t => html`<line key=${t} x1="0" x2=${w} y1=${h - t * (h - 16)} y2=${h - t * (h - 16)} className="grid" />`)}
    ${data.map((d, i) => { const bw = Math.min(30, step - 14), x = i * step + (step - bw) / 2, bh = d.v / max * (h - 18); return html`<g key=${i}><rect x=${x} y=${h - bh} width=${bw} height=${Math.max(bh, 1)} rx="3" className=${'bar ' + (d.tone || '')} /><text x=${x + bw / 2} y=${h - bh - 5} textAnchor="middle" className="val">${fmt(d.v)}</text><text x=${x + bw / 2} y=${h + 17} textAnchor="middle" className="lbl">${d.l}</text></g>`; })}
  </svg></div>`;
}
function Line({ data, h = 140, unit = '%', label }) {
  if (!data.length) return null;
  const w = 560, lo = Math.max(0, Math.floor(Math.min(...data.map(d => d.v)) - 6)), hi = 100, pl = 40, pr = 24, pt = 16, pb = 26;
  const X = i => pl + (data.length === 1 ? 0 : i * (w - pl - pr) / (data.length - 1)), Y = v => pt + (hi - v) / (hi - lo) * (h - pt - pb);
  const pts = data.map((d, i) => X(i) + ',' + Y(d.v)).join(' '), last = data[data.length - 1];
  return html`<div className="chartwrap"><svg viewBox=${`0 0 ${w} ${h}`} className="chart" role="img" aria-label=${label || 'Courbe'}>
    ${[lo, Math.round((lo + hi) / 2), hi].map(t => html`<g key=${t}><line x1=${pl} x2=${w - pr} y1=${Y(t)} y2=${Y(t)} className="grid" /><text x=${pl - 5} y=${Y(t) + 3} textAnchor="end" className="lbl">${t}${unit}</text></g>`)}
    <polygon points=${pl + ',' + Y(lo) + ' ' + pts + ' ' + X(data.length - 1) + ',' + Y(lo)} className="area" />
    <polyline points=${pts} className="line" fill="none" />
    ${data.map((d, i) => html`<text key=${i} x=${X(i)} y=${h - 8} textAnchor="middle" className="lbl">${d.l}</text>`)}
    <circle cx=${X(data.length - 1)} cy=${Y(last.v)} r="4" className="dot" />
    <text x=${X(data.length - 1)} y=${Y(last.v) - 9} textAnchor="end" className="val">${dec(last.v, 1)}${unit}</text>
  </svg></div>`;
}
