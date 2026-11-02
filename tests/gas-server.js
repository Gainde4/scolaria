/* Serveur HTTP local qui exécute le VRAI Code.gs (doPost, doGet) sur une simulation des services Google.
   Utilisé par tests/ui_firebase.py : le navigateur appelle l'adresse Apps Script, redirigée ici par le test.
   Sorties : une ligne « PORT=nnnn » au démarrage ; GET /__mails et /__fetches pour inspecter les envois. */
const http = require('http');
const { createGas } = require('./gas-sim.js');
const g = createGas();
const send = (res, code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8' }); res.end(body); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/exec') {
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => send(res, 200, g.ctx.doPost({ postData: { contents: Buffer.concat(chunks).toString('utf8') } }).getContent()));
  } else if (req.method === 'GET' && url.pathname === '/exec') {
    send(res, 200, g.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }).getContent());
  } else if (url.pathname === '/__mails') send(res, 200, JSON.stringify(g.mails));
  else if (url.pathname === '/__fetches') send(res, 200, JSON.stringify(g.fetches));
  else if (url.pathname === '/__props') send(res, 200, JSON.stringify(Object.keys(g.props)));
  else send(res, 404, '{}');
}).listen(0, '127.0.0.1', function () { console.log('PORT=' + this.address().port); });
