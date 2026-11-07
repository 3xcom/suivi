// Suivi 3xCom — application de suivi de tâches de l’agence 3xCom (voir README.md).
// Filet de sécurité : une erreur au démarrage affiche un message au lieu d'une page blanche
function signalerErreurDemarrage(message) {
  const racine = document.getElementById('application');
  if (!racine || racine.children.length) return;
  racine.innerHTML = '<div class="centre"><h1>Chargement impossible</h1><p class="discret"></p></div>';
  racine.querySelector('p').textContent = message;
}
window.addEventListener('error', evenement => signalerErreurDemarrage('Erreur inattendue : ' + evenement.message + ' (ouvrez la console du navigateur, touche F12, pour le détail).'));
window.addEventListener('unhandledrejection', evenement => signalerErreurDemarrage('Erreur inattendue : ' + (evenement.reason && evenement.reason.message || evenement.reason)));
// config.js définit window.SUIVI_3XCOM (les anciens noms CADENCE, SUPABASE_URL et SUPABASE_ANON_KEY restent acceptés)
const configuration = window.SUIVI_3XCOM || window.CADENCE || {};
const URL_SUPABASE = configuration.URL_SUPABASE || configuration.SUPABASE_URL || '';
const CLE_ANON_SUPABASE = configuration.CLE_ANON_SUPABASE || configuration.SUPABASE_ANON_KEY || '';
const trouver = (selecteur, racine = document) => racine.querySelector(selecteur);
const echapper = texte => String(texte ?? '').replace(/[&<>"']/g, caractere => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[caractere]);
const STATUTS = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  relecture: 'En relecture',
  terminee: 'Terminée'
};
const PRIORITES = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute'
};
const ROLES = {
  admin: 'Administrateur',
  responsable: 'Responsable de pôle',
  membre: 'Membre'
};
const COULEURS = ['#8E1F45', '#2C5AA0', '#2C7A63', '#B7791F', '#6A3FA0', '#1F2937'];
const ICONES = {
  accueil: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  taches: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  poles: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.3 2.3 3.6 5"/>'
};
ICONES.tableau = '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>';
ICONES.agenda = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
const icone = nom => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nom]}</svg>`;
const formatIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const aujourdhui = () => formatIso(new Date());
const ORDRE_STATUTS = ['a_faire', 'en_cours', 'relecture', 'terminee'];
const formaterDate = date => date ? new Date(date + 'T00:00').toLocaleDateString('fr-FR', {
  day: 'numeric',
  month: 'short'
}) : 'Sans échéance';
const initiales = nom => (nom || '?').split(/\s+/).map(mot => mot[0]).slice(0, 2).join('').toUpperCase();
const nomDe = utilisateur => utilisateur ? utilisateur.nom_complet || utilisateur.email : 'Non assignée';
let bdd, invitationInstallation;
// --- Installation de l'application (PWA) ---
const ICONE_INSTALLER = '<svg class="icone-cta" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16"/></svg>';
const estInstallee = () => ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(mode => window.matchMedia && window.matchMedia(`(display-mode: ${mode})`).matches) || navigator.standalone === true;
const estIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
const estSafariMac = () => /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent) && navigator.platform === 'MacIntel' && !(navigator.maxTouchPoints > 1);
const installationPossible = () => !estInstallee() && Boolean(invitationInstallation || estIos() || estSafariMac());
const boutonInstaller = (classes = 'bouton fantome', libelle = 'Installer l’application') => `<button type="button" class="${classes} cta-installer" data-action="installer" hidden>${ICONE_INSTALLER}${libelle}</button>`;
const majInstallation = () => document.querySelectorAll('.cta-installer').forEach(bouton => {
  bouton.hidden = !installationPossible();
});
const preferencesNotifications = () => 'notifications_email' in ETAT.moi ? `<label class="preference"><input type="checkbox" data-notif ${ETAT.moi.notifications_email ? 'checked' : ''}>Recevoir les notifications de tâches par e-mail</label>` : '';
async function installer() {
  if (invitationInstallation) {
    const invitation = invitationInstallation;
    invitationInstallation = null;
    invitation.prompt();
    await invitation.userChoice;
    majInstallation();
  } else if (estSafariMac()) {
    ouvrirModale(`<div class="formulaire-modale"><h2>Installer 3xCom</h2><p class="discret">Sur Mac, depuis Safari (version 17 ou plus) :</p>
    <ol class="etapes-install"><li>Ouvrez le menu <b>Fichier</b>.</li><li>Choisissez <b>Ajouter au Dock…</b></li><li>Validez avec <b>Ajouter</b> : 3xCom s’ouvre ensuite dans sa propre fenêtre.</li></ol>
    <div class="actions"><button type="button" class="bouton" data-action="fermer">Compris</button></div></div>`);
  } else if (estIos()) {
    ouvrirModale(`<div class="formulaire-modale"><h2>Installer 3xCom</h2><p class="discret">Sur iPhone et iPad, depuis Safari :</p>
    <ol class="etapes-install"><li>Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li><li>Faites défiler et choisissez <b>Sur l’écran d’accueil</b>.</li><li>Touchez <b>Ajouter</b> : 3xCom apparaît comme une application.</li></ol>
    <div class="actions"><button type="button" class="bouton" data-action="fermer">Compris</button></div></div>`);
  }
}
const ETAT = {
  utilisateur: null,
  moi: null,
  poles: [],
  profils: [],
  liens: [],
  taches: [],
  assignations: [],
  sousTaches: [],
  vue: 'accueil',
  filtres: {
    pole: '',
    qui: '',
    statut: '',
    miennes: false
  },
  mode: 'connexion',
  abonne: false,
  calendrier: {
    annee: new Date().getFullYear(),
    mois: new Date().getMonth()
  },
  jour: aujourdhui()
};
const poleDe = id => ETAT.poles.find(pole => pole.id === id);
const utilisateurDe = id => ETAT.profils.find(utilisateur => utilisateur.id === id);
const enRetard = tache => tache.echeance && tache.echeance < aujourdhui() && tache.statut !== 'terminee';
const estAdmin = () => ETAT.moi.role === 'admin';
const estDansPole = id => ETAT.liens.some(lien => lien.pole_id === id && lien.utilisateur_id === ETAT.moi.id);
const peutGerer = id => estAdmin() || ETAT.moi.role === 'responsable' && estDansPole(id);
const idsAssignes = idTache => ETAT.assignations.filter(assignation => assignation.tache_id === idTache).map(assignation => assignation.utilisateur_id);
const estAssigne = (tache, idUtilisateur) => idsAssignes(tache.id).includes(idUtilisateur);
const assignesDe = tache => idsAssignes(tache.id).map(utilisateurDe).filter(Boolean);
const nomsAssignes = tache => {
  const liste = assignesDe(tache);
  return liste.length ? liste.map(nomDe).join(', ') : 'Non assignée';
};
const sousTachesDe = idTache => ETAT.sousTaches.filter(sousTache => sousTache.tache_id === idTache);
const resumeSousTaches = tache => {
  const liste = sousTachesDe(tache.id);
  return liste.length ? `${liste.filter(sousTache => sousTache.terminee).length}/${liste.length} sous-tâches` : '';
};
const peutModifier = tache => peutGerer(tache.pole_id) || estAssigne(tache, ETAT.moi.id);
const polesGeres = () => ETAT.poles.filter(pole => peutGerer(pole.id));
const parEcheance = (premiere, seconde) => (premiere.statut === 'terminee') - (seconde.statut === 'terminee') || (premiere.echeance || '9').localeCompare(seconde.echeance || '9');
const moyenne = taches => taches.length ? Math.round(taches.reduce((somme, tache) => somme + tache.progression, 0) / taches.length) : 0;
function notifier(message, estErreur) {
  const element = document.createElement('div');
  element.className = 'notification' + (estErreur ? ' alerte' : '');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 3400);
}
const ouvrirModale = html => {
  trouver('#dialogue').innerHTML = html;
  trouver('#dialogue').showModal();
};
const fermerModale = () => trouver('#dialogue').open && trouver('#dialogue').close();

/* ---------- Démarrage ---------- */
function initialiser() {
  if (!URL_SUPABASE || !CLE_ANON_SUPABASE || URL_SUPABASE.includes('VOTRE')) {
    trouver('#application').innerHTML = '<div class="centre"><div class="logo" style="color:var(--encre)">3xCom</div><h1>Configuration requise</h1><p class="discret">Le fichier <b>config.js</b> est introuvable ou incomplet : renseignez <b>URL_SUPABASE</b> et <b>CLE_ANON_SUPABASE</b> (Supabase &gt; Project Settings &gt; API), puis redéployez.</p></div>';
    return;
  }
  if (!window.supabase) {
    signalerErreurDemarrage('La bibliothèque Supabase n’a pas pu être chargée : vérifiez la connexion internet ou un bloqueur de publicités/contenu.');
    return;
  }
  bdd = window.supabase.createClient(URL_SUPABASE, CLE_ANON_SUPABASE);
  bdd.auth.onAuthStateChange((evenement, session) => {
    if (evenement === 'TOKEN_REFRESHED' || evenement !== 'INITIAL_SESSION' && session?.user?.id === ETAT.utilisateur?.id && session) return;
    setTimeout(() => demarrerSession(session), 0);
  });
}
async function demarrerSession(session) {
  ETAT.utilisateur = session?.user || null;
  if (!ETAT.utilisateur) {
    ETAT.moi = null;
    return vueConnexion();
  }
  await chargerTout();
  if (!ETAT.moi) return vueAttente('Profil introuvable. Contactez un administrateur.');
  if (!ETAT.moi.actif) return vueAttente('Votre compte est en attente de validation par un administrateur.');
  if (!ETAT.abonne) {
    ETAT.abonne = true;
    let minuteur;
    const surChangement = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(recharger, 400);
    };
    let canal = bdd.channel('suivi');
    ['taches', 'assignations', 'sous_taches'].forEach(table => {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table }, surChangement);
    });
    canal.subscribe();
  }
  afficher();
}
async function chargerTout() {
  const [resProfils, resPoles, resLiens, resTaches, resAssignations, resSousTaches] = await Promise.all([bdd.from('profils').select('*').order('nom_complet'), bdd.from('poles').select('*').order('nom'), bdd.from('membres_pole').select('*'), bdd.from('taches').select('*'), bdd.from('assignations').select('*'), bdd.from('sous_taches').select('*').order('position')]);
  ETAT.profils = resProfils.data || [];
  ETAT.poles = resPoles.data || [];
  ETAT.liens = resLiens.data || [];
  ETAT.taches = resTaches.data || [];
  ETAT.assignations = resAssignations.data || [];
  ETAT.sousTaches = resSousTaches.data || [];
  ETAT.moi = ETAT.profils.find(utilisateur => utilisateur.id === ETAT.utilisateur.id);
}
async function recharger() {
  if (ETAT.moi?.actif) {
    await chargerTout();
    if (!trouver('#dialogue').open) afficher();
  }
}

/* ---------- Écrans ---------- */
function vueConnexion() {
  const estInscription = ETAT.mode === 'inscription';
  trouver('#application').innerHTML = `<div class="connexion"><section class="connexion-marque"><div class="logo">3xCom</div><p class="serif">L’agence 3xCom, tâche après tâche.</p></section>
  <section class="connexion-formulaire"><form id="formulaire-connexion"><h2>${estInscription ? 'Créer un compte' : 'Connexion'}</h2><p class="discret">${estInscription ? 'Un administrateur validera votre accès.' : 'Retrouvez vos tâches et vos pôles.'}</p>
  ${estInscription ? '<label for="champ-nom-complet">Nom complet</label><input id="champ-nom-complet" name="nom_complet" required autocomplete="name">' : ''}
  <label for="champ-email">Adresse e-mail</label><input id="champ-email" name="email" type="email" required autocomplete="email">
  <label for="champ-mot-de-passe">Mot de passe</label><input id="champ-mot-de-passe" name="password" type="password" minlength="6" required autocomplete="${estInscription ? 'new-password' : 'current-password'}">
  <p class="erreur" id="erreur" role="alert"></p><button class="bouton" style="width:100%;justify-content:center">${estInscription ? 'Créer mon compte' : 'Se connecter'}</button>
  <button type="button" class="lien" data-action="basculer_mode">${estInscription ? 'J’ai déjà un compte' : 'Créer un compte'}</button>${boutonInstaller('bouton fantome cta-large', 'Installer l’application')}</form></section></div>`;
}
function vueAttente(message) {
  trouver('#application').innerHTML = `<div class="centre"><div class="logo" style="color:var(--encre)">3xCom</div><h1>Presque prêt</h1><p class="discret">${echapper(message)}</p><button class="bouton fantome" data-action="deconnexion">Se déconnecter</button>${boutonInstaller()}</div>`;
}
function afficher() {
  const entreesNav = [['accueil', 'Accueil'], ['taches', 'Tâches'], ['tableau', 'Tableau'], ['agenda', 'Agenda'], ['poles', 'Pôles'], ...(estAdmin() ? [['equipe', 'Équipe']] : [])];
  if (!entreesNav.some(nom => nom[0] === ETAT.vue)) ETAT.vue = 'accueil';
  const moi = ETAT.moi;
  trouver('#application').innerHTML = `<aside><div class="logo">3xCom</div><nav>${entreesNav.map(([cle, libelle]) => `<button class="menu ${ETAT.vue === cle ? 'actif' : ''}" data-action="navigation" data-vue="${cle}">${icone(cle)}${libelle}</button>`).join('')}</nav>
  <div class="moi"><div><b>${echapper(nomDe(moi))}</b>${ROLES[moi.role]}</div>${boutonInstaller('bouton clair cta-large', 'Installer 3xCom')}<button data-action="deconnexion">Se déconnecter</button></div></aside>
  <div class="coque"><header class="barre-haute"><div class="logo">3xCom</div><div class="barre-actions">${boutonInstaller('cta-mini', 'Installer')}<button data-action="deconnexion">Quitter</button></div></header>
  <main>${vues[ETAT.vue]()}</main>
  <nav class="barre-basse">${entreesNav.map(([cle, libelle]) => `<button class="onglet ${ETAT.vue === cle ? 'actif' : ''}" data-action="navigation" data-vue="${cle}">${icone(cle)}${libelle.split(' ')[0]}</button>`).join('')}</nav></div>`;
}
const enTete = (titre, sousTitre, action = '') => `<div class="entete"><div><h1>${titre}</h1><p>${sousTitre}</p></div>${action}</div>`;
const ligneTache = tache => {
  const pole = poleDe(tache.pole_id),
    resume = resumeSousTaches(tache);
  return `<button class="tache" data-action="tache" data-id="${tache.id}" style="--couleur:${pole?.couleur}"><span class="pastille"></span>
  <span style="min-width:0"><b class="tronque" style="display:block">${echapper(tache.titre)}</b><small class="discret tronque" style="display:block">${echapper(pole?.nom)} · ${echapper(nomsAssignes(tache))}${resume ? ' · ' + resume : ''}</small></span>
  <span class="etiquette ${tache.statut}">${STATUTS[tache.statut]}</span>
  <span class="tache-progression"><span class="barre"><i style="width:${tache.progression}%"></i></span><small>${tache.progression}%</small></span>
  <span class="tache-echeance ${enRetard(tache) ? 'retard' : ''}">${enRetard(tache) ? 'En retard · ' : ''}${formaterDate(tache.echeance)}</span></button>`;
};
const tachesFiltrees = () => ETAT.taches.filter(tache => (!ETAT.filtres.pole || tache.pole_id === ETAT.filtres.pole) && (!ETAT.filtres.qui || estAssigne(tache, ETAT.filtres.qui)) && (!ETAT.filtres.miennes || estAssigne(tache, ETAT.moi.id)));
const barreFiltres = () => {
  const creerOptions = (liste, valeur, texteTous) => `<option value="">${texteTous}</option>` + liste.map(([cle, libelle]) => `<option value="${cle}" ${valeur === cle ? 'selected' : ''}>${echapper(libelle)}</option>`).join('');
  return `<div class="filtres"><button class="bascule ${ETAT.filtres.miennes ? 'actif' : ''}" data-action="miennes">Mes tâches</button>
  <select data-filtre="pole" aria-label="Pôle">${creerOptions(ETAT.poles.map(pole => [pole.id, pole.nom]), ETAT.filtres.pole, 'Tous les pôles')}</select>
  <select data-filtre="qui" aria-label="Assigné à">${creerOptions(ETAT.profils.filter(utilisateur => utilisateur.actif).map(utilisateur => [utilisateur.id, nomDe(utilisateur)]), ETAT.filtres.qui, 'Tout le monde')}</select></div>`;
};
const boutonNouvelleTache = date => polesGeres().length ? `<button class="bouton" data-action="nouvelle_tache" ${date ? `data-date="${date}"` : ''}>Nouvelle tâche</button>` : '';
const carteTache = (tache, indice) => {
  const pole = poleDe(tache.pole_id),
    assignes = assignesDe(tache),
    resume = resumeSousTaches(tache),
    autorise = peutModifier(tache);
  return `<div class="carte" style="--couleur:${pole?.couleur}" data-id="${tache.id}" ${autorise ? 'draggable="true"' : ''}>
  <button class="carte-titre" data-action="tache" data-id="${tache.id}">${echapper(tache.titre)}</button>
  <small class="discret">${echapper(pole?.nom)}${resume ? ' · ' + resume : ''}${tache.priorite === 'haute' ? ' <b style="color:var(--accent)">Priorité haute</b>' : ''}</small>
  <div class="tache-progression"><span class="barre"><i style="width:${tache.progression}%"></i></span><small>${tache.progression}%</small></div>
  <div class="carte-pied"><span class="tache-echeance ${enRetard(tache) ? 'retard' : ''}">${enRetard(tache) ? 'En retard · ' : ''}${formaterDate(tache.echeance)}</span><span class="carte-pied-droite">${assignes.slice(0, 3).map(utilisateur => `<span class="avatar petit" title="${echapper(nomDe(utilisateur))}">${initiales(nomDe(utilisateur))}</span>`).join('')}${assignes.length > 3 ? `<small class="discret">+${assignes.length - 3}</small>` : ''}
  ${autorise ? `<button class="deplacer" data-action="deplacer" data-id="${tache.id}" data-vers="${ORDRE_STATUTS[indice - 1] || ''}" ${indice ? '' : 'disabled'} aria-label="Statut précédent">‹</button><button class="deplacer" data-action="deplacer" data-id="${tache.id}" data-vers="${ORDRE_STATUTS[indice + 1] || ''}" ${indice < 3 ? '' : 'disabled'} aria-label="Statut suivant">›</button>` : ''}</span></div></div>`;
};
const vues = {
  accueil() {
    const ouvertes = ETAT.taches.filter(tache => tache.statut !== 'terminee'),
      tachesEnRetard = ouvertes.filter(enRetard);
    const mesTaches = ouvertes.filter(tache => estAssigne(tache, ETAT.moi.id)).sort(parEcheance).slice(0, 6);
    const libelleDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    return enTete(`Bonjour ${echapper((ETAT.moi.nom_complet || '').split(' ')[0] || '')}`, libelleDate) + `<div class="panneau stats"><div class="stat"><b>${ouvertes.length}</b><span>Tâches ouvertes</span></div><div class="stat ${tachesEnRetard.length ? 'alerte' : ''}"><b>${tachesEnRetard.length}</b><span>En retard</span></div>
      <div class="stat"><b>${ETAT.taches.filter(tache => tache.statut === 'relecture').length}</b><span>En relecture</span></div><div class="stat"><b>${ETAT.taches.filter(tache => tache.statut === 'terminee').length}</b><span>Terminées</span></div></div>
      <div class="colonnes"><section class="panneau"><h2>Mes prochaines tâches</h2>${mesTaches.length ? mesTaches.map(ligneTache).join('') : '<div class="vide">Rien à faire pour le moment.</div>'}</section>
      <section class="panneau"><h2>Avancement par pôle</h2>${ETAT.poles.length ? ETAT.poles.map(pole => {
      const taches = ETAT.taches.filter(tache => tache.pole_id === pole.id);
      return `<div class="ligne" style="--couleur:${pole.couleur}"><span class="pastille"></span><div class="extensible"><b>${echapper(pole.nom)}</b><div class="barre" style="margin-top:6px"><i style="width:${moyenne(taches)}%"></i></div></div><small>${taches.length} tâche${taches.length > 1 ? 's' : ''} · ${moyenne(taches)}%</small></div>`;
    }).join('') : '<div class="vide">Aucun pôle pour l’instant.</div>'}</section></div>${preferencesNotifications()}`;
  },
  taches() {
    const filtres = ETAT.filtres;
    const liste = ETAT.taches.filter(tache => (!filtres.pole || tache.pole_id === filtres.pole) && (!filtres.qui || estAssigne(tache, filtres.qui)) && (!filtres.statut || tache.statut === filtres.statut) && (!filtres.miennes || estAssigne(tache, ETAT.moi.id))).sort(parEcheance);
    const creerOptions = (liste, valeur, texteTous) => `<option value="">${texteTous}</option>` + liste.map(([cle, libelle]) => `<option value="${cle}" ${valeur === cle ? 'selected' : ''}>${echapper(libelle)}</option>`).join('');
    return enTete('Tâches', `${liste.length} tâche${liste.length > 1 ? 's' : ''}`, polesGeres().length ? '<button class="bouton" data-action="nouvelle_tache">Nouvelle tâche</button>' : '') + `<div class="filtres"><button class="bascule ${filtres.miennes ? 'actif' : ''}" data-action="miennes">Mes tâches</button>
      <select data-filtre="pole" aria-label="Pôle">${creerOptions(ETAT.poles.map(pole => [pole.id, pole.nom]), filtres.pole, 'Tous les pôles')}</select>
      <select data-filtre="qui" aria-label="Assigné à">${creerOptions(ETAT.profils.filter(utilisateur => utilisateur.actif).map(utilisateur => [utilisateur.id, nomDe(utilisateur)]), filtres.qui, 'Tout le monde')}</select>
      <select data-filtre="statut" aria-label="Statut">${creerOptions(Object.entries(STATUTS), filtres.statut, 'Tous les statuts')}</select></div>
      <div class="panneau">${liste.length ? liste.map(ligneTache).join('') : `<div class="vide">Aucune tâche ne correspond.${polesGeres().length ? '<button class="bouton" data-action="nouvelle_tache">Créer une tâche</button>' : ''}</div>`}</div>`;
  },
  poles() {
    return enTete('Pôles', 'Les équipes de l’agence', estAdmin() ? '<button class="bouton" data-action="nouveau_pole">Nouveau pôle</button>' : '') + (ETAT.poles.length ? `<div class="cartes">${ETAT.poles.map(pole => {
      const taches = ETAT.taches.filter(tache => tache.pole_id === pole.id),
        membres = ETAT.liens.filter(lien => lien.pole_id === pole.id).map(lien => utilisateurDe(lien.utilisateur_id)).filter(Boolean);
      return `<${estAdmin() ? 'button' : 'div'} class="pole" style="--couleur:${pole.couleur}" data-action="modifier_pole" data-id="${pole.id}"><h2>${echapper(pole.nom)}</h2><p class="discret">${echapper(pole.description) || 'Aucune description'}</p>
        <div class="barre"><i style="width:${moyenne(taches)}%"></i></div><div class="discret">${taches.length} tâche${taches.length > 1 ? 's' : ''} · ${moyenne(taches)}% d’avancement</div>
        <div style="display:flex">${membres.slice(0, 5).map(utilisateur => `<span class="avatar" title="${echapper(nomDe(utilisateur))}" style="margin-right:-8px;border:2px solid #fff">${initiales(nomDe(utilisateur))}</span>`).join('')}${membres.length > 5 ? `<span class="discret" style="margin-left:16px">+${membres.length - 5}</span>` : ''}${membres.length ? '' : '<span class="discret">Aucun membre</span>'}</div></${estAdmin() ? 'button' : 'div'}>`;
    }).join('')}</div>` : `<div class="panneau"><div class="vide">${estAdmin() ? 'Créez votre premier pôle (Social media, Design, Presse…).' : 'Vous n’êtes rattaché à aucun pôle. Contactez un administrateur.'}</div></div>`);
  },
  tableau() {
    const liste = tachesFiltrees();
    return enTete('Tableau', 'Glissez les cartes, ou utilisez les flèches, pour changer de statut', boutonNouvelleTache()) + barreFiltres() + `<div class="tableau">${ORDRE_STATUTS.map((statut, indice) => {
      const taches = liste.filter(tache => tache.statut === statut).sort(parEcheance);
      return `<section class="colonne" data-statut="${statut}"><h2>${STATUTS[statut]} <small class="discret">${taches.length}</small></h2>${taches.map(tache => carteTache(tache, indice)).join('') || '<p class="discret" style="padding:8px 4px">Aucune tâche</p>'}</section>`;
    }).join('')}</div>`;
  },
  agenda() {
    const {
        annee,
        mois
      } = ETAT.calendrier,
      toutes = tachesFiltrees(),
      parJour = {};
    toutes.filter(tache => tache.echeance).forEach(tache => (parJour[tache.echeance] = parJour[tache.echeance] || []).push(tache));
    const decalage = (new Date(annee, mois, 1).getDay() + 6) % 7,
      nbJours = new Date(annee, mois + 1, 0).getDate(),
      semaines = Math.ceil((decalage + nbJours) / 7),
      cellules = [];
    for (let indice = 0; indice < semaines * 7; indice++) {
      const jour = new Date(annee, mois, 1 - decalage + indice),
        cle = formatIso(jour),
        taches = (parJour[cle] || []).sort(parEcheance);
      cellules.push(`<button class="jour ${jour.getMonth() !== mois ? 'hors-mois' : ''} ${cle === aujourdhui() ? 'aujourdhui' : ''} ${cle === ETAT.jour ? 'selection' : ''}" data-action="jour" data-date="${cle}" aria-label="${jour.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long'
      })}, ${taches.length} tâche${taches.length > 1 ? 's' : ''}">
      <span class="numero">${jour.getDate()}</span><span class="puces">${taches.slice(0, 3).map(tache => `<i class="puce ${tache.statut === 'terminee' ? 'finie' : ''} ${enRetard(tache) ? 'retard' : ''}" style="--couleur:${poleDe(tache.pole_id)?.couleur}">${echapper(tache.titre)}</i>`).join('')}</span>${taches.length > 3 ? `<span class="plus">+${taches.length - 3}</span>` : ''}</button>`);
    }
    const tachesDuJour = (parJour[ETAT.jour] || []).sort(parEcheance),
      sansDate = toutes.filter(tache => !tache.echeance && tache.statut !== 'terminee').length;
    const libelleJour = new Date(ETAT.jour + 'T00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    const barreMois = '<div class="agenda-nav"><button class="bouton fantome" data-action="mois" data-date="-1" aria-label="Mois précédent">‹</button><button class="bouton fantome" data-action="mois" data-date="0">Aujourd’hui</button><button class="bouton fantome" data-action="mois" data-date="1" aria-label="Mois suivant">›</button></div>';
    return `<div class="entete"><div><h1 style="text-transform:capitalize">${new Date(annee, mois, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    })}</h1><p style="text-transform:none">Échéances des tâches${sansDate ? `, ${sansDate} sans date` : ''}</p></div>${barreMois}</div>` + barreFiltres() + `<div class="panneau calendrier"><div class="calendrier-entete">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(jour => `<span>${jour}</span>`).join('')}</div><div class="calendrier-grille">${cellules.join('')}</div></div>
      <section class="panneau" style="margin-top:22px"><h2 style="text-transform:capitalize">${libelleJour}</h2>${tachesDuJour.length ? tachesDuJour.map(ligneTache).join('') : '<div class="vide" style="padding:24px 20px">Aucune échéance ce jour-là.</div>'}
      ${polesGeres().length ? `<div style="padding:14px 20px;border-top:1px solid var(--ligne)"><button class="bouton fantome" data-action="nouvelle_tache" data-date="${ETAT.jour}">Ajouter une tâche ce jour</button></div>` : ''}</section>`;
  },
  equipe() {
    return enTete('Équipe', `${ETAT.profils.length} compte${ETAT.profils.length > 1 ? 's' : ''}`) + `<div class="panneau">${ETAT.profils.map(utilisateur => {
      const estMoi = utilisateur.id === ETAT.moi.id,
        nom = echapper(nomDe(utilisateur)),
        nomsPoles = ETAT.liens.filter(membre => membre.utilisateur_id === utilisateur.id).map(membre => poleDe(membre.pole_id)?.nom).filter(Boolean);
      return `<div class="membre${utilisateur.actif ? '' : ' en-attente'}"><span class="avatar">${initiales(nomDe(utilisateur))}</span>
      <div class="membre-infos"><div class="membre-nom"><b>${nom}</b>${estMoi ? '<span class="etiquette">Vous</span>' : ''}${utilisateur.actif ? '' : '<span class="etiquette haute">En attente</span>'}</div>
      <small class="discret membre-email">${echapper(utilisateur.email)}</small>
      ${nomsPoles.length ? `<div class="membre-poles">${nomsPoles.map(nomPole => `<span class="etiquette">${echapper(nomPole)}</span>`).join('')}</div>` : ''}</div>
      <div class="membre-actions"><select data-role="${utilisateur.id}" ${estMoi ? 'disabled' : ''} aria-label="Rôle de ${nom}">${Object.entries(ROLES).map(([cle, libelle]) => `<option value="${cle}" ${utilisateur.role === cle ? 'selected' : ''}>${libelle}</option>`).join('')}</select>
      <label class="interrupteur"><input type="checkbox" role="switch" data-actif="${utilisateur.id}" ${utilisateur.actif ? 'checked' : ''} ${estMoi ? 'disabled' : ''}><span>Actif</span></label></div></div>`;
    }).join('')}</div><p class="discret" style="margin-top:14px">Rattachez les membres à leurs pôles depuis la page Pôles.</p>`;
  }
};

/* ---------- Formulaires ---------- */
const casesAssignation = (idPole, coches, desactive = '') => {
  const candidats = ETAT.profils.filter(utilisateur => utilisateur.actif && (ETAT.liens.some(lien => lien.pole_id === idPole && lien.utilisateur_id === utilisateur.id) || coches.includes(utilisateur.id)));
  return candidats.length ? candidats.map(utilisateur => `<label><input type="checkbox" name="assignes" value="${utilisateur.id}" ${coches.includes(utilisateur.id) ? 'checked' : ''} ${desactive}>${echapper(nomDe(utilisateur))}</label>`).join('') : '<p class="discret">Aucun membre dans ce pôle.</p>';
};
const ligneSousTache = (sousTache, editable, peutCocher) => `<div class="sous-tache" data-id="${sousTache.id || ''}"><input type="checkbox" aria-label="Terminée" ${sousTache.terminee ? 'checked' : ''} ${peutCocher ? '' : 'disabled'}><input type="text" value="${echapper(sousTache.titre)}" aria-label="Titre de la sous-tâche" ${editable ? '' : 'disabled'}>${editable ? '<button type="button" class="deplacer" data-action="retirer_sous_tache" aria-label="Retirer la sous-tâche">×</button>' : ''}</div>`;
const blocSousTaches = (idTache, editable, peutCocher) => `<div id="champ-sous-taches" class="sous-taches">${sousTachesDe(idTache).map(sousTache => ligneSousTache(sousTache, editable, peutCocher)).join('')}</div>${editable ? '<div class="sous-tache-ajout"><input type="text" id="champ-nouvelle-sous-tache" placeholder="Ajouter une sous-tâche" aria-label="Nouvelle sous-tâche"><button type="button" class="bouton fantome" data-action="ajouter_sous_tache">Ajouter</button></div>' : ''}`;
function ajouterSousTache() {
  const champ = trouver('#champ-nouvelle-sous-tache'),
    titre = champ.value.trim();
  if (!titre) return;
  trouver('#champ-sous-taches').insertAdjacentHTML('beforeend', ligneSousTache({ titre, terminee: false }, true, true));
  champ.value = '';
  champ.focus();
  recalculerProgression();
}
function recalculerProgression() {
  const lignes = [...document.querySelectorAll('#champ-sous-taches .sous-tache')],
    curseur = trouver('#champ-progression');
  if (lignes.length) {
    const faites = lignes.filter(ligne => ligne.querySelector('input[type=checkbox]').checked).length,
      pourcentage = Math.round(faites / lignes.length * 100);
    curseur.value = pourcentage;
    curseur.disabled = true;
    trouver('#valeur-progression').textContent = pourcentage;
  } else {
    curseur.disabled = curseur.dataset.verrou === '1';
    trouver('#valeur-progression').textContent = curseur.value;
  }
}
function formulaireTache(id, date) {
  const tache = id ? ETAT.taches.find(element => element.id === id) : {
    statut: 'a_faire',
    priorite: 'normale',
    progression: 0,
    pole_id: polesGeres()[0]?.id,
    echeance: date
  };
  if (!tache.pole_id) return notifier('Créez d’abord un pôle.', 1);
  const complet = !id || peutGerer(tache.pole_id),
    peutAgir = id ? peutModifier(tache) : true;
  const champDesactive = champ => complet || peutAgir && (champ === 'statut' || champ === 'progression') ? '' : 'disabled';
  const polesChoix = id ? ETAT.poles : polesGeres();
  ouvrirModale(`<form class="formulaire-modale" id="formulaire-tache" data-id="${id || ''}"><h2>${id ? 'Tâche' : 'Nouvelle tâche'}</h2>
  <label for="champ-titre">Titre</label><input id="champ-titre" name="titre" required value="${echapper(tache.titre)}" ${champDesactive('t')}>
  <label for="champ-description">Description</label><textarea id="champ-description" name="description" rows="3" ${champDesactive('t')}>${echapper(tache.description)}</textarea>
  <div class="grille2"><div><label for="champ-pole">Pôle</label><select id="champ-pole" name="pole_id" ${champDesactive('t')}>${polesChoix.map(pole => `<option value="${pole.id}" ${pole.id === tache.pole_id ? 'selected' : ''}>${echapper(pole.nom)}</option>`).join('')}</select></div>
  <div><label for="champ-statut">Statut</label><select id="champ-statut" name="statut" ${champDesactive('statut')}>${Object.entries(STATUTS).map(([cle, libelle]) => `<option value="${cle}" ${tache.statut === cle ? 'selected' : ''}>${libelle}</option>`).join('')}</select></div>
  <div><label for="champ-priorite">Priorité</label><select id="champ-priorite" name="priorite" ${champDesactive('t')}>${Object.entries(PRIORITES).map(([cle, libelle]) => `<option value="${cle}" ${tache.priorite === cle ? 'selected' : ''}>${libelle}</option>`).join('')}</select></div>
  <div><label for="champ-echeance">Échéance</label><input id="champ-echeance" type="date" name="echeance" value="${tache.echeance || ''}" ${champDesactive('t')}></div></div>
  <label>Assignée à</label><div class="cases" id="champ-assignes">${casesAssignation(tache.pole_id, idsAssignes(tache.id), champDesactive('t'))}</div>
  <label>Sous-tâches</label>${blocSousTaches(tache.id, complet, peutAgir)}
  <label for="champ-progression">Progression : <span id="valeur-progression">${tache.progression}</span>%</label><input id="champ-progression" type="range" name="progression" min="0" max="100" step="5" value="${tache.progression}" ${champDesactive('progression') || (id && sousTachesDe(id).length) ? 'disabled' : ''} data-verrou="${champDesactive('progression') ? 1 : 0}">
  <div class="actions">${id && complet ? '<button type="button" class="bouton danger" data-action="supprimer_tache">Supprimer</button>' : ''}<button type="button" class="bouton fantome" data-action="fermer">${peutAgir ? 'Annuler' : 'Fermer'}</button>${peutAgir ? '<button class="bouton">Enregistrer</button>' : ''}</div></form>`);
}
async function enregistrerLiaisons(idTache, formulaire, lignes, complet) {
  const erreurDe = async requete => (await requete).error;
  let erreur;
  if (complet) {
    const choisis = new FormData(formulaire).getAll('assignes'),
      actuels = idsAssignes(idTache),
      aRetirer = actuels.filter(idUtilisateur => !choisis.includes(idUtilisateur)),
      aAjouter = choisis.filter(idUtilisateur => !actuels.includes(idUtilisateur));
    if (aRetirer.length && (erreur = await erreurDe(bdd.from('assignations').delete().eq('tache_id', idTache).in('utilisateur_id', aRetirer)))) return erreur;
    if (aAjouter.length && (erreur = await erreurDe(bdd.from('assignations').insert(aAjouter.map(idUtilisateur => ({ tache_id: idTache, utilisateur_id: idUtilisateur }))))) ) return erreur;
  }
  const existantes = sousTachesDe(idTache);
  if (complet) {
    const gardees = lignes.filter(ligne => ligne.id).map(ligne => ligne.id),
      aSupprimer = existantes.filter(sousTache => !gardees.includes(sousTache.id)).map(sousTache => sousTache.id),
      nouvelles = lignes.map((ligne, indice) => ({ tache_id: idTache, titre: ligne.titre, terminee: ligne.terminee, position: indice, id: ligne.id })).filter(ligne => !ligne.id).map(({ id, ...reste }) => reste);
    if (aSupprimer.length && (erreur = await erreurDe(bdd.from('sous_taches').delete().in('id', aSupprimer)))) return erreur;
    if (nouvelles.length && (erreur = await erreurDe(bdd.from('sous_taches').insert(nouvelles)))) return erreur;
  }
  for (const [indice, ligne] of lignes.entries()) {
    const ancienne = existantes.find(sousTache => sousTache.id === ligne.id);
    if (!ancienne) continue;
    const modifs = {};
    if (ligne.terminee !== ancienne.terminee) modifs.terminee = ligne.terminee;
    if (complet && (ligne.titre !== ancienne.titre || indice !== ancienne.position)) Object.assign(modifs, { titre: ligne.titre, position: indice });
    if (Object.keys(modifs).length && (erreur = await erreurDe(bdd.from('sous_taches').update(modifs).eq('id', ligne.id)))) return erreur;
  }
}
async function enregistrerTache(formulaire) {
  const id = formulaire.dataset.id,
    donnees = Object.fromEntries(new FormData(formulaire)),
    tache = id ? ETAT.taches.find(element => element.id === id) : null,
    lignes = [...formulaire.querySelectorAll('.sous-tache')].map(ligne => ({
      id: ligne.dataset.id,
      titre: ligne.querySelector('input[type=text]').value.trim(),
      terminee: ligne.querySelector('input[type=checkbox]').checked
    })).filter(ligne => ligne.titre);
  let progression = +donnees.progression || 0,
    statut = donnees.statut;
  if (lignes.length) progression = Math.round(lignes.filter(ligne => ligne.terminee).length / lignes.length * 100);
  if (tache && tache.statut === 'terminee' && statut === 'terminee' && progression < 100) statut = 'en_cours';else if (statut === 'terminee') progression = 100;else if (progression === 100 && statut !== 'relecture') statut = 'terminee';else if (progression > 0 && statut === 'a_faire') statut = 'en_cours';
  const complet = !tache || peutGerer(tache.pole_id);
  const enregistrement = complet ? {
    titre: donnees.titre.trim(),
    description: donnees.description,
    pole_id: donnees.pole_id,
    priorite: donnees.priorite,
    echeance: donnees.echeance || null,
    statut,
    progression
  } : {
    statut,
    progression
  };
  const {
    data: sauvee,
    error
  } = await (id ? bdd.from('taches').update(enregistrement).eq('id', id).select().single() : bdd.from('taches').insert(enregistrement).select().single());
  if (error) return notifier(error.message, 1);
  const erreurLiaison = await enregistrerLiaisons(sauvee.id, formulaire, lignes, complet);
  if (erreurLiaison) return notifier(erreurLiaison.message, 1);
  fermerModale();
  await chargerTout();
  afficher();
  notifier(id ? 'Tâche enregistrée' : 'Tâche créée');
}
function formulairePole(id) {
  const pole = id ? poleDe(id) : {
      couleur: COULEURS[0]
    },
    idsMembres = ETAT.liens.filter(lien => lien.pole_id === id).map(lien => lien.utilisateur_id);
  ouvrirModale(`<form class="formulaire-modale" id="formulaire-pole" data-id="${id || ''}"><h2>${id ? 'Modifier le pôle' : 'Nouveau pôle'}</h2>
  <label for="champ-nom-pole">Nom</label><input id="champ-nom-pole" name="nom" required value="${echapper(pole.nom)}"><label for="champ-description-pole">Description</label><textarea id="champ-description-pole" name="description" rows="2">${echapper(pole.description)}</textarea>
  <label>Couleur</label><div class="nuancier">${COULEURS.map(couleur => `<label class="nuance" style="color:${couleur};margin:0"><input type="radio" name="couleur" value="${couleur}" ${couleur === pole.couleur ? 'checked' : ''}><span></span></label>`).join('')}</div>
  <label>Membres</label><div class="cases">${ETAT.profils.filter(utilisateur => utilisateur.actif).map(utilisateur => `<label><input type="checkbox" name="membres" value="${utilisateur.id}" ${idsMembres.includes(utilisateur.id) ? 'checked' : ''}>${echapper(nomDe(utilisateur))} <small class="discret">${ROLES[utilisateur.role]}</small></label>`).join('')}</div>
  <div class="actions">${id ? '<button type="button" class="bouton danger" data-action="supprimer_pole">Supprimer</button>' : ''}<button type="button" class="bouton fantome" data-action="fermer">Annuler</button><button class="bouton">Enregistrer</button></div></form>`);
}
async function enregistrerPole(formulaire) {
  const id = formulaire.dataset.id,
    donnees = new FormData(formulaire),
    enregistrement = {
      nom: donnees.get('nom').trim(),
      description: donnees.get('description'),
      couleur: donnees.get('couleur')
    };
  let idPole = id;
  if (id) {
    const {
      error
    } = await bdd.from('poles').update(enregistrement).eq('id', id);
    if (error) return notifier(error.message, 1);
  } else {
    const {
      data,
      error
    } = await bdd.from('poles').insert(enregistrement).select().single();
    if (error) return notifier(error.message, 1);
    idPole = data.id;
  }
  await bdd.from('membres_pole').delete().eq('pole_id', idPole);
  const idsChoisis = donnees.getAll('membres');
  if (idsChoisis.length) await bdd.from('membres_pole').insert(idsChoisis.map(idUtilisateur => ({
    pole_id: idPole,
    utilisateur_id: idUtilisateur
  })));
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Pôle enregistré');
}

/* ---------- Événements ---------- */
document.addEventListener('click', async evenement => {
  if (evenement.target === trouver('#dialogue')) return fermerModale();
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton) return;
  const action = bouton.dataset.action,
    id = bouton.dataset.id;
  if (action === 'basculer_mode') {
    ETAT.mode = ETAT.mode === 'connexion' ? 'inscription' : 'connexion';
    vueConnexion();
  } else if (action === 'navigation') {
    ETAT.vue = bouton.dataset.vue;
    afficher();
    scrollTo(0, 0);
  } else if (action === 'deconnexion') {
    ETAT.abonne = false;
    bdd.removeAllChannels();
    await bdd.auth.signOut();
  } else if (action === 'installer') {
    installer();
  } else if (action === 'nouvelle_tache') formulaireTache(undefined, bouton.dataset.date);else if (action === 'tache') formulaireTache(id);else if (action === 'miennes') {
    ETAT.filtres.miennes = !ETAT.filtres.miennes;
    afficher();
  } else if (action === 'deplacer') deplacerTache(id, bouton.dataset.vers);else if (action === 'ajouter_sous_tache') ajouterSousTache();else if (action === 'retirer_sous_tache') {
    bouton.closest('.sous-tache').remove();
    recalculerProgression();
  }else if (action === 'jour') {
    ETAT.jour = bouton.dataset.date;
    const dateChoisie = new Date(ETAT.jour + 'T00:00');
    ETAT.calendrier = {
      annee: dateChoisie.getFullYear(),
      mois: dateChoisie.getMonth()
    };
    afficher();
  } else if (action === 'mois') {
    const decalage = +bouton.dataset.date,
      maintenant = new Date(),
      nouvelleDate = decalage ? new Date(ETAT.calendrier.annee, ETAT.calendrier.mois + decalage, 1) : maintenant;
    ETAT.calendrier = {
      annee: nouvelleDate.getFullYear(),
      mois: nouvelleDate.getMonth()
    };
    ETAT.jour = !decalage || nouvelleDate.getFullYear() === maintenant.getFullYear() && nouvelleDate.getMonth() === maintenant.getMonth() ? aujourdhui() : formatIso(nouvelleDate);
    afficher();
  } else if (action === 'nouveau_pole') formulairePole();else if (action === 'modifier_pole') formulairePole(id);else if (action === 'fermer') fermerModale();else if (action === 'supprimer_tache' && confirm('Supprimer cette tâche ?')) {
    const {
      error
    } = await bdd.from('taches').delete().eq('id', trouver('#formulaire-tache').dataset.id);
    if (error) return notifier(error.message, 1);
    fermerModale();
    await chargerTout();
    afficher();
    notifier('Tâche supprimée');
  } else if (action === 'supprimer_pole' && confirm('Supprimer ce pôle et toutes ses tâches ?')) {
    const {
      error
    } = await bdd.from('poles').delete().eq('id', trouver('#formulaire-pole').dataset.id);
    if (error) return notifier(error.message, 1);
    fermerModale();
    await chargerTout();
    afficher();
    notifier('Pôle supprimé');
  }
});
document.addEventListener('submit', async evenement => {
  evenement.preventDefault();
  const formulaire = evenement.target;
  if (formulaire.id === 'formulaire-tache') return enregistrerTache(formulaire);
  if (formulaire.id === 'formulaire-pole') return enregistrerPole(formulaire);
  if (formulaire.id === 'formulaire-connexion') {
    const donnees = Object.fromEntries(new FormData(formulaire)),
      zoneErreur = trouver('#erreur');
    zoneErreur.textContent = '';
    const reponse = ETAT.mode === 'inscription' ? await bdd.auth.signUp({
      email: donnees.email,
      password: donnees.password,
      options: {
        data: {
          nom_complet: donnees.nom_complet
        }
      }
    }) : await bdd.auth.signInWithPassword({
      email: donnees.email,
      password: donnees.password
    });
    if (reponse.error) zoneErreur.textContent = reponse.error.message.includes('Invalid login') ? 'E-mail ou mot de passe incorrect.' : reponse.error.message;else if (ETAT.mode === 'inscription' && !reponse.data.session) {
      ETAT.mode = 'connexion';
      vueConnexion();
      notifier('Compte créé. Confirmez votre e-mail, puis connectez-vous.');
    }
  }
});
document.addEventListener('input', evenement => {
  if (evenement.target.id === 'champ-progression') trouver('#valeur-progression').textContent = evenement.target.value;
});
document.addEventListener('change', async evenement => {
  const cible = evenement.target,
    attributs = cible.dataset;
  if (attributs.filtre) {
    ETAT.filtres[attributs.filtre] = cible.value;
    afficher();
  } else if (cible.id === 'champ-pole') trouver('#champ-assignes').innerHTML = casesAssignation(cible.value, [...trouver('#champ-assignes').querySelectorAll('input:checked')].map(coche => coche.value).filter(idUtilisateur => ETAT.liens.some(lien => lien.pole_id === cible.value && lien.utilisateur_id === idUtilisateur)));else if (cible.id === 'champ-statut' && cible.value === 'terminee') {
    trouver('#champ-progression').value = 100;
    trouver('#valeur-progression').textContent = 100;
  } else if (cible.matches('.sous-tache input[type=checkbox]')) {
    recalculerProgression();
  } else if (attributs.notif !== undefined) {
    const {
      error
    } = await bdd.from('profils').update({ notifications_email: cible.checked }).eq('id', ETAT.moi.id);
    notifier(error ? error.message : cible.checked ? 'Notifications e-mail activées' : 'Notifications e-mail désactivées', Boolean(error));
    await chargerTout();
    afficher();
  } else if (attributs.role || attributs.actif) {
    const {
      error
    } = await bdd.from('profils').update(attributs.role ? {
      role: cible.value
    } : {
      actif: cible.checked
    }).eq('id', attributs.role || attributs.actif);
    if (error) notifier(error.message, 1);else notifier('Compte mis à jour');
    await chargerTout();
    afficher();
  }
});
async function deplacerTache(id, vers) {
  const tache = ETAT.taches.find(element => element.id === id);
  if (!tache || !vers || tache.statut === vers || !peutModifier(tache)) return;
  const ancien = {
    statut: tache.statut,
    progression: tache.progression
  };
  let nouvelleProgression = tache.progression;
  if (vers === 'terminee') nouvelleProgression = 100;else if (tache.statut === 'terminee' && vers !== 'relecture') nouvelleProgression = Math.min(nouvelleProgression, 90);
  Object.assign(tache, {
    statut: vers,
    progression: nouvelleProgression
  });
  afficher();
  const {
    error
  } = await bdd.from('taches').update({
    statut: vers,
    progression: nouvelleProgression
  }).eq('id', id);
  if (error) {
    Object.assign(tache, ancien);
    afficher();
    notifier(error.message, 1);
  }
}
let idGlisse;
document.addEventListener('dragstart', evenement => {
  const carte = evenement.target.closest?.('.carte[draggable=true]');
  if (!carte) return;
  idGlisse = carte.dataset.id;
  evenement.dataTransfer.effectAllowed = 'move';
  evenement.dataTransfer.setData('text/plain', idGlisse);
  carte.classList.add('glisse');
});
document.addEventListener('dragend', () => document.querySelectorAll('.glisse,.survol').forEach(element => element.classList.remove('glisse', 'survol')));
document.addEventListener('dragover', evenement => {
  const colonne = evenement.target.closest?.('.colonne');
  if (!colonne || !idGlisse) return;
  evenement.preventDefault();
  document.querySelectorAll('.survol').forEach(element => element !== colonne && element.classList.remove('survol'));
  colonne.classList.add('survol');
});
document.addEventListener('drop', evenement => {
  const colonne = evenement.target.closest?.('.colonne');
  if (!colonne || !idGlisse) return;
  evenement.preventDefault();
  const id = idGlisse;
  idGlisse = null;
  deplacerTache(id, colonne.dataset.statut);
});
document.addEventListener('keydown', evenement => {
  if (evenement.key === 'Enter' && evenement.target.id === 'champ-nouvelle-sous-tache') {
    evenement.preventDefault();
    ajouterSousTache();
  }
});
window.addEventListener('beforeinstallprompt', evenement => {
  evenement.preventDefault();
  invitationInstallation = evenement;
  majInstallation();
});
window.addEventListener('appinstalled', () => {
  invitationInstallation = null;
  majInstallation();
  notifier('Application installée');
});
new MutationObserver(majInstallation).observe(trouver('#application'), { childList: true });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
initialiser();
