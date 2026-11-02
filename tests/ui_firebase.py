"""Test de bout en bout du déploiement Firebase Hosting.

Chaîne réelle : navigateur → page servie avec les VRAIS en-têtes de dist/firebase/firebase.json (politique de sécurité comprise)
→ fetch POST vers l'adresse Apps Script → serveur local qui exécute le VRAI Code.gs (services Google simulés).
Seule l'adresse script.google.com est interceptée par le test ; la redirection de Google vers script.googleusercontent.com n'est pas simulée.
"""
from playwright.sync_api import sync_playwright
import os, re, json, shutil, pathlib, subprocess, tempfile, threading, functools, http.server, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
FB = ROOT / 'dist' / 'firebase'
CHROMIUM = os.environ.get('CHROMIUM_PATH') or None
API = 'https://script.google.com/macros/s/TEST/exec'
ECHO = 'https://script.googleusercontent.com/macros/echo'
res = []
def check(n, c, x=''): res.append(bool(c)); print(('OK   ' if c else 'FAIL ') + n + ('' if c else ' — ' + str(x)))

# --- 1) serveur « Apps Script » : le vrai Code.gs
gas = subprocess.Popen(['node', str(ROOT / 'tests' / 'gas-server.js')], stdout=subprocess.PIPE, text=True)
GAS_PORT = int(gas.stdout.readline().strip().split('=')[1])
gas_url = lambda p: f'http://127.0.0.1:{GAS_PORT}{p}'
def gas_get(p): return json.loads(urllib.request.urlopen(gas_url(p)).read())

# --- 2) site statique : copie du dossier public, config de test, en-têtes tirés de firebase.json
tmp = pathlib.Path(tempfile.mkdtemp(prefix='fb-'))
pub = tmp / 'public'; shutil.copytree(FB / 'public', pub)
(pub / 'config.js').write_text(f"window.SCOLARIA_API = '{API}';\n", encoding='utf-8')
fbcfg = json.loads((FB / 'firebase.json').read_text(encoding='utf-8'))
HEADERS = {h['key']: h['value'] for rule in fbcfg['hosting']['headers'] if rule['source'] == '**' for h in rule['headers']}
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        for k, v in HEADERS.items(): self.send_header(k, v)
        super().end_headers()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(pub)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f'http://127.0.0.1:{srv.server_address[1]}/'

state = {'options': 0, 'posts': 0, 'mode': 'ok'}
CORS = {'access-control-allow-origin': '*'}
def install(ctx):
    """Intercepte l'adresse Apps Script : les requêtes POST sont transmises au vrai Code.gs (serveur local).
    La redirection de Google vers script.googleusercontent.com n'est PAS simulée (le navigateur de test ne suit pas une redirection simulée)."""
    def apps_script(route, req):
        if req.method == 'OPTIONS': state['options'] += 1; route.fulfill(status=405, body=''); return
        if state['mode'] == 'down': route.abort(); return
        if state['mode'] == 'html': route.fulfill(status=200, content_type='text/html', body='<html>Service indisponible</html>', headers=CORS); return
        if req.method == 'POST':
            state['posts'] += 1
            out = urllib.request.urlopen(urllib.request.Request(gas_url('/exec'), data=(req.post_data or '').encode('utf-8'), method='POST')).read()
        else:
            out = urllib.request.urlopen(gas_url('/exec' + (('?' + req.url.split('?', 1)[1]) if '?' in req.url else ''))).read()
        route.fulfill(status=200, content_type='application/json; charset=utf-8', body=out, headers=CORS)
    ctx.route(re.compile(r'^https://script\.google\.com/macros/s/TEST/exec(\?.*)?$'), apps_script)
    # polices Google : hors ligne dans les tests
    ctx.route(re.compile(r'^https://fonts\.(googleapis|gstatic)\.com/.*$'), lambda r, q: r.fulfill(status=200, content_type='text/css' if 'googleapis' in q.url else 'font/woff2', body=''))

errors = []; csp = []
def watch(pg):
    pg.set_default_timeout(15000)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.on('console', lambda m: (csp if 'Content Security Policy' in m.text else errors).append(m.text[:220]) if m.type == 'error' else None)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1200, 'height': 800}); install(ctx); pg = ctx.new_page(); watch(pg)

    # --- en-têtes et configuration de sécurité
    r = urllib.request.urlopen(SITE)
    hd = {k.lower(): v for k, v in r.headers.items()}
    csp_h = hd.get('content-security-policy', '')
    check('en-têtes : politique de sécurité sans script en ligne ni eval', "script-src 'self'" in csp_h and 'unsafe-inline' not in csp_h.split('style-src')[0] and 'unsafe-eval' not in csp_h, csp_h)
    check('en-têtes : connexions limitées à Apps Script', 'connect-src https://script.google.com https://script.googleusercontent.com' in csp_h, csp_h)
    check('en-têtes : page non intégrable dans un autre site', "frame-ancestors 'none'" in csp_h and hd.get('x-frame-options') == 'DENY')
    check('en-têtes : nosniff et Referrer-Policy', hd.get('x-content-type-options') == 'nosniff' and hd.get('referrer-policy') == 'no-referrer')
    html = (pub / 'index.html').read_text(encoding='utf-8')
    check('page : aucun script ni style en ligne', not re.search(r'<script(?![^>]*\bsrc=)', html) and '<style' not in html and ' style=' not in html)
    check('page : aucune bibliothèque chargée depuis un réseau tiers', not re.search(r'<script[^>]+src="https?://', html))

    # --- premier lancement : création du compte de la direction
    pg.goto(SITE); pg.wait_for_selector('.boot-card')
    check('premier lancement : la page Firebase interroge le serveur et propose de créer le compte', 'Créer le compte de la direction' in pg.inner_text('.boot-card'))
    check('aucune pré-vérification CORS (OPTIONS) envoyée', state['options'] == 0)
    pg.fill('#lg-nom', 'Seydou Mbaye'); pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'motdepasse1'); pg.fill('#lg-pwd2', 'motdepasse1')
    pg.get_by_role('button', name='Créer le compte').click(); pg.wait_for_selector('.shell')
    check('compte créé sur le vrai serveur : tableau de bord', pg.inner_text('.crumbs strong') == 'Tableau de bord')
    check('mode serveur : pas de sélecteur de rôle de démonstration', pg.locator('#role-switch').count() == 0)
    tok = pg.evaluate("sessionStorage.getItem('scolaria-token')")
    check('jeton de session mémorisé (onglet seulement)', bool(tok) and len(tok) > 20 and pg.evaluate("localStorage.getItem('scolaria-token')") is None)

    # --- données d'exemple (import groupé)
    pg.locator('.side .nav', has_text='Paramètres').first.click()
    pg.get_by_role('button', name='Charger les données d’exemple').click()
    with pg.expect_navigation(timeout=30000):   # l'application se recharge d'elle-même après l'import
        pg.get_by_role('button', name='Charger', exact=True).click()
    pg.wait_for_selector('.shell')
    pg.locator('.side .nav', has_text='Élèves').first.click(); pg.wait_for_timeout(300)
    check('import des données d’exemple par HTTP : élèves affichés', pg.locator('main.content table tbody tr').count() >= 20, pg.locator('main.content table tbody tr').count())
    # --- écriture puis relecture après rechargement (preuve que les données sont sur le serveur)
    pg.locator('.side .nav', has_text='Matières').first.click(); pg.get_by_role('button', name='Nouvelle matière').click()
    pg.fill('#f-nom', 'Wolof'); pg.fill('#f-code', 'WOL'); pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(500)
    pg.reload(); pg.wait_for_selector('.shell'); pg.locator('.side .nav', has_text='Matières').first.click(); pg.wait_for_timeout(300)
    check('rechargement : session reprise et matière enregistrée sur le serveur', 'Wolof' in pg.inner_text('main.content'))

    # --- déconnexion, mauvais mot de passe, reconnexion
    pg.get_by_label('Se déconnecter').click(); pg.wait_for_selector('#lg-email')
    check('déconnexion : jeton effacé', pg.evaluate("sessionStorage.getItem('scolaria-token')") in (None, ''))
    pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'faux'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_timeout(500)
    check('mauvais mot de passe : message du serveur affiché', 'incorrect' in pg.inner_text('.boot-card'))
    pg.fill('#lg-pwd', 'motdepasse1'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_selector('.shell')
    check('reconnexion réussie', True)
    pg.evaluate("sessionStorage.setItem('scolaria-token','jeton-bidon')"); pg.reload(); pg.wait_for_selector('#lg-email')
    check('jeton invalide : retour discret à la connexion', 'Se connecter' in pg.inner_text('.boot-card'))

    # --- inscription publique, sans connexion, dans un contexte vierge (autre navigateur)
    ctx2 = b.new_context(viewport={'width': 1200, 'height': 900}); install(ctx2); pub_pg = ctx2.new_page(); watch(pub_pg)
    pub_pg.goto(SITE); pub_pg.wait_for_selector('#go-register')
    check('visiteur : bouton « Inscrire mon enfant » sans connexion', pub_pg.locator('#go-register').count() == 1)
    pub_pg.click('#go-register'); pub_pg.wait_for_selector('.reg-card'); pub_pg.wait_for_selector('label[for=reg-cans]')
    q = re.search(r'font (\d+) \+ (\d+)', pub_pg.inner_text('label[for=reg-cans]'))
    pub_pg.fill('#p-prenom', 'Rokhaya'); pub_pg.fill('#p-nom', 'Thiam'); pub_pg.select_option('#p-lien', 'Mère'); pub_pg.fill('#p-tel', '77 456 78 90'); pub_pg.fill('#p-email', 'rokhaya@exemple.sn'); pub_pg.fill('#p-pwd', 'motdepasse-1'); pub_pg.fill('#p-pwd2', 'motdepasse-1')
    pub_pg.fill('#k0-prenom', 'Aïda'); pub_pg.fill('#k0-nom', 'Thiam'); pub_pg.select_option('#k0-sexe', 'F'); pub_pg.fill('#k0-naissance', '2015-04-12')
    first_class = pub_pg.locator('#k0-classId option').nth(1).get_attribute('value'); pub_pg.select_option('#k0-classId', first_class)
    pub_pg.check('#reg-consent'); pub_pg.fill('#reg-cans', '1')
    pub_pg.get_by_role('button', name='Envoyer la demande').click(); pub_pg.wait_for_timeout(600)
    check('inscription : mauvaise réponse anti-robot refusée par le serveur', 'incorrecte' in pub_pg.inner_text('.reg-card'))
    q = re.search(r'font (\d+) \+ (\d+)', pub_pg.inner_text('label[for=reg-cans]'))
    pub_pg.fill('#reg-cans', str(int(q.group(1)) + int(q.group(2)))); pub_pg.get_by_role('button', name='Envoyer la demande').click(); pub_pg.wait_for_selector('.reg-done', timeout=15000)
    check('inscription publique : demande reçue, sans compte préalable', 'Demande reçue' in pub_pg.inner_text('.reg-done'))
    pub_pg.get_by_role('button', name='Accéder à mon espace').click(); pub_pg.wait_for_selector('.shell')
    check('compte famille créé automatiquement : espace candidat ouvert', 'Bonjour Rokhaya' in pub_pg.inner_text('main.content'))
    check('espace famille : aucun module d’administration visible', pub_pg.locator('.side .nav', has_text='Utilisateurs').count() == 0 and pub_pg.locator('.side .nav', has_text='Paramètres').count() == 0)
    mails = gas_get('/__mails')
    check('e-mail d’accusé de réception parti du serveur', any(m.get('to') == 'rokhaya@exemple.sn' for m in mails), [m.get('to') for m in mails])
    check('aucun mot de passe en clair dans les e-mails', not any('motdepasse-1' in json.dumps(m) for m in mails))
    # le secrétariat voit la demande
    pg.evaluate("sessionStorage.removeItem('scolaria-token')"); pg.goto(SITE); pg.wait_for_selector('#lg-email')
    pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'motdepasse1'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_selector('.shell')
    pg.locator('.side .nav', has_text='Admissions').first.click(); pg.wait_for_timeout(400)
    check('administration : la demande publique apparaît dans les admissions', 'Aïda' in pg.inner_text('main.content'))

    check('aucune violation de la politique de sécurité pendant les parcours normaux', len(csp) == 0, csp[:3])
    # --- la politique de sécurité bloque réellement un script injecté
    blocked = pg.evaluate("""() => new Promise(res => {
      let hit = false; document.addEventListener('securitypolicyviolation', () => { hit = true; });
      window.__pwned = false; const s = document.createElement('script'); s.textContent = 'window.__pwned = true'; document.head.appendChild(s);
      const i = document.createElement('div'); i.setAttribute('onclick', 'window.__pwned = true'); document.body.appendChild(i); i.click();
      setTimeout(() => res({ pwned: window.__pwned, violation: hit }), 150); })""")
    check('sécurité : un script injecté ne s’exécute pas (politique active)', blocked['pwned'] is False and blocked['violation'] is True, blocked)

    # --- erreurs de configuration et de réseau, messages clairs
    ctx3 = b.new_context(); install(ctx3); bad = ctx3.new_page(); watch(bad)
    (pub / 'config.js').write_text("window.SCOLARIA_API = 'COLLEZ_ICI_ADRESSE_DU_SERVEUR/exec';\n", encoding='utf-8')
    bad.goto(SITE); bad.wait_for_selector('.boot-card strong:has-text("Impossible")')
    check('adresse non configurée : message explicite (jamais de bascule silencieuse en démonstration)', 'config.js' in bad.inner_text('.boot-card') and bad.locator('#role-switch').count() == 0)
    (pub / 'config.js').write_text("window.SCOLARIA_API = 'https://evil.example.com/steal/exec';\n", encoding='utf-8')
    bad.reload(); bad.wait_for_selector('.boot-card strong:has-text("Impossible")')
    check('adresse hors Google refusée : aucune requête envoyée', 'config.js' in bad.inner_text('.boot-card'))
    (pub / 'config.js').write_text(f"window.SCOLARIA_API = '{API}';\n", encoding='utf-8')
    state['mode'] = 'down'; bad.reload(); bad.wait_for_selector('.boot-card strong:has-text("Impossible")')
    check('serveur injoignable : message clair', 'injoignable' in bad.inner_text('.boot-card'))
    state['mode'] = 'html'; bad.get_by_role('button', name='Réessayer').click(); bad.wait_for_timeout(600)
    check('réponse non JSON (quota dépassé, accès restreint) : message qui guide', 'Tout le monde' in bad.inner_text('.boot-card'))
    state['mode'] = 'ok'; bad.get_by_role('button', name='Réessayer').click(); bad.wait_for_selector('#lg-email')
    check('serveur de retour : reprise sans recharger la page', 'Se connecter' in bad.inner_text('.boot-card'))

    bad_errors = [e for e in errors if 'Failed to load resource' not in e]
    print('erreurs JS:', len(bad_errors)); [print(' ', e) for e in bad_errors[:6]]
    check('aucune erreur JavaScript', len(bad_errors) == 0)
    b.close()
gas.terminate(); srv.shutdown(); shutil.rmtree(tmp, ignore_errors=True)
print(f'{sum(res)}/{len(res)} vérifications réussies'); raise SystemExit(0 if all(res) else 1)
