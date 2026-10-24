from playwright.sync_api import sync_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
TEST_URL = (ROOT / 'dist' / 'test.html').as_uri()
CHROMIUM = os.environ.get('CHROMIUM_PATH') or None  # chemin d'un Chromium déjà installé (facultatif)
errors = []; results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('OK   ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra and not cond else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1360, 'height': 900})
    pg.on('pageerror', lambda e: errors.append(str(e)[:300]))
    pg.on('console', lambda m: errors.append(m.text[:300]) if m.type == 'error' else None)
    pg.goto(TEST_URL); pg.wait_for_selector('.shell')
    nav = lambda label: pg.locator('.side .nav', has_text=label).first.click()

    # --- montants en lettres
    cases = {22000: 'vingt-deux mille', 35000: 'trente-cinq mille', 1200000: 'un million deux cent mille', 80: 'quatre-vingts', 280000: 'deux cent quatre-vingt mille', 200: 'deux cents', 71: 'soixante et onze', 91: 'quatre-vingt-onze', 1000: 'mille', 2000: 'deux mille', 15000: 'quinze mille', 101000: 'cent un mille', 12500: 'douze mille cinq cents'}
    for n, exp in cases.items():
        got = pg.evaluate(f'enLettres({n})'); check(f'enLettres({n}) = « {exp} »', got == exp, got)

    # --- encaissement
    nav('Encaissement'); n0 = int(pg.inner_text('.count').split()[0])
    pg.get_by_role('button', name='Nouvel encaissement').click()
    pg.select_option('#f-studentId', index=3)
    pg.select_option('#f-type', 'Mensualité')
    amt = pg.input_value('#f-montant'); mois = pg.input_value('#f-mois')
    check('encaissement : montant pré-rempli depuis le barème', amt not in ('', '0'), amt)
    check('encaissement : mois suivant impayé pré-rempli', mois != '', mois)
    pg.fill('#f-montant', '0'); pg.get_by_role('button', name='Enregistrer').click()
    check('encaissement : montant 0 refusé', pg.locator('.field.has-err').count() >= 1)
    pg.fill('#f-montant', '22000'); pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(200)
    check('encaissement : ligne ajoutée + toast', pg.locator('.toast').count() >= 1 and int(pg.inner_text('.count').split()[0]) == n0 + 1, (n0, pg.inner_text('.count')))
    first = pg.locator('table.t tbody tr').first; recu = first.locator('td').first.inner_text()
    first.get_by_title('Reçu').click(); pg.wait_for_selector('.receipt')
    txt = pg.inner_text('.receipt')
    check('reçu : numéro affiché', recu in txt, recu); check('reçu : montant en lettres', 'vingt-deux mille francs CFA' in txt, txt[-200:])
    pg.keyboard.press('Escape')

    # --- présences
    nav('Présences'); pg.locator('.seg').first.get_by_text('Absent').click()
    pg.get_by_role('button', name='Enregistrer l’appel').click(); pg.wait_for_timeout(200)
    check('présences : appel enregistré', 'enregistrées' in pg.inner_text('.toasts'))

    # --- notes
    nav('Notes'); inp = pg.locator('input.cellinput').first
    inp.fill('25'); pg.get_by_role('button', name='Enregistrer les notes').click()
    check('notes : note > barème refusée', pg.locator('.form-err').count() == 1)
    inp.fill('15.5'); pg.get_by_role('button', name='Enregistrer les notes').click(); pg.wait_for_timeout(200)
    check('notes : saisie valide enregistrée', 'notes enregistrées' in pg.inner_text('.toasts'))

    # --- résultats : bulletin
    nav('Résultats'); pg.locator('table.t tbody .linkbtn').first.click(); pg.wait_for_selector('.modal')
    check('résultats : bulletin avec moyenne générale', 'Moyenne générale' in pg.inner_text('.modal')); pg.keyboard.press('Escape')

    # --- admission -> élève
    nav('Admissions'); ns = pg.evaluate("JSON.parse(localStorage.getItem('scolaria-demo-v1')).students.length")
    pg.locator('table.t tbody tr', has_text='En attente').first.get_by_text('Admettre').click()
    pg.get_by_role('button', name='Admettre', exact=True).last.click(); pg.wait_for_timeout(300)
    ns2 = pg.evaluate("JSON.parse(localStorage.getItem('scolaria-demo-v1')).students.length")
    check('admission : l’élève et sa fiche sont créés', ns2 == ns + 1, (ns, ns2))

    # --- doublon N° admission
    nav('Élèves'); pg.get_by_role('button', name='Nouvel élève').click()
    pg.fill('#f-admission', 'ADM-2026-001'); pg.fill('#f-prenom', 'Test'); pg.fill('#f-nom', 'Doublon'); pg.select_option('#f-sexe', 'M'); pg.fill('#f-naissance', '2014-05-05'); pg.select_option('#f-classId', index=1)
    pg.get_by_role('button', name='Enregistrer').click()
    check('élèves : N° d’admission en double refusé', 'déjà attribué' in pg.inner_text('.modal')); pg.keyboard.press('Escape')

    # --- stock insuffisant
    nav('Stock'); pg.locator('table.t tbody tr').first.get_by_text('Sortie').click()
    pg.fill('#f-quantite', '9999'); pg.fill('#f-motif', 'test'); pg.get_by_role('button', name='Enregistrer').click()
    check('stock : sortie supérieure au stock refusée', 'Stock insuffisant' in pg.inner_text('.modal')); pg.keyboard.press('Escape')

    # --- emploi du temps : conflit enseignant
    nav('Emploi du temps')
    cells = pg.locator('button.cell'); cnt = cells.count(); check('emploi du temps : grille remplie', cnt >= 30, cnt)
    check('emploi du temps : aucun conflit dans les données d’exemple', pg.locator('.cell.conflict').count() == 0)
    # forcer un conflit : prendre un créneau libre de la 6ème A et y mettre un enseignant déjà occupé
    pg.locator('button.cell.sx').first.click()
    pg.select_option('#f-subjectId', index=2)
    t_busy = pg.evaluate("""(() => { const db = JSON.parse(localStorage.getItem('scolaria-demo-v1')); const cls = db.classes[0].id; const a = db.timetable.find(t => t.classId !== cls); return a.teacherId; })()""")
    check('emploi du temps : formulaire de créneau ouvert', pg.locator('.modal').count() == 1)
    pg.keyboard.press('Escape')

    # --- caisse du jour et mensualités
    nav('Caisse du jour'); check('caisse : total du jour affiché', 'Total encaissé' in pg.inner_text('main.content'))
    nav('Mensualités'); check('mensualités : grille mois par mois', pg.locator('.mcell').count() > 100, pg.locator('.mcell').count())

    # --- rôles : cloisonnement
    pg.select_option('#role-switch', 'enseignant')
    labels = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText)')
    check('enseignant : pas d’accès aux finances', not any('Encaissement' in l or 'Caisse' in l or 'Mensualités' in l for l in labels))
    check('enseignant : accès à la saisie des notes', any('Notes' in l for l in labels))
    pg.select_option('#role-switch', 'parent')
    check('parent : voit un espace familial', 'Bonjour' in pg.inner_text('main.content'))
    check('parent : ne voit que ses enfants', pg.locator('.kid').count() >= 1, pg.locator('.kid').count())
    pg.select_option('#role-switch', 'eleve')
    check('élève : pas de reste à payer affiché', 'Reste à payer' not in pg.inner_text('main.content'))

    # --- thème sombre
    pg.select_option('#role-switch', 'admin'); pg.get_by_label('Passer au thème sombre').click()
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor"); check('thème sombre appliqué', bg != 'rgb(238, 242, 241)', bg)
    print('--- erreurs JS:', len(errors)); [print(' ', e) for e in errors[:8]]
    b.close()
fails = [r for r in results if not r[1]]; print(f'\n{len(results)-len(fails)}/{len(results)} vérifications réussies')
