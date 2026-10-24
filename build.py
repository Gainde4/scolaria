#!/usr/bin/env python3
"""Assemble Scolaria : dist/index.html (page publiable, bibliothèques via CDN), dist/gas/ (Code.gs + Index.html + appsscript.json),
et dist/test.html (bibliothèques locales, pour les tests hors ligne)."""
import json, glob, os, sys, shutil
root = os.path.dirname(os.path.abspath(__file__))
schema = open(f'{root}/src/schema.json', encoding='utf-8').read().strip()
schema_js = json.dumps(json.loads(schema), ensure_ascii=False)
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(f'{root}/src/js/*.js'))).replace('__SCHEMA__', schema_js)
css = open(f'{root}/src/style.css', encoding='utf-8').read()
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">'
CDN = ['https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
       'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
       'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js']
def libs(local):
    if local:
        return ''.join(f'<script>{open(f"{root}/vendor/{n}", encoding="utf-8").read()}</script>' for n in ('react.js', 'react-dom.js', 'htm.js'))
    return ''.join(f'<script src="{u}"></script>' for u in CDN)
BODY = f'<div id="root"></div>'
os.makedirs(f'{root}/dist/gas', exist_ok=True)
# 1) Artifact : contenu seul (le squelette est ajouté à la publication)
art = f'<title>Scolaria</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{FONTS}\n<style>\n{css}\n</style>\n{BODY}\n{libs(False)}\n<script>\n{js}\n</script>\n'
open(f'{root}/dist/index.html', 'w', encoding='utf-8').write(art)
# 2) Google Apps Script
gas_html = f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scolaria</title>{FONTS}<style>\nbody{{margin:0}}\n{css}\n</style></head><body>{BODY}{libs(False)}<script>\n{js}\n</script></body></html>'
open(f'{root}/dist/gas/Index.html', 'w', encoding='utf-8').write(gas_html)
code = open(f'{root}/backend/Code.gs', encoding='utf-8').read().replace('__SCHEMA__', schema_js)
open(f'{root}/dist/gas/Code.gs', 'w', encoding='utf-8').write(code)
shutil.copy(f'{root}/backend/appsscript.json', f'{root}/dist/gas/appsscript.json')
shutil.copy(f'{root}/docs/DEPLOIEMENT.md', f'{root}/dist/gas/LISEZMOI.md')
# 3) Test local
if os.path.exists(f'{root}/vendor/react.js'):
    test = f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scolaria</title><style>\nbody{{margin:0}}\n{css}\n</style></head><body>{BODY}{libs(True)}<script>\n{js}\n</script></body></html>'
    open(f'{root}/dist/test.html', 'w', encoding='utf-8').write(test)
print('index.html', len(art)//1024, 'Ko | Index.html GAS', len(gas_html)//1024, 'Ko | Code.gs', len(code)//1024, 'Ko')
