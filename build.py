#!/usr/bin/env python3
"""Assemble Scolaria : dist/index.html (page publiable, bibliothèques via CDN), dist/gas/ (Code.gs + Index.html + appsscript.json),
dist/firebase/ (projet Firebase Hosting : page servie par Firebase, données sur Apps Script) et dist/test.html (bibliothèques locales, pour les tests hors ligne)."""
import json, glob, os, sys, shutil, hashlib, re
root = os.path.dirname(os.path.abspath(__file__))
schema = open(f'{root}/src/schema.json', encoding='utf-8').read().strip()
schema_js = json.dumps(json.loads(schema), ensure_ascii=False)
shared = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(f'{root}/src/shared/*.js')))
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(f'{root}/src/js/*.js')))
js = js.replace('/*__SHARED__*/', shared).replace('__SCHEMA__', schema_js)
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
code = open(f'{root}/backend/Code.gs', encoding='utf-8').read().replace('/*__SHARED__*/', shared).replace('__SCHEMA__', schema_js)
open(f'{root}/dist/gas/Code.gs', 'w', encoding='utf-8').write(code)
shutil.copy(f'{root}/backend/appsscript.json', f'{root}/dist/gas/appsscript.json')
shutil.copy(f'{root}/docs/DEPLOIEMENT.md', f'{root}/dist/gas/LISEZMOI.md')
# 3) Test local
if os.path.exists(f'{root}/vendor/react.js'):
    test = f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scolaria</title><style>\nbody{{margin:0}}\n{css}\n</style></head><body>{BODY}{libs(True)}<script>\n{js}\n</script></body></html>'
    open(f'{root}/dist/test.html', 'w', encoding='utf-8').write(test)
# 4) Firebase Hosting : la page est servie par Firebase, les données restent sur Apps Script (adresse dans public/config.js).
#    Scripts et styles sont des fichiers séparés (empreinte dans le nom) : la politique de sécurité n'autorise aucun script en ligne,
#    et React/htm sont servis par le site lui-même (versions figées par package.json), sans réseau de diffusion tiers.
FB = f'{root}/dist/firebase'
if all(os.path.exists(f'{root}/vendor/{n}') for n in ('react.js', 'react-dom.js', 'htm.js')):
    pub = f'{FB}/public'; os.makedirs(f'{pub}/vendor', exist_ok=True)
    for n in ('react.js', 'react-dom.js', 'htm.js'): shutil.copy(f'{root}/vendor/{n}', f'{pub}/vendor/{n}')
    for old_f in glob.glob(f'{pub}/app.*.js') + glob.glob(f'{pub}/app.*.css'): os.remove(old_f)
    h = lambda t: hashlib.sha256(t.encode('utf-8')).hexdigest()[:10]
    js_name, css_name = f'app.{h(js)}.js', f'app.{h(css)}.css'
    open(f'{pub}/{js_name}', 'w', encoding='utf-8').write(js); open(f'{pub}/{css_name}', 'w', encoding='utf-8').write('body{margin:0}\n' + css)
    icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f4b8f'/%3E%3Ctext x='16' y='23' font-size='20' font-family='sans-serif' font-weight='700' text-anchor='middle' fill='white'%3ES%3C/text%3E%3C/svg%3E"
    page = (f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scolaria</title>'
            f'<link rel="icon" href="{icon}">{FONTS}<link rel="stylesheet" href="{css_name}"></head><body><div id="root"></div>'
            f'<script src="config.js"></script><script src="vendor/react.js"></script><script src="vendor/react-dom.js"></script><script src="vendor/htm.js"></script><script src="{js_name}"></script></body></html>')
    open(f'{pub}/index.html', 'w', encoding='utf-8').write(page)
    if not os.path.exists(f'{pub}/config.js'):   # ne jamais écraser l'adresse déjà renseignée par l'école
        shutil.copy(f'{root}/src/firebase/config.js', f'{pub}/config.js')
    shutil.copy(f'{root}/src/firebase/firebase.json', f'{FB}/firebase.json')
    if not os.path.exists(f'{FB}/.firebaserc'): shutil.copy(f'{root}/src/firebase/firebaserc.json', f'{FB}/.firebaserc')
    shutil.copy(f'{root}/docs/FIREBASE.md', f'{FB}/LISEZMOI.md') if os.path.exists(f'{root}/docs/FIREBASE.md') else None
else:
    print('(dist/firebase non reconstruit : vendor/ absent, lancez « npm install && npm run vendor »)')
print('index.html', len(art)//1024, 'Ko | Index.html GAS', len(gas_html)//1024, 'Ko | Code.gs', len(code)//1024, 'Ko')
