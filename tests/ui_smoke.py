import sys, json
from playwright.sync_api import sync_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
TEST_URL = (ROOT / 'dist' / 'test.html').as_uri()
CHROMIUM = os.environ.get('CHROMIUM_PATH') or None  # chemin d'un Chromium déjà installé (facultatif)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1360, 'height': 860})
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.on('console', lambda m: errors.append('CONSOLE.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
    pg.goto(TEST_URL); pg.wait_for_selector('.shell', timeout=8000)
    print('Titre:', pg.title(), '| page initiale:', pg.inner_text('.crumbs strong'))
    roles = ['admin', 'secretaire', 'surveillant', 'enseignant', 'eleve', 'parent']
    report = {}
    for role in roles:
        pg.select_option('#role-switch', role); pg.wait_for_timeout(150)
        items = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText.replace(/\\n.*/s,"").trim())')
        ok = []; bad = []
        for i, name in enumerate(items):
            pg.locator('.side .nav').nth(i).click(); pg.wait_for_timeout(60)
            txt = pg.inner_text('main.content')
            crumb = pg.inner_text('.crumbs strong')
            if len(txt.strip()) < 20: bad.append(name + ' (vide)')
            else: ok.append(crumb)
        report[role] = (len(items), bad)
    for r, (n, bad) in report.items(): print(f'{r:12s} {n:2d} modules visibles', 'VIDES: ' + ', '.join(bad) if bad else 'ok')
    print('--- erreurs JS:', len(errors))
    for e in errors[:15]: print(e[:300])
    b.close()
