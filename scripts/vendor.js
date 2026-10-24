// Copie React, ReactDOM et htm dans vendor/ pour construire dist/test.html (version hors ligne utilisée par les tests).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), nm = path.join(root, 'node_modules');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
const files = { 'react.js': 'react/umd/react.production.min.js', 'react-dom.js': 'react-dom/umd/react-dom.production.min.js', 'htm.js': 'htm/dist/htm.umd.js' };
for (const [dst, src] of Object.entries(files)) fs.copyFileSync(path.join(nm, src), path.join(root, 'vendor', dst));
console.log('vendor/ prêt');
