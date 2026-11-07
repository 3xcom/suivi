# Suivi 3xCom

Application de suivi de tâches de l'agence 3xCom : Supabase (base + comptes), PWA installable (mobile et ordinateur), publication sur GitHub Pages, notifications par e-mail via Resend.

## 1. Base de données (Supabase)
1. Créez un projet Supabase, ouvrez **SQL Editor** et exécutez `supabase/schema.sql`.
   (Base créée avec une version précédente : exécutez plutôt `supabase/migration_assignations_sous_taches.sql`.)
2. **Project Settings > API** : copiez l'URL du projet et la clé « anon public » dans `config.js` (cette clé est publique par conception ; la sécurité repose sur les règles d'accès SQL).
3. Créez votre compte en premier : il devient administrateur. Les suivants restent « en attente » jusqu'à validation dans l'onglet Équipe.

## 2. Publication sur GitHub Pages
1. Poussez le dossier dans un dépôt GitHub (branche `main`).
2. Dépôt > **Settings > Pages > Build and deployment > Source : GitHub Actions**.
3. Chaque `git push` sur `main` redéploie le site via `.github/workflows/pages.yml` (seuls les fichiers publics sont publiés, pas `supabase/`). Adresse : `https://<compte>.github.io/<dépôt>/`.
4. Supabase > **Authentication > URL Configuration** : renseignez cette adresse dans *Site URL* et ajoutez-la dans *Redirect URLs*.

## 3. Installer l'application (PWA)
Le bouton « Installer 3xCom » s'affiche automatiquement (menu latéral, barre du haut sur mobile, écran de connexion) :
- **Chrome, Edge (ordinateur) et Android** : installation en un clic, l'application s'ouvre dans sa propre fenêtre.
- **Safari sur Mac (17+)** : le bouton explique Fichier > Ajouter au Dock.
- **iPhone / iPad (Safari)** : le bouton explique Partager > Sur l'écran d'accueil.
- Le bouton disparaît une fois l'application installée ou si le navigateur ne la propose pas.
L'installation exige HTTPS (GitHub Pages le fournit) : elle ne fonctionne pas en double-cliquant sur `index.html`.

### Dictée vocale
Le bouton **Demande par vocal** permet aux clients de dicter leur besoin sans choisir de pôle; l’agence l’orientera. Une date évoquée dans la dictée (par exemple « demain », « dans trois jours » ou « avant le 15 juin ») préremplit la date souhaitée. Une mention d’urgence (« c’est urgent », « au plus vite ») préremplit aussi la priorité. **Tâche par vocal** prépare une tâche pour les personnes autorisées à la créer. La personne démarre puis termine explicitement sa dictée et relit le formulaire avant de l’envoyer. La transcription affiche les mots reconnus en direct, peut reprendre l’écoute après une interruption et reste modifiable. Pour joindre aussi l’audio à une demande, cochez l’option proposée. La dictée nécessite un navigateur compatible (Chrome ou Edge recommandé), HTTPS et l’autorisation du micro.

Exécutez `supabase/migration_audio_demandes.sql` dans l’éditeur SQL du projet Supabase après la mise en place des tables `demandes` et `membres_client`. Elle autorise les demandes sans pôle, ajoute les règles d’accès permettant à un client actif de créer une demande pour son groupe et de consulter ses propres demandes, puis configure l’envoi facultatif d’audio. Les fichiers sont conservés dans un espace privé; seul le demandeur et le personnel connecté peuvent les lire. L’enregistrement est facultatif et limité à 25 Mo.

## 4. Notifications par e-mail (Resend)
E-mails envoyés : nouvelle tâche assignée, tâche passée « en relecture » (admins et responsables du pôle), nouvelle demande d'accès (admins), compte activé, et un rappel quotidien des retards/échéances. Chaque personne peut tout désactiver avec la case en bas de l'Accueil.

Le navigateur ne doit jamais contenir la clé Resend : les e-mails partent d'une fonction Edge Supabase, déclenchée par la base.
1. **Resend** : créez un compte, vérifiez votre domaine d'envoi (sans domaine vérifié, Resend n'envoie qu'à votre propre adresse), créez une clé API.
2. **Fonction** (CLI Supabase) :
   ```
   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="3xCom <notifications@votre-domaine.com>" NOTIF_SECRET=un-secret-long APP_URL=https://<compte>.github.io/<dépôt>/
   supabase functions deploy notifier --no-verify-jwt
   ```
   (Sans CLI : Dashboard > Edge Functions > créer `notifier`, coller `supabase/functions/notifier/index.ts`, désactiver « Verify JWT », puis ajouter les 4 secrets.)
3. **Base** : exécutez `supabase/notifications.sql`, puis, avec l'adresse de la fonction et le même secret :
   ```sql
   insert into public.reglages_serveur values
     ('url_fonction', 'https://<projet>.supabase.co/functions/v1/notifier'),
     ('secret', 'un-secret-long');
   ```
4. **Rappels quotidiens** (facultatif) : activez l'extension `pg_cron` (Database > Extensions) puis décommentez le bloc `cron.schedule` en fin de `notifications.sql`.

## Dépannage : page blanche ou message « Chargement impossible »
Ouvrez la console du navigateur (F12 > Console) et regardez le message :
- « Configuration requise » : `config.js` contient encore les valeurs d'exemple, ou il manque `URL_SUPABASE` / `CLE_ANON_SUPABASE`.
- `config.js` introuvable (erreur 404) : le fichier n'a pas été envoyé sur GitHub (vérifiez qu'il apparaît dans le dépôt).
- « bibliothèque Supabase » : un bloqueur de contenu ou une coupure réseau empêche le chargement depuis jsDelivr.
- Après une mise à jour, rechargement forcé (Ctrl+Maj+R) ; au besoin F12 > Application > Service Workers > Unregister.

## 5. Essai en local
`python3 -m http.server 8080` dans ce dossier, puis http://localhost:8080 (ajoutez cette adresse dans les *Redirect URLs* Supabase).

## 6. Repères de nommage (tout est en français)
- Base : `profils`, `poles`, `membres_pole`, `taches`, `assignations`, `sous_taches` ; statuts `a_faire` / `en_cours` / `relecture` / `terminee` ; rôles `admin` / `responsable` / `membre` ; priorités `basse` / `normale` / `haute`.
- Code : `ETAT`, `afficher()`, `chargerTout()`, `vues.*`, `formulaireTache()`, `enregistrerTache()`, `peutGerer()`, `peutModifier()`…
- Une tâche peut avoir plusieurs assignés et des sous-tâches ; avec des sous-tâches, la progression se calcule automatiquement.
