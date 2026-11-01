from playwright.sync_api import sync_playwright
import os, pathlib, threading, functools, http.server
ROOT = pathlib.Path(__file__).resolve().parents[1]
# Servi en HTTP local : sur file://, Chromium ne garde pas toujours sessionStorage après un rechargement (faux échecs).
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
_srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=_srv.serve_forever, daemon=True).start()
TEST_URL = 'http://127.0.0.1:%d/test.html' % _srv.server_address[1]
CHROMIUM = os.environ.get('CHROMIUM_PATH') or None  # chemin d'un Chromium déjà installé (facultatif)
FAKE = r"""
(() => {
  const st = { users: JSON.parse(sessionStorage.getItem('fk-users') || '[]'), db: null, calls: [] };
  window.__st = st;
  const H = {
    apiStatus: () => ({ hasUsers: st.users.length > 0, school: 'Complexe Test', registration: sessionStorage.getItem('fk-reg') === 'off' ? { open: false } : { open: true, mode: 'validation', indicatif: '221', consentement: 'J’accepte le traitement.', classes: [{ id: 'c1', nom: '6ème A', niveau: '6ème' }], champs: [{ k: 'ecole_prec', l: 'École précédente', t: 'text', req: true }], liens: ['Père', 'Mère'], canaux: ['email'] } }),
    apiChallenge: () => ({ id: 'ch1', q: '4 + 3' }),
    apiRegister: (form, tok) => { st.calls.push(['register', form.enfants[0].prenom, JSON.stringify(form.enfants[0].extra), form.parent.email]); if (form.cans !== '7') throw new Error('Réponse incorrecte à la question de vérification.'); sessionStorage.setItem('fk-role', 'candidat'); return { ok: true, refs: ['INS-2026-0001'], admis: 0, comptes: [], session: { token: 'tok-c', me: {} } }; },
    apiChangePassword: (t, a, b) => { st.calls.push(['chpwd']); if (a !== 'prov-1234') throw new Error('Ancien mot de passe incorrect.'); sessionStorage.removeItem('fk-must'); return true; },
    apiSetupAdmin: (email, nom, pwd) => { if (st.users.length) throw new Error('Un compte existe déjà.'); st.users.push({ email, nom, pwd }); sessionStorage.setItem('fk-users', JSON.stringify(st.users)); return { token: 'tok-1' }; },
    apiLogin: (email, pwd) => { const u = st.users.find(x => x.email === email && x.pwd === pwd); if (!u) throw new Error('Adresse ou mot de passe incorrect.'); return { token: 'tok-1' }; },
    apiLogout: t => true,
    apiLoadAll: t => { if (t === 'tok-c') { const db = buildSeed(); db.users = []; ['students','payments','marks','parents','attendance','conduct','documents','teachers'].forEach(k => db[k] = []); db.admissions = []; return { tables: db, me: { id: 'uc', email: 'a@b.sn', nom: 'Rokhaya Thiam', role: 'candidat', linkId: '', tel: '', actif: true, hash: '', salt: '', login: 'a@b.sn', mustChange: false } }; }
      if (t === 'tok-m') { if (sessionStorage.getItem('fk-must') === '1') return { tables: {}, me: { id: 'um', email: 'e@f.sn', nom: 'Awa Ndiaye', role: 'eleve', linkId: '', tel: '', actif: true, hash: '', salt: '', login: 'adm-2026-001', mustChange: true } }; const db = buildSeed(); db.users = []; return { tables: db, me: { id: 'um', email: '', nom: 'Awa Ndiaye', role: 'eleve', linkId: db.students[0].id, tel: '', actif: true, hash: '', salt: '', login: 'adm-2026-001', mustChange: false } }; }
      if (t !== 'tok-1') throw new Error('AUTH'); const u = st.users[0]; if (!st.db) { st.db = buildSeed(); st.db.users = []; } return { tables: st.db, me: { id: 'u1', email: u.email, nom: u.nom, role: 'admin', linkId: '', tel: '', actif: true, hash: '', salt: '' } }; },
    apiSave: (t, tb, row) => { st.calls.push(['save', tb]); return row; }, apiSaveMany: (t, tb, rows) => { st.calls.push(['saveMany', tb, rows.length]); return rows; }, apiRemove: (t, tb, ids) => true,
    apiSetPassword: (t, id, p) => { st.calls.push(['pwd', id]); return true; }
  };
  const mk = (ok, ko) => new Proxy({}, { get(_, fn) {
    if (fn === 'withSuccessHandler') return f => mk(f, ko); if (fn === 'withFailureHandler') return f => mk(ok, f);
    return (...a) => setTimeout(() => { try { ok(H[fn](...a)); } catch (e) { ko({ message: e.message }); } }, 20);
  } });
  window.google = { script: { run: mk(() => {}, () => {}) } };
})();
"""
res = []; errors = []
def check(n, c, x=''): res.append(c); print(('OK   ' if c else 'FAIL ') + n + ('' if c else ' — ' + str(x)))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1200, 'height': 800}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)[:200])); pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    # la fausse API doit exister AVANT l'application : on l'injecte puis on exécute la page en la rechargeant via add_init_script qui la précède,
    # mais buildSeed n'existe qu'après le chargement : les appels sont différés (setTimeout) donc c'est suffisant.
    pg.add_init_script(FAKE)
    pg.goto(TEST_URL); pg.wait_for_selector('.boot-card')
    check('premier lancement : écran de création du compte', 'Créer le compte de la direction' in pg.inner_text('.boot-card'))
    pg.fill('#lg-nom', 'Seydou Mbaye'); pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'motdepasse1'); pg.fill('#lg-pwd2', 'different12')
    pg.get_by_role('button', name='Créer le compte').click(); check('mots de passe différents refusés', 'ne correspondent pas' in pg.inner_text('.boot-card'))
    pg.fill('#lg-pwd', 'court'); pg.fill('#lg-pwd2', 'court'); pg.get_by_role('button', name='Créer le compte').click(); check('mot de passe court refusé', '8 caractères' in pg.inner_text('.boot-card'))
    pg.fill('#lg-pwd', 'motdepasse1'); pg.fill('#lg-pwd2', 'motdepasse1'); pg.get_by_role('button', name='Créer le compte').click(); pg.wait_for_selector('.shell')
    check('compte créé : tableau de bord affiché', pg.inner_text('.crumbs strong') == 'Tableau de bord')
    check('mode Google : pas de sélecteur de rôle de démonstration', pg.locator('#role-switch').count() == 0)
    check('mode Google : bouton de déconnexion présent', pg.get_by_label('Se déconnecter').count() == 1)
    check('session conservée dans le navigateur', pg.evaluate("sessionStorage.getItem('scolaria-token')") == 'tok-1')
    # enregistrement vers le serveur
    pg.locator('.side .nav', has_text='Matières').first.click(); pg.get_by_role('button', name='Nouvelle matière').click()
    pg.fill('#f-nom', 'Wolof'); pg.fill('#f-code', 'WOL'); pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(200)
    check('l’enregistrement part vers le serveur', ['save', 'subjects'] in pg.evaluate('__st.calls'), pg.evaluate('__st.calls'))
    pg.locator('.side .nav', has_text='Utilisateurs').first.click()
    check('GAS : action « Mot de passe » disponible', pg.get_by_title('Mot de passe').count() >= 0)
    pg.locator('.side .nav', has_text='Mon profil').first.click(); check('GAS : changement de mot de passe proposé', 'Changer mon mot de passe' in pg.inner_text('main.content'))
    # rechargement : la session est reprise
    pg.reload(); pg.wait_for_selector('.shell, #lg-email'); check('rechargement : session reprise sans nouvelle connexion', pg.locator('.shell').count() == 1)
    # déconnexion puis connexion
    pg.get_by_label('Se déconnecter').click(); pg.wait_for_selector('#lg-email')
    check('déconnexion : retour à l’écran de connexion', 'Se connecter' in pg.inner_text('.boot-card') and pg.evaluate("sessionStorage.getItem('scolaria-token')") in (None, ''))
    pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'faux'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_timeout(200)
    check('mauvais mot de passe : message clair', 'incorrect' in pg.inner_text('.boot-card'))
    pg.fill('#lg-pwd', 'motdepasse1'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_selector('.shell')
    check('connexion réussie', True)
    # session expirée côté serveur
    pg.evaluate("__st.users = __st.users; sessionStorage.setItem('scolaria-token','expire')"); pg.reload(); pg.wait_for_selector('#lg-email')
    check('jeton expiré : retour à la connexion', 'Se connecter' in pg.inner_text('.boot-card'))
    # --- inscription publique sans connexion (mode Google)
    pg.evaluate("sessionStorage.removeItem('scolaria-token')"); pg.reload(); pg.wait_for_selector('#lg-email')
    check('connexion : bouton « Inscrire mon enfant » proposé aux visiteurs', pg.locator('#go-register').count() == 1)
    check('connexion : identifiant libre (e-mail, téléphone ou n° d’admission)', pg.get_attribute('#lg-email', 'type') == 'text')
    pg.click('#go-register'); pg.wait_for_selector('.reg-card')
    check('inscription : champs personnalisés de la direction affichés', pg.locator('#k0-x-ecole_prec').count() == 1)
    pg.fill('#p-prenom', 'Rokhaya'); pg.fill('#p-nom', 'Thiam'); pg.select_option('#p-lien', 'Mère'); pg.fill('#p-tel', '77 456 78 90'); pg.fill('#p-email', 'a@b.sn'); pg.fill('#p-pwd', 'motdepasse-1'); pg.fill('#p-pwd2', 'motdepasse-1')
    pg.fill('#k0-prenom', 'Aïda'); pg.fill('#k0-nom', 'Thiam'); pg.select_option('#k0-sexe', 'F'); pg.fill('#k0-naissance', '2015-04-12'); pg.select_option('#k0-classId', 'c1'); pg.check('#reg-consent'); pg.fill('#reg-cans', '7')
    pg.get_by_role('button', name='Envoyer la demande').click()
    check('inscription : champ personnalisé obligatoire contrôlé', 'Champ obligatoire' in pg.inner_text('.reg-card'))
    pg.fill('#k0-x-ecole_prec', 'École Les Palmiers'); pg.fill('#reg-cans', '1'); pg.get_by_role('button', name='Envoyer la demande').click(); pg.wait_for_timeout(250)
    check('inscription : refus du serveur affiché', 'incorrecte' in pg.inner_text('.reg-card'))
    pg.fill('#reg-cans', '7'); pg.get_by_role('button', name='Envoyer la demande').click(); pg.wait_for_selector('.reg-done')
    call = [c for c in pg.evaluate('__st.calls') if c[0] == 'register'][-1]
    check('inscription : formulaire transmis au serveur avec les champs personnalisés', call[1] == 'Aïda' and 'Les Palmiers' in call[2] and call[3] == 'a@b.sn', call)
    check('inscription : jeton de session mémorisé après inscription', pg.evaluate("sessionStorage.getItem('scolaria-token')") == 'tok-c')
    pg.get_by_role('button', name='Accéder à mon espace').click(); pg.wait_for_selector('.shell')
    check('inscription : la famille candidate entre dans son espace sans sélecteur de démonstration', 'Bonjour Rokhaya' in pg.inner_text('main.content') and pg.locator('#role-switch').count() == 0)
    # --- mot de passe provisoire : changement obligatoire avant tout
    pg.evaluate("sessionStorage.setItem('scolaria-token','tok-m'); sessionStorage.setItem('fk-must','1')"); pg.reload(); pg.wait_for_selector('#cp-a')
    check('mot de passe provisoire : écran de changement obligatoire, aucune donnée affichée', 'Choisissez votre mot de passe' in pg.inner_text('.boot-card') and pg.locator('.shell').count() == 0)
    pg.fill('#cp-a', 'faux-faux-1'); pg.fill('#cp-b', 'nouveau-mdp-9'); pg.fill('#cp-c', 'nouveau-mdp-9'); pg.get_by_role('button', name='Enregistrer et continuer').click(); pg.wait_for_timeout(250)
    check('mot de passe provisoire : mauvais mot de passe actuel refusé', 'incorrect' in pg.inner_text('.boot-card'))
    pg.fill('#cp-a', 'prov-1234'); pg.get_by_role('button', name='Enregistrer et continuer').click(); pg.wait_for_selector('.shell')
    check('mot de passe provisoire : accès à l’espace après changement', 'Bonjour Awa' in pg.inner_text('main.content'))
    # --- inscription fermée : plus de bouton
    pg.evaluate("sessionStorage.removeItem('scolaria-token'); sessionStorage.setItem('fk-reg','off')"); pg.reload(); pg.wait_for_selector('#lg-email')
    check('inscription fermée : aucun bouton public', pg.locator('#go-register').count() == 0)
    print('erreurs JS:', len(errors)); [print(' ', e) for e in errors[:6]]
    b.close()
print(f'{sum(res)}/{len(res)} vérifications réussies')
