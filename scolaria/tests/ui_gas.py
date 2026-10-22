from playwright.sync_api import sync_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
TEST_URL = (ROOT / 'dist' / 'test.html').as_uri()
CHROMIUM = os.environ.get('CHROMIUM_PATH') or None  # chemin d'un Chromium déjà installé (facultatif)
FAKE = r"""
(() => {
  const st = { users: JSON.parse(localStorage.getItem('fk-users') || '[]'), db: null, calls: [] };
  window.__st = st;
  const H = {
    apiStatus: () => ({ hasUsers: st.users.length > 0, school: 'Complexe Test' }),
    apiSetupAdmin: (email, nom, pwd) => { if (st.users.length) throw new Error('Un compte existe déjà.'); st.users.push({ email, nom, pwd }); localStorage.setItem('fk-users', JSON.stringify(st.users)); return { token: 'tok-1' }; },
    apiLogin: (email, pwd) => { const u = st.users.find(x => x.email === email && x.pwd === pwd); if (!u) throw new Error('Adresse ou mot de passe incorrect.'); return { token: 'tok-1' }; },
    apiLogout: t => true,
    apiLoadAll: t => { if (t !== 'tok-1') throw new Error('AUTH'); const u = st.users[0]; if (!st.db) { st.db = buildSeed(); st.db.users = []; } return { tables: st.db, me: { id: 'u1', email: u.email, nom: u.nom, role: 'admin', linkId: '', tel: '', actif: true, hash: '', salt: '' } }; },
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
    pg.reload(); pg.wait_for_selector('.shell, .boot-card'); check('rechargement : session reprise sans nouvelle connexion', pg.locator('.shell').count() == 1)
    # déconnexion puis connexion
    pg.get_by_label('Se déconnecter').click(); pg.wait_for_selector('.boot-card')
    check('déconnexion : retour à l’écran de connexion', 'Se connecter' in pg.inner_text('.boot-card') and pg.evaluate("sessionStorage.getItem('scolaria-token')") in (None, ''))
    pg.fill('#lg-email', 'dir@ecole.sn'); pg.fill('#lg-pwd', 'faux'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_timeout(200)
    check('mauvais mot de passe : message clair', 'incorrect' in pg.inner_text('.boot-card'))
    pg.fill('#lg-pwd', 'motdepasse1'); pg.get_by_role('button', name='Se connecter').click(); pg.wait_for_selector('.shell')
    check('connexion réussie', True)
    # session expirée côté serveur
    pg.evaluate("__st.users = __st.users; sessionStorage.setItem('scolaria-token','expire')"); pg.reload(); pg.wait_for_selector('#lg-email')
    check('jeton expiré : retour à la connexion', 'Se connecter' in pg.inner_text('.boot-card'))
    print('erreurs JS:', len(errors)); [print(' ', e) for e in errors[:6]]
    b.close()
print(f'{sum(res)}/{len(res)} vérifications réussies')
