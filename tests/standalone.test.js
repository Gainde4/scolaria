/* Script Apps Script autonome (créé sur script.google.com, sans classeur lié) : il crée son propre classeur au premier appel
   et se passe de la page Index (la page est hébergée ailleurs). */
const { createGas } = require('./gas-sim.js');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('OK   ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
const g = createGas({ standalone: true }), c = g.ctx;
const P = (fn, ...args) => JSON.parse(c.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).getContent());
const newExecution = () => { c.BOOK_ = null; c.SHEETS_ = null; c.MEMO_ = {}; };   // dans Google, chaque requête repart d'un état vierge

const st = P('apiStatus');
ok('premier appel sans classeur lié : le serveur répond', st.ok && st.data.hasUsers === false, st);
ok('un classeur « Scolaria — données » est créé, une seule fois', g.created.length === 1 && g.created[0] === 'Scolaria — données', g.created);
ok('son identifiant est mémorisé dans les propriétés du script', g.props.SHEET_ID === 'sheet-123', g.props);
const adm = P('apiSetupAdmin', 'dir@ecole.sn', 'Seydou Mbaye', 'motdepasse1');
ok('création du compte de la direction', adm.ok && adm.data.token, adm);
newExecution();
const lg = P('apiLogin', 'dir@ecole.sn', 'motdepasse1');
ok('requête suivante : le classeur existant est rouvert, pas recréé', lg.ok && g.created.length === 1 && g.opened.includes('sheet-123'), { created: g.created, opened: g.opened });
newExecution();
const ld = P('apiLoadAll', lg.data.token);
ok('lecture complète sur le classeur autonome', ld.ok && ld.data.me.role === 'admin' && Object.keys(ld.data.tables).length === 37, ld.ok ? Object.keys(ld.data.tables).length : ld);
const pg = c.doGet({ parameter: {} });
ok('doGet sans fichier Index : réponse JSON explicite, pas d’erreur', JSON.parse(pg.getContent()).ok === true && /hébergée ailleurs/.test(JSON.parse(pg.getContent()).info));
ok('doGet ?ping=1', JSON.parse(c.doGet({ parameter: { ping: '1' } }).getContent()).ok === true);
// Deux premiers appels concurrents : le verrou évite un deuxième classeur
const g2 = createGas({ standalone: true }), c2 = g2.ctx;
let lockCalls = 0; const real = c2.LockService.getScriptLock; c2.LockService.getScriptLock = () => { lockCalls++; return real(); };
JSON.parse(c2.doPost({ postData: { contents: JSON.stringify({ fn: 'apiStatus', args: [] }) } }).getContent());
ok('création protégée par le verrou du script', lockCalls >= 1 && g2.created.length === 1, { lockCalls, created: g2.created });
// Script lié à un classeur (ancien mode) : inchangé, aucun classeur supplémentaire
const g3 = createGas(); JSON.parse(g3.ctx.doPost({ postData: { contents: JSON.stringify({ fn: 'apiStatus', args: [] }) } }).getContent());
ok('script lié à un classeur : comportement inchangé, rien n’est créé', g3.created.length === 0 && !g3.props.SHEET_ID);
console.log(`\n${pass}/${pass + fail} vérifications réussies`); process.exit(fail ? 1 : 0);
