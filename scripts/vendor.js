// Copie React, ReactDOM et htm dans vendor/ pour construire dist/test.html (version hors ligne utilisée par les tests).
// Nécessite « npm install » une première fois ; ensuite vendor/ suffit.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), nm = path.join(root, 'node_modules'), out = path.join(root, 'vendor');
const files = { 'react.js': 'react/umd/react.production.min.js', 'react-dom.js': 'react-dom/umd/react-dom.production.min.js', 'htm.js': 'htm/dist/htm.umd.js' };
fs.mkdirSync(out, { recursive: true });
let missing = false;
for (const [dst, src] of Object.entries(files)) {
  const from = path.join(nm, src), to = path.join(out, dst);
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
  else if (!fs.existsSync(to)) { console.error('Introuvable : ' + src + ' — lancez d’abord « npm install ».'); missing = true; }
}
if (missing) process.exit(1);
console.log('vendor/ prêt');
