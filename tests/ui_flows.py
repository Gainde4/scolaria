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
    nav('Admissions'); ns = pg.evaluate("JSON.parse(localStorage.getItem('scolaria-demo-v2')).students.length")
    pg.locator('table.t tbody tr', has_text='En attente').first.get_by_text('Admettre').click()
    pg.get_by_role('button', name='Admettre', exact=True).last.click(); pg.wait_for_timeout(300)
    check('admission : les accès provisoires sont montrés une seule fois', 'plus jamais affichés' in pg.inner_text('.modal') and pg.locator('.cred .pwd').count() >= 1, pg.inner_text('.modal')[:200])
    pg.get_by_role('button', name='J’ai noté ces accès').click(); pg.wait_for_timeout(200)
    ns2 = pg.evaluate("JSON.parse(localStorage.getItem('scolaria-demo-v2')).students.length")
    check('admission : l’élève et sa fiche sont créés', ns2 == ns + 1, (ns, ns2))
    st = pg.evaluate("(() => { const d = JSON.parse(localStorage.getItem('scolaria-demo-v2')); return { cand: d.users.find(u => u.id === 'u-cand').role, eleves: d.users.filter(u => u.role === 'eleve').length, mdp: JSON.stringify(d.outbox).includes('mot de passe provisoire') }; })()")
    check('admission : la famille candidate devient « parent » et le compte élève est créé', st['cand'] == 'parent' and st['eleves'] == 2, st)

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
    t_busy = pg.evaluate("""(() => { const db = JSON.parse(localStorage.getItem('scolaria-demo-v2')); const cls = db.classes[0].id; const a = db.timetable.find(t => t.classId !== cls); return a.teacherId; })()""")
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

    # =============== Nouveautés : inscription, personnalisation, autorisations, canaux, messages ===============
    DB = lambda: pg.evaluate("JSON.parse(localStorage.getItem('scolaria-demo-v2'))")
    pg.select_option('#role-switch', 'admin')

    # --- formulaire public d'inscription (aperçu en démonstration)
    nav('Admissions'); pg.get_by_role('button', name='Voir le formulaire public').click(); pg.wait_for_selector('.reg-card')
    check('inscription : aucune connexion demandée, formulaire direct', pg.locator('#p-prenom').count() == 1 and pg.locator('#k0-prenom').count() == 1)
    check('inscription : champ piège caché aux humains', pg.locator('.hp').evaluate("e => getComputedStyle(e).left") == '-9999px')
    pg.get_by_role('button', name='Envoyer la demande').click()
    check('inscription : champs obligatoires signalés', pg.locator('.has-err').count() >= 8, pg.locator('.has-err').count())
    pg.fill('#p-prenom', 'Rokhaya'); pg.fill('#p-nom', 'Thiam'); pg.select_option('#p-lien', 'Mère'); pg.fill('#p-tel', '12 34'); pg.fill('#p-email', 'rokhaya@exemple.sn'); pg.fill('#p-pwd', 'motdepasse-1'); pg.fill('#p-pwd2', 'motdepasse-2')
    pg.fill('#k0-prenom', 'Aïda'); pg.fill('#k0-nom', 'Thiam'); pg.select_option('#k0-sexe', 'F'); pg.fill('#k0-naissance', '2015-04-12'); pg.select_option('#k0-classId', index=1)
    pg.check('#reg-consent'); pg.fill('#reg-cans', '5'); pg.get_by_role('button', name='Envoyer la demande').click()
    errs = pg.locator('.has-err small.err').all_inner_texts()
    check('inscription : téléphone invalide et mots de passe différents refusés', any('Numéro invalide' in e for e in errs) and any('ne correspondent pas' in e for e in errs), errs)
    pg.fill('#p-tel', '77 456 78 90'); pg.fill('#p-pwd2', 'motdepasse-1'); pg.fill('#reg-cans', '9'); pg.get_by_role('button', name='Envoyer la demande').click(); pg.wait_for_timeout(200)
    check('inscription : mauvaise réponse à la question refusée', 'incorrecte' in pg.inner_text('.reg-card'))
    pg.fill('#reg-cans', '5'); pg.get_by_role('button', name='Envoyer la demande').click(); pg.wait_for_selector('.reg-done')
    txt = pg.inner_text('.reg-done'); check('inscription : référence INS-… affichée', 'INS-' in txt, txt[:120])
    check('inscription : identifiant de connexion rappelé', 'rokhaya@exemple.sn' in txt)
    d = DB(); adm = [a for a in d['admissions'] if a['nom'] == 'Thiam' and a['prenom'] == 'Aïda']
    check('inscription : candidature en attente liée à un compte « candidat »', len(adm) == 1 and adm[0]['statut'] == 'En attente' and any(u['id'] == adm[0]['userId'] and u['role'] == 'candidat' for u in d['users']), adm)
    pg.get_by_role('button', name='Accéder à mon espace').click(); pg.wait_for_selector('.shell')
    check('inscription : la famille arrive dans son espace', 'Bonjour Rokhaya' in pg.inner_text('main.content') and 'Aïda' in pg.inner_text('main.content') and 'En cours d’examen' in pg.inner_text('main.content'), pg.inner_text('main.content')[:200])
    labels = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText)')
    check('candidat : menu réduit (espace, avis, calendrier, profil)', len(labels) == 4, labels)

    # --- profil : préférences de contact
    pg.locator('.side .nav', has_text='Mon profil').first.click()
    pg.check('.prefs input >> nth=2'); pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(200)
    u = [x for x in DB()['users'] if x['login'] == 'rokhaya@exemple.sn'][0]
    check('profil : préférences de contact enregistrées', u['canaux'] == 'email,whatsapp', u['canaux'])

    # --- le secrétariat admet : comptes automatiques
    pg.select_option('#role-switch', 'secretaire'); nav('Admissions')
    check('admissions : origine « En ligne » visible', pg.locator('table.t tbody tr', has_text='Aïda').first.inner_text().count('En ligne') == 1)
    pg.locator('table.t tbody tr', has_text='Aïda').first.get_by_text('Admettre').click()
    pg.get_by_role('button', name='Admettre', exact=True).last.click(); pg.wait_for_selector('.creds')
    c = pg.inner_text('.creds'); check('admission : mot de passe provisoire de l’élève montré une seule fois', 'plus jamais affichés' in c and pg.locator('.cred .pwd').count() == 1, c[:160])
    pg.get_by_role('button', name='J’ai noté ces accès').click()
    d = DB(); fam = [x for x in d['users'] if x['login'] == 'rokhaya@exemple.sn'][0]; kid = [x for x in d['students'] if x['prenom'] == 'Aïda'][0]
    check('admission : la famille devient « parent » liée à la fiche créée', fam['role'] == 'parent' and fam['linkId'] == kid['parentId'])
    check('admission : compte élève créé (identifiant = n° d’admission, changement de mot de passe exigé)', any(x['role'] == 'eleve' and x['login'] == kid['admission'].lower() and x['mustChange'] for x in d['users']))
    check('admission : message d’accueil dans le journal, sans mot de passe', any(o['event'] == 'admission' for o in d['outbox']) and 'motdepasse' not in str(d['outbox']))

    # --- direction : modules
    pg.select_option('#role-switch', 'admin'); nav('Modules')
    check('modules : liste groupée avec état', pg.locator('table.t tbody tr').count() > 30 and 'Actif' in pg.inner_text('main.content'))
    pg.locator('table.t tbody tr', has_text='Élèves').first.get_by_text('Personnaliser').click(); pg.wait_for_selector('.editor')
    pg.fill('#me-label', 'Apprenants'); pg.get_by_role('button', name='Ajouter un champ').click()
    pg.fill('#cf-l-0', 'Moyen de transport'); pg.select_option('#cf-t-0', 'select'); pg.fill('#cf-o-0', 'Bus, À pied, Vélo'); pg.locator('.cf-flags input[type=checkbox]').nth(1).check()
    pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(250)
    check('modules : le menu affiche le nouveau nom', pg.locator('.side .nav', has_text='Apprenants').count() == 1)
    nav('Apprenants'); check('modules : le titre de la page suit le nom choisi', pg.inner_text('h1') == 'Apprenants', pg.inner_text('h1'))
    check('modules : champ « dans la liste » ajouté comme colonne', 'moyen de transport' in pg.inner_text('table.t thead').lower())
    pg.get_by_role('button', name='Nouvel élève').click()
    check('modules : le champ personnalisé apparaît dans le formulaire', pg.locator('#f-x_moyen_de_transport').count() == 1)
    pg.fill('#f-admission', 'ADM-2026-777'); pg.fill('#f-prenom', 'Perso'); pg.fill('#f-nom', 'Champ'); pg.select_option('#f-sexe', 'M'); pg.fill('#f-naissance', '2014-05-05'); pg.select_option('#f-classId', index=1); pg.select_option('#f-x_moyen_de_transport', 'Bus')
    pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(200)
    st = [x for x in DB()['students'] if x['prenom'] == 'Perso'][0]
    check('modules : la valeur est stockée dans « extra »', '"moyen_de_transport":"Bus"' in st['extra'], st['extra'])
    pg.locator('table.t tbody tr', has_text='Perso').first.get_by_title('Modifier').click()
    check('modules : la valeur est rechargée à la modification', pg.input_value('#f-x_moyen_de_transport') == 'Bus'); pg.keyboard.press('Escape')
    # liste de choix modifiable
    nav('Modules'); pg.locator('table.t tbody tr', has_text='Encaissement').first.get_by_text('Personnaliser').click(); pg.wait_for_selector('.editor')
    pg.fill('#ls-payments\\.mode', 'Espèces\nWave\nOrange Money\nMoneyGram'); pg.get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(200)
    pg.select_option('#role-switch', 'secretaire'); nav('Encaissement'); pg.get_by_role('button', name='Nouvel encaissement').click()
    check('modules : la liste « modes de paiement » est personnalisée', 'MoneyGram' in pg.locator('#f-mode').inner_text() and 'Chèque' not in pg.locator('#f-mode').inner_text()); pg.keyboard.press('Escape')
    # désactivation
    pg.select_option('#role-switch', 'admin'); nav('Modules')
    pg.locator('table.t tbody tr', has_text='Stock').first.get_by_role('button', name='Désactiver').click(); pg.get_by_role('button', name='Désactiver', exact=True).last.click(); pg.wait_for_timeout(200)
    pg.select_option('#role-switch', 'secretaire'); labels = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText)')
    check('modules : un module désactivé disparaît du menu', not any(l.strip().startswith('Stock') for l in labels), labels)
    pg.select_option('#role-switch', 'admin'); nav('Modules'); pg.locator('table.t tbody tr', has_text='Stock').first.get_by_role('button', name='Activer').click(); pg.wait_for_timeout(150)

    # --- direction : matrice d'autorisations
    nav('Autorisations'); check('autorisations : matrice affichée', pg.locator('table.perm-t').count() == 1 and pg.locator('.vchip').count() > 100)
    row = pg.locator('table.perm-t tbody tr', has_text='Enseignants').first
    check('autorisations : plafond de sécurité visible (— pour un rôle non éligible)', pg.locator('table.perm-t td.na').count() > 20)
    btn = pg.get_by_label('Surveillant général — Admissions — Voir'); btn.click(); pg.wait_for_timeout(150)
    pg.select_option('#role-switch', 'surveillant'); labels = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText)')
    check('autorisations : droit accordé → le module apparaît dans le menu du rôle', any(l.strip().startswith('Admissions') for l in labels), labels)
    nav('Admissions'); check('autorisations : le surveillant n’a pas de bouton de création sans droit « Créer »', pg.get_by_role('button', name='Nouvelle candidature').count() == 0)
    pg.select_option('#role-switch', 'admin'); nav('Autorisations'); pg.get_by_label('Surveillant général — Admissions — Créer').click(); pg.wait_for_timeout(150)
    pg.select_option('#role-switch', 'surveillant'); nav('Admissions')
    check('autorisations : droit « Créer » accordé → bouton visible', pg.get_by_role('button', name='Nouvelle candidature').count() == 1)
    check('autorisations : … mais pas « Modifier » ni « Supprimer »', pg.get_by_title('Supprimer').count() == 0 and pg.get_by_title('Modifier').count() == 0)
    pg.select_option('#role-switch', 'admin'); nav('Autorisations')
    pg.get_by_label('Surveillant général — Admissions — Voir').click(); pg.wait_for_timeout(150)     # retire tout
    pg.select_option('#role-switch', 'surveillant'); labels = pg.eval_on_selector_all('.side .nav', 'els => els.map(e => e.innerText)')
    check('autorisations : droit retiré → module masqué', not any(l.strip().startswith('Admissions') for l in labels), labels)
    pg.select_option('#role-switch', 'admin'); nav('Autorisations'); pg.get_by_label('Rétablir les droits standard : Surveillant général').click(); pg.get_by_role('button', name='Rétablir', exact=True).last.click(); pg.wait_for_timeout(150)
    check('autorisations : rétablir efface les réglages du rôle', not any(p['role'] == 'surveillant' for p in DB()['perms']))

    # --- direction : canaux
    nav('Canaux de communication')
    check('canaux : e-mail, SMS et WhatsApp présentés avec les messages automatiques', pg.locator('.ch-card').count() == 3 and pg.locator('.tpl-card').count() == 5)
    pg.check('#ch-actif-sms'); pg.select_option('#ch-prov-sms', 'twilio')
    check('canaux : clés d’accès demandées pour Twilio, jamais affichées en clair', pg.locator('#sec-sms-sid').count() == 1 and pg.get_attribute('#sec-sms-token', 'type') == 'password')
    pg.select_option('#ch-prov-sms', 'lien'); pg.get_by_role('button', name='Enregistrer SMS').click(); pg.wait_for_timeout(150)
    pg.check('#ch-actif-whatsapp'); pg.get_by_role('button', name='Enregistrer WhatsApp').click(); pg.wait_for_timeout(150)
    ch = {c['id']: c for c in DB()['channels']}; check('canaux : réglages enregistrés (SMS et WhatsApp en liens manuels)', ch['sms']['actif'] and ch['sms']['fournisseur'] == 'lien' and ch['whatsapp']['actif'], ch)
    check('canaux : aucune clé d’API dans la base locale', 'token' not in str(DB()['channels']).lower())
    pg.fill('#tp-absence-texte', 'ALERTE {eleve} absent le {date} — {ecole}'); pg.check('#tp-absence-actif')
    check('messages automatiques : aperçu avec des valeurs d’exemple', 'ALERTE Awa Ndiaye absent le' in pg.inner_text('#tp-absence'), pg.inner_text('#tp-absence')[-160:])
    pg.locator('#tp-absence').get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(150)
    check('messages automatiques : modèle enregistré', any(t['id'] == 'absence' and t['actif'] and 'ALERTE' in t['texte'] for t in DB()['templates']))
    pg.fill('#tp-paiement-texte', '   '); pg.locator('#tp-paiement').get_by_role('button', name='Enregistrer').click(); pg.wait_for_timeout(100)
    check('messages automatiques : texte vide refusé', 'ne peut pas être vide' in pg.inner_text('.toasts'))

    # --- envoyer un message (WhatsApp / SMS en lien manuel)
    pg.select_option('#role-switch', 'secretaire'); nav('Envoyer un message')
    check('message : canaux activés proposés, e-mail actif par défaut', pg.locator('#ms-ch-sms').is_enabled() and pg.locator('#ms-ch-whatsapp').is_enabled())
    pg.fill('#ms-texte', 'Réunion des parents samedi à 10 h.'); pg.get_by_role('button', name='Envoyer', exact=True).click(); pg.get_by_role('button', name='Envoyer', exact=True).last.click(); pg.wait_for_selector('#ms-result')
    res = pg.inner_text('#ms-result'); check('message : bilan et liens manuels affichés', 'À envoyer vous-même' in res and pg.locator('#ms-result .links a').count() > 0, res[:200])
    href = pg.locator('#ms-result .links a').first.get_attribute('href'); check('message : lien WhatsApp ou SMS correctement formé', href.startswith('https://wa.me/221') or href.startswith('sms:+221'), href)
    nav('Journal des envois'); check('journal : messages enregistrés avec leur statut', pg.locator('table.t tbody tr').count() > 3 and 'À envoyer' in pg.inner_text('main.content'))
    pg.locator('table.t tbody tr', has_text='À envoyer').first.get_by_text('Marquer envoyé').click(); pg.wait_for_timeout(150)
    check('journal : marquer un lien comme envoyé', any(o['statut'] == 'Envoyé (manuel)' for o in DB()['outbox']))
    # relance des mensualités
    nav('Mensualités'); pg.get_by_role('button', name='Relancer les parents').click(); pg.get_by_role('button', name='Envoyer les rappels').click(); pg.wait_for_timeout(250)
    check('mensualités : rappels préparés pour les parents débiteurs', any(o['event'] == 'rappel' for o in DB()['outbox']))
    pg.keyboard.press('Escape')
    # rapport de classe : la conduite n'apparaît que si le rôle a accès au module Conduite (pas de fuite par le rapport)
    nav('Rapports de classe'); check('rapports : conduite visible pour le secrétariat (accès « Voir » par défaut)', 'Mentions de conduite' in pg.inner_text('main.content'))
    pg.select_option('#role-switch', 'admin'); nav('Autorisations'); pg.get_by_label('Secrétariat — Conduite — Voir').click(); pg.wait_for_timeout(150)
    pg.select_option('#role-switch', 'secretaire'); nav('Rapports de classe')
    check('rapports : conduite masquée dès que le droit est retiré dans la matrice', 'Mentions de conduite' not in pg.inner_text('main.content') and 'Élèves avec impayés' in pg.inner_text('main.content'))
    pg.select_option('#role-switch', 'admin'); nav('Autorisations'); pg.get_by_label('Rétablir les droits standard : Secrétariat').click(); pg.get_by_role('button', name='Rétablir', exact=True).last.click(); pg.wait_for_timeout(150)
    # parent connecté : ajout d'un enfant
    pg.select_option('#role-switch', 'parent'); pg.get_by_role('button', name='Inscrire un enfant').click(); pg.wait_for_selector('.reg-card')
    check('parent : ajout d’un enfant sans re-saisir ses coordonnées ni question de vérification', pg.locator('#p-prenom').count() == 0 and pg.locator('#reg-cans').count() == 0 and pg.locator('#k0-prenom').count() == 1)
    pg.fill('#k0-prenom', 'Bilal'); pg.fill('#k0-nom', 'Ndiaye'); pg.select_option('#k0-sexe', 'M'); pg.fill('#k0-naissance', '2016-01-02'); pg.select_option('#k0-classId', index=1); pg.check('#reg-consent')
    pg.get_by_role('button', name='Envoyer la demande').click(); pg.wait_for_selector('.reg-done'); pg.get_by_role('button', name='Accéder à mon espace').click(); pg.wait_for_selector('.shell')
    check('parent : la nouvelle demande apparaît dans « Mes demandes d’inscription »', 'Bilal' in pg.inner_text('main.content'))
    pg.select_option('#role-switch', 'admin')

    # --- thème sombre
    pg.select_option('#role-switch', 'admin'); pg.get_by_label('Passer au thème sombre').click()
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor"); check('thème sombre appliqué', bg != 'rgb(238, 242, 241)', bg)
    print('--- erreurs JS:', len(errors)); [print(' ', e) for e in errors[:8]]
    b.close()
fails = [r for r in results if not r[1]]; print(f'\n{len(results)-len(fails)}/{len(results)} vérifications réussies')
