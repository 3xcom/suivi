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
  membre: 'Membre',
  client: 'Client'
};
const STATUTS_DEMANDE = {
  nouvelle: 'Reçue',
  en_etude: 'En étude',
  acceptee: 'Acceptée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  refusee: 'Refusée'
};
const SUIVI_DEMANDE = ['acceptee', 'en_cours', 'terminee'];
const COULEURS = ['#8E1F45', '#2C5AA0', '#2C7A63', '#B7791F', '#6A3FA0', '#1F2937'];
const ICONES = {
  accueil: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  taches: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  poles: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.3 2.3 3.6 5"/>'
};
ICONES.tableau = '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>';
ICONES.demandes = '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>';
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
let bdd, invitationInstallation, reconnaissanceEnCours, ecouteVocaleActive = false, idEcouteVocale = 0, redemarragesVocal = 0, enregistreurAudio, fluxAudio, morceauxAudio = [], audioDemandeVocal = null, finalisationAudio = Promise.resolve(), finalisationAudioEnCours = false;
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
  clients: [],
  membresClient: [],
  demandes: [],
  ongletEquipe: 'comptes',
  vue: 'accueil',
  filtres: {
    pole: '',
    qui: '',
    statut: '',
    miennes: false,
    demandePole: '',
    demandeStatut: '',
    demandeClient: ''
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
const estClient = () => ETAT.moi.role === 'client';
const gereDemandes = () => ['admin', 'responsable'].includes(ETAT.moi.role);
const estPersonnelCompte = utilisateur => utilisateur.role !== 'client';
const clientDe = id => ETAT.clients.find(client => client.id === id);
const groupesDe = idUtilisateur => ETAT.membresClient.filter(lien => lien.utilisateur_id === idUtilisateur).map(lien => clientDe(lien.client_id)).filter(Boolean);
const polesOuverts = () => ETAT.poles.filter(pole => pole.accepte_demandes !== false);
const bandeauDemandes = () => {
  const nombre = gereDemandes() ? ETAT.demandes.filter(demande => demande.statut === 'nouvelle').length : 0;
  return nombre ? `<button class="bandeau" data-action="navigation" data-vue="demandes"><b>${nombre}</b> nouvelle${nombre > 1 ? 's' : ''} demande${nombre > 1 ? 's' : ''} à traiter<span aria-hidden="true">›</span></button>` : '';
};
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
const fermerModale = () => {
  ecouteVocaleActive = false;
  idEcouteVocale++;
  if (reconnaissanceEnCours) { reconnaissanceEnCours.abort(); reconnaissanceEnCours = null; }
  if (enregistreurAudio?.state === 'recording') enregistreurAudio.stop();
  fluxAudio?.getTracks().forEach(piste => piste.stop()); fluxAudio = null; enregistreurAudio = null;
  if (trouver('#dialogue').open) trouver('#dialogue').close();
};

/* ---------- Saisie vocale ---------- */
const reconnaissanceVocale = () => window.SpeechRecognition || window.webkitSpeechRecognition;
function ouvrirSaisieVocale() {
  if (!reconnaissanceVocale()) return notifier('La saisie vocale n’est pas disponible dans ce navigateur. Essayez Chrome ou Edge.', 1);
  audioDemandeVocal = null;
  const type = estClient() ? 'demande' : 'tache';
  ouvrirModale(`<div class="formulaire-modale"><h2>${type === 'demande' ? 'Demande par vocal' : 'Tâche par vocal'}</h2><p class="discret">${type === 'demande' ? 'Dites simplement ce dont vous avez besoin. L’agence orientera la demande vers la bonne équipe.' : 'Dictez la tâche, son pôle et les personnes à assigner. Vous pourrez tout vérifier.'}</p><small class="discret">${type === 'demande' ? 'Si vous avez un délai ou si c’est urgent, dites-le : « pour demain », « avant le 15 juin », « c’est urgent ». Touchez « Commencer à parler », expliquez votre besoin, puis « J’ai terminé ».' : 'Exemple : « Visuel campagne de Noël, pôle création, assignée à Aïcha, échéance 15/12/2026, priorité urgente ».'}</small><textarea id="transcription-vocale" rows="5" placeholder="La transcription s’affichera ici. Vous pourrez la corriger." aria-label="Transcription vocale" aria-live="polite"></textarea>${type === 'demande' ? '<label class="option-audio"><input id="inclure-audio" type="checkbox"> Joindre aussi l’enregistrement audio</label>' : ''}<p id="etat-vocal" class="discret" aria-live="polite">Prêt. Touchez « Commencer à parler » lorsque vous êtes prêt.</p><div class="actions actions-vocal"><button type="button" class="bouton fantome" data-action="fermer">Annuler</button><button type="button" class="bouton bouton-vocal" data-action="demarrer-vocal">🎙️ Commencer à parler</button><button type="button" class="bouton fantome" data-action="terminer-vocal" disabled>J’ai terminé</button><button type="button" class="bouton" data-action="utiliser-vocal">Continuer</button></div></div>`);
}
async function demarrerVocal(bouton) {
  const Reconnaissance = reconnaissanceVocale();
  if (!Reconnaissance) return;
  const reco = new Reconnaissance();
  reco.lang = 'fr-FR'; reco.interimResults = true; reco.continuous = true; reco.maxAlternatives = 3;
  const etat = trouver('#etat-vocal'), champ = trouver('#transcription-vocale'), terminer = trouver('[data-action="terminer-vocal"]');
  let transcriptionFinale = champ.value;
  const sessionVocale = ++idEcouteVocale;
  try {
    if (trouver('#inclure-audio')?.checked) {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('enregistrement-indisponible');
      fluxAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
      morceauxAudio = [];
      enregistreurAudio = new MediaRecorder(fluxAudio);
      enregistreurAudio.ondataavailable = evenement => { if (evenement.data.size) morceauxAudio.push(evenement.data); };
      let terminerAudio; finalisationAudio = new Promise(resolve => { terminerAudio = resolve; });
      const typeAudio = enregistreurAudio.mimeType || 'audio/webm';
      enregistreurAudio.onstop = () => { audioDemandeVocal = morceauxAudio.length ? new Blob(morceauxAudio, { type: typeAudio }) : null; fluxAudio?.getTracks().forEach(piste => piste.stop()); fluxAudio = null; finalisationAudioEnCours = false; if (trouver('#etat-vocal')) trouver('#etat-vocal').textContent = audioDemandeVocal ? 'Enregistrement prêt à joindre à la demande.' : 'Aucun audio enregistré.'; const boutonParler = trouver('[data-action="demarrer-vocal"]'); if (boutonParler) boutonParler.disabled = false; terminerAudio(); };
      enregistreurAudio.start();
      finalisationAudioEnCours = true;
    }
    reco.onresult = evenement => { if (sessionVocale !== idEcouteVocale) return; let provisoire = ''; for (let i = evenement.resultIndex; i < evenement.results.length; i++) { const resultat = evenement.results[i], meilleure = Array.from(resultat).sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0]; if (resultat.isFinal) { transcriptionFinale = `${transcriptionFinale} ${meilleure.transcript}`.trim(); redemarragesVocal = 0; } else provisoire += meilleure.transcript; } champ.value = `${transcriptionFinale}${provisoire ? ' ' + provisoire : ''}`; etat.textContent = provisoire ? 'En écoute… la transcription provisoire peut encore changer.' : 'En écoute… touchez « J’ai terminé » à la fin de votre dictée.'; };
    reco.onerror = evenement => { if (sessionVocale !== idEcouteVocale || evenement.error === 'no-speech') return; ecouteVocaleActive = false; etat.textContent = evenement.error === 'not-allowed' || evenement.error === 'service-not-allowed' ? 'Micro refusé. Autorisez-le dans votre navigateur, puis recommencez.' : 'La reconnaissance vocale a été interrompue. Touchez « Commencer à parler » pour réessayer.'; terminer.disabled = true; if (enregistreurAudio?.state === 'recording') enregistreurAudio.stop(); else if (!finalisationAudioEnCours) bouton.disabled = false; };
    reco.onend = () => { if (sessionVocale !== idEcouteVocale) return; if (ecouteVocaleActive && redemarragesVocal < 3) { redemarragesVocal++; etat.textContent = 'Reprise de l’écoute…'; setTimeout(() => { if (!ecouteVocaleActive || sessionVocale !== idEcouteVocale) return; try { reco.start(); reconnaissanceEnCours = reco; } catch { ecouteVocaleActive = false; bouton.disabled = false; terminer.disabled = true; etat.textContent = 'L’écoute s’est arrêtée. Touchez « Commencer à parler » pour reprendre.'; } }, 250); return; } reconnaissanceEnCours = null; ecouteVocaleActive = false; terminer.disabled = true; if (enregistreurAudio?.state === 'recording') enregistreurAudio.stop(); else if (!finalisationAudioEnCours) bouton.disabled = false; };
    reco.start(); reconnaissanceEnCours = reco; ecouteVocaleActive = true; redemarragesVocal = 0; bouton.disabled = true; terminer.disabled = false; etat.textContent = 'En écoute… touchez « J’ai terminé » à la fin de votre dictée.';
  } catch (erreur) { if (enregistreurAudio?.state === 'recording') enregistreurAudio.stop(); fluxAudio?.getTracks().forEach(piste => piste.stop()); fluxAudio = null; bouton.disabled = false; terminer.disabled = true; etat.textContent = erreur.message === 'enregistrement-indisponible' ? 'L’enregistrement audio n’est pas pris en charge par ce navigateur.' : 'Le micro ne peut pas démarrer. Vérifiez son autorisation puis réessayez.'; }
}
function terminerVocal() {
  ecouteVocaleActive = false;
  idEcouteVocale++;
  if (reconnaissanceEnCours) { const reco = reconnaissanceEnCours; reconnaissanceEnCours = null; reco.stop(); }
  if (enregistreurAudio?.state === 'recording') enregistreurAudio.stop();
  const bouton = trouver('[data-action="demarrer-vocal"]'), terminer = trouver('[data-action="terminer-vocal"]');
  if (bouton && !finalisationAudioEnCours) bouton.disabled = false; if (terminer) terminer.disabled = true;
  if (!enregistreurAudio) trouver('#etat-vocal').textContent = 'Dictée terminée. Relisez-la, puis continuez.';
}
const normaliserVoix = texte => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
function prioriteVoix(texte) {
  const phrase = normaliserVoix(texte).replace(/[’']/g, ' ');
  if (/\b(pas urgent|pas d urgence|sans urgence|aucune urgence|pas presse)\b/.test(phrase)) return 'normale';
  if (/\b(quand vous pouvez|quand ce sera possible|pas de delai particulier|priorite basse|priorite faible|faible priorite)\b/.test(phrase)) return 'basse';
  if (/\b(urgent(?:e)?|urgence|prioritaire|priorite haute|haute priorite|au plus vite|des que possible|immediatement|des maintenant|asap)\b/.test(phrase)) return 'haute';
  if (/\bpriorite normale\b/.test(phrase)) return 'normale';
  return '';
}
function dateVoixVersIso(texte) {
  const phrase = normaliserVoix(texte).replace(/[’']/g, ' ');
  const maintenant = new Date(), aujourdHui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const valider = (annee, mois, jour, anneeImplicite = false) => {
    let date = new Date(annee, mois - 1, jour);
    if (date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) return null;
    if (date < aujourdHui && anneeImplicite) { date = new Date(annee + 1, mois - 1, jour); if (date.getMonth() !== mois - 1 || date.getDate() !== jour) return null; }
    return date >= aujourdHui ? iso(date) : null;
  };
  const relative = (jours) => { const date = new Date(aujourdHui); date.setDate(date.getDate() + jours); return iso(date); };
  if (/\b(apres demain|apres-demain)\b/.test(phrase)) return relative(2);
  if (/\b(demain)\b/.test(phrase)) return relative(1);
  if (/\b(aujourd hui|aujourd-hui|ce jour)\b/.test(phrase)) return relative(0);
  const chiffresRelatifs = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix sept': 17, 'dix-huit': 18, 'dix huit': 18, 'dix-neuf': 19, 'dix neuf': 19, vingt: 20 };
  let match = phrase.match(new RegExp(`\\bdans\\s+(\\d+|${Object.keys(chiffresRelatifs).sort((a,b) => b.length-a.length).join('|')})\\s+(jours?|semaines?)\\b`));
  if (match) return relative((chiffresRelatifs[match[1]] || +match[1]) * (match[2].startsWith('semaine') ? 7 : 1));
  if (/\b(fin du mois|fin de ce mois|d ici la fin du mois)\b/.test(phrase)) {
    let dernier = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + 1, 0);
    if (dernier < aujourdHui) dernier = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + 2, 0);
    return iso(dernier);
  }
  const jourSemaine = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
  match = phrase.match(/\b(?:d ici|avant|pour|le|ce)\s+(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+prochain(?:e)?)?\b/) || phrase.match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+prochain(?:e)?\b/);
  if (match) {
    const delta = (jourSemaine[match[1]] - aujourdHui.getDay() + 7) % 7;
    const decalage = delta === 0 || /prochain/.test(match[0]) && delta === 0 ? 7 : delta;
    return relative(decalage);
  }
  match = phrase.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return valider(+match[1], +match[2], +match[3]);
  match = phrase.match(/\b(?:le\s+|pour\s+le\s+|avant\s+le\s+|d ici le\s+)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (match) { let annee = match[3] ? +match[3] : aujourdHui.getFullYear(); if (annee < 100) annee += 2000; return valider(annee, +match[2], +match[1], !match[3]); }
  const moisNoms = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
  const nombres = { premier: 1, '1er': 1, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix sept': 17, 'dix-sept': 17, 'dix huit': 18, 'dix-huit': 18, 'dix neuf': 19, 'dix-neuf': 19, vingt: 20, trente: 30 };
  for (const [mot, jour] of [['et un', 1], ['et deux', 2], ['et trois', 3], ['et quatre', 4], ['et cinq', 5], ['et six', 6], ['et sept', 7], ['et huit', 8], ['et neuf', 9], ['un', 1], ['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9]]) { nombres[`vingt ${mot}`] = 20 + jour; nombres[`vingt-${mot.replace(/ /g, '-')}`] = 20 + jour; }
  nombres['trente et un'] = 31; nombres['trente-et-un'] = 31;
  const formesJour = Object.keys(nombres).sort((a, b) => b.length - a.length).map(mot => mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const formesMois = Object.keys(moisNoms).join('|');
  match = phrase.match(new RegExp(`\\b(?:le\\s+)?(\\d{1,2}|${formesJour})\\s+(?:du\\s+)?(${formesMois})(?:\\s+(\\d{4}))?\\b`));
  if (match) { const jour = /^\d+$/.test(match[1]) ? +match[1] : nombres[match[1]]; return valider(match[3] ? +match[3] : aujourdHui.getFullYear(), moisNoms[match[2]], jour, !match[3]); }
  match = phrase.match(/\b(?:pour\s+le|avant\s+le|d ici le|le)\s+(\d{1,2})(?:er)?\b/);
  if (match) { let mois = aujourdHui.getMonth() + 1, annee = aujourdHui.getFullYear(); let date = new Date(annee, mois - 1, +match[1]); if (date < aujourdHui) { mois++; if (mois > 12) { mois = 1; annee++; } } return valider(annee, mois, +match[1], false); }
  return null;
}
async function utiliserDictée() {
  if (reconnaissanceEnCours || enregistreurAudio?.state === 'recording') terminerVocal();
  await finalisationAudio;
  const texte = trouver('#transcription-vocale').value.trim();
  if (!texte) return notifier('Dictez d’abord votre demande ou votre tâche.', 1);
  const joindreAudio = Boolean(trouver('#inclure-audio')?.checked && audioDemandeVocal);
  const estDemande = estClient(), formulaireId = estDemande ? 'formulaire-demande' : 'formulaire-tache';
  fermerModale();
  if (estDemande) formulaireDemande(); else formulaireTache();
  const formulaire = trouver(`#${formulaireId}`);
  if (!formulaire) return;
  const optionAudio = formulaire.querySelector('[name="joindre_audio"]');
  if (optionAudio) optionAudio.checked = joindreAudio;
  const champs = [...formulaire.querySelectorAll('input,textarea,select')];
  const champTitre = champs.find(champ => champ.name === 'titre');
  // Les virgules séparent titre, pôle, personne assignée et échéance. La phrase libre reste un titre si aucun repère n’est donné.
  const morceaux = texte.split(/[,;.]/).map(partie => partie.trim()).filter(Boolean);
  let titre = (estDemande ? texte.split(/[.!?]/)[0] : morceaux.shift()) || texte;
  titre = titre.replace(/^(?:(?:bonjour|bonsoir|salut)[,!.\s]+)?(?:cr[eé]e?r?\s+(?:une?\s+)?(?:t[aâ]che|demande)\s*[:,-]?\s*)?/i, '').trim() || texte;
  if (estDemande && /^(?:c[' ]est\s+)?(?:tr[eè]s\s+)?(?:urgent(?:e)?|prioritaire|une urgence)[.!\s]*$/i.test(titre)) titre = texte.split(/[.!?]/).map(partie => partie.trim()).find((partie, indice) => indice > 0 && partie) || titre;
  if (estDemande) titre = titre.replace(/^(?:(?:c[' ]est\s+)?(?:tr[eè]s\s+)?(?:urgent(?:e)?|prioritaire|une urgence)[,;:.\s-]*)/i, '').trim() || titre;
  if (estDemande) titre = Array.from(titre).slice(0, 140).join('').trim();
  let poleMention = '', personneMention = '';
  for (const morceau of morceaux) {
    let correspondance;
    if ((correspondance = morceau.match(/^(?:dans\s+)?(?:le\s+)?p[oô]le\s+(.+)$/i))) poleMention = correspondance[1];
    else if ((correspondance = morceau.match(/^(?:assign[eé]e?\s+[aà]|pour)\s+(.+)$/i))) personneMention = correspondance[1];
  }
  champTitre.value = titre;
  if (estDemande) {
    const description = champs.find(champ => champ.name === 'description');
    if (description) description.value = texte;
  }
  if (poleMention) {
    const selectPole = champs.find(champ => champ.name === (estDemande ? 'pole_id' : 'pole_id'));
    const pole = ETAT.poles.find(item => normaliserVoix(item.nom) === normaliserVoix(poleMention.trim())) || ETAT.poles.find(item => normaliserVoix(item.nom).includes(normaliserVoix(poleMention.trim())));
    if (pole && selectPole && [...selectPole.options].some(option => option.value === pole.id)) { selectPole.value = pole.id; selectPole.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  if (!estDemande && personneMention) {
    const cible = normaliserVoix(personneMention.trim());
    const assignee = [...formulaire.querySelectorAll('input[name="assignes"]')].find(input => {
      const nom = normaliserVoix(input.parentElement.textContent.trim()); return nom.includes(cible) || cible.includes(nom);
    });
    if (assignee) assignee.checked = true;
  }
  const dateDetectee = dateVoixVersIso(texte);
  const champEcheance = champs.find(champ => champ.name === (estDemande ? 'echeance_souhaitee' : 'echeance'));
  if (dateDetectee && champEcheance) champEcheance.value = dateDetectee;
  const prioriteDetectee = prioriteVoix(texte);
  const champPriorite = champs.find(champ => champ.name === (estDemande ? 'urgence' : 'priorite'));
  if (prioriteDetectee && champPriorite) champPriorite.value = prioriteDetectee;
  notifier('Dictée ajoutée au formulaire : vérifiez les champs avant de valider.');
}

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
    ['taches', 'assignations', 'sous_taches', 'demandes', 'clients', 'membres_client'].forEach(table => {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table }, surChangement);
    });
    canal.subscribe();
  }
  afficher();
}
async function chargerTout() {
  const [resProfils, resPoles, resLiens, resTaches, resAssignations, resSousTaches, resClients, resMembresClient, resDemandes] = await Promise.all([bdd.from('profils').select('*').order('nom_complet'), bdd.from('poles').select('*').order('nom'), bdd.from('membres_pole').select('*'), bdd.from('taches').select('*'), bdd.from('assignations').select('*'), bdd.from('sous_taches').select('*').order('position'), bdd.from('clients').select('*').order('nom'), bdd.from('membres_client').select('*'), bdd.from('demandes').select('*').order('cree_le', { ascending: false })]);
  ETAT.profils = resProfils.data || [];
  ETAT.poles = resPoles.data || [];
  ETAT.liens = resLiens.data || [];
  ETAT.taches = resTaches.data || [];
  ETAT.assignations = resAssignations.data || [];
  ETAT.sousTaches = resSousTaches.data || [];
  ETAT.clients = resClients.data || [];
  ETAT.membresClient = resMembresClient.data || [];
  ETAT.demandes = resDemandes.data || [];
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
  ${estInscription ? '<label for="champ-nom-complet">Nom complet</label><input id="champ-nom-complet" name="nom_complet" required autocomplete="name"><label for="champ-type-compte">Je suis</label><select id="champ-type-compte" name="type_compte"><option value="membre">Membre de l’équipe 3xCom</option><option value="client">Client de 3xCom</option></select>' : ''}
  <label for="champ-email">Adresse e-mail</label><input id="champ-email" name="email" type="email" required autocomplete="email">
  <label for="champ-mot-de-passe">Mot de passe</label><input id="champ-mot-de-passe" name="password" type="password" minlength="6" required autocomplete="${estInscription ? 'new-password' : 'current-password'}">
  <p class="erreur" id="erreur" role="alert"></p><button class="bouton" style="width:100%;justify-content:center">${estInscription ? 'Créer mon compte' : 'Se connecter'}</button>
  <button type="button" class="lien" data-action="basculer_mode">${estInscription ? 'J’ai déjà un compte' : 'Créer un compte'}</button>${boutonInstaller('bouton fantome cta-large', 'Installer l’application')}</form></section></div>`;
}
function vueAttente(message) {
  trouver('#application').innerHTML = `<div class="centre"><div class="logo" style="color:var(--encre)">3xCom</div><h1>Presque prêt</h1><p class="discret">${echapper(message)}</p><button class="bouton fantome" data-action="deconnexion">Se déconnecter</button>${boutonInstaller()}</div>`;
}
function afficher() {
  const entreesNav = estClient() ? [['demandes', 'Mes demandes']] : [['accueil', 'Accueil'], ['taches', 'Tâches'], ['tableau', 'Tableau'], ['agenda', 'Agenda'], ['poles', 'Pôles'], ...(gereDemandes() ? [['demandes', 'Demandes']] : []), ...(estAdmin() ? [['equipe', 'Équipe']] : [])];
  if (!entreesNav.some(nom => nom[0] === ETAT.vue)) ETAT.vue = entreesNav[0][0];
  const moi = ETAT.moi;
  const boutonVocal = estClient() ? Boolean(ETAT.clients.length) : Boolean(polesGeres().length);
  const etiquetteVocale = estClient() ? 'Demande par vocal' : 'Tâche par vocal';
  trouver('#application').innerHTML = `<aside><div class="logo">3xCom</div><nav>${entreesNav.map(([cle, libelle]) => `<button class="menu ${ETAT.vue === cle ? 'actif' : ''}" data-action="navigation" data-vue="${cle}">${icone(cle)}${libelle}</button>`).join('')}</nav>
  <div class="moi"><div><b>${echapper(nomDe(moi))}</b>${ROLES[moi.role]}</div>${boutonVocal ? `<button class="bouton bouton-vocal-lateral" data-action="saisie-vocale">🎙️ ${etiquetteVocale}</button>` : ''}${boutonInstaller('bouton clair cta-large', 'Installer 3xCom')}<button data-action="deconnexion">Se déconnecter</button></div></aside>
  <div class="coque"><header class="barre-haute"><div class="logo">3xCom</div><div class="barre-actions">${boutonVocal ? `<button class="cta-mini bouton-vocal-haut" data-action="saisie-vocale" aria-label="${etiquetteVocale}">🎙️ <span>${etiquetteVocale}</span></button>` : ''}${boutonInstaller('cta-mini', 'Installer')}<button data-action="deconnexion">Quitter</button></div></header>
  <main${entreesNav.length > 1 ? '' : ' class="sans-barre"'}>${vues[ETAT.vue]()}</main>
  ${entreesNav.length > 1 ? `<nav class="barre-basse">${entreesNav.map(([cle, libelle]) => `<button class="onglet ${ETAT.vue === cle ? 'actif' : ''}" data-action="navigation" data-vue="${cle}">${icone(cle)}${libelle.split(' ')[0]}</button>`).join('')}</nav>` : ''}</div>`;
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
  <select data-filtre="qui" aria-label="Assigné à">${creerOptions(ETAT.profils.filter(utilisateur => utilisateur.actif && estPersonnelCompte(utilisateur)).map(utilisateur => [utilisateur.id, nomDe(utilisateur)]), ETAT.filtres.qui, 'Tout le monde')}</select></div>`;
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
    return enTete(`Bonjour ${echapper((ETAT.moi.nom_complet || '').split(' ')[0] || '')}`, libelleDate) + bandeauDemandes() + `<div class="panneau stats"><div class="stat"><b>${ouvertes.length}</b><span>Tâches ouvertes</span></div><div class="stat ${tachesEnRetard.length ? 'alerte' : ''}"><b>${tachesEnRetard.length}</b><span>En retard</span></div>
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
      <select data-filtre="qui" aria-label="Assigné à">${creerOptions(ETAT.profils.filter(utilisateur => utilisateur.actif && estPersonnelCompte(utilisateur)).map(utilisateur => [utilisateur.id, nomDe(utilisateur)]), filtres.qui, 'Tout le monde')}</select>
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
    return ETAT.ongletEquipe === 'clients' ? vueClients() : vueComptes();
  },
  demandes() {
    return estClient() ? vueDemandesClient() : vueDemandesAgence();
  }
};

/* ---------- Formulaires ---------- */
const casesAssignation = (idPole, coches, desactive = '') => {
  const candidats = ETAT.profils.filter(utilisateur => utilisateur.actif && estPersonnelCompte(utilisateur) && (ETAT.liens.some(lien => lien.pole_id === idPole && lien.utilisateur_id === utilisateur.id) || coches.includes(utilisateur.id)));
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
  <label class="preference" style="color:var(--encre);font-weight:500"><input type="checkbox" name="accepte_demandes" ${pole.accepte_demandes === false ? '' : 'checked'}>Ce pôle accepte les demandes des clients</label>
  <label for="champ-modele-demande">Modèle de demande</label><textarea id="champ-modele-demande" name="modele_demande" rows="4" placeholder="Texte qui préremplit la description quand le client choisit ce pôle">${echapper(pole.modele_demande)}</textarea><small class="discret aide-champ">Listez les informations que le client doit fournir (supports, format, délai…).</small>
  <label>Couleur</label><div class="nuancier">${COULEURS.map(couleur => `<label class="nuance" style="color:${couleur};margin:0"><input type="radio" name="couleur" value="${couleur}" ${couleur === pole.couleur ? 'checked' : ''}><span></span></label>`).join('')}</div>
  <label>Membres</label><div class="cases">${ETAT.profils.filter(utilisateur => utilisateur.actif && estPersonnelCompte(utilisateur)).map(utilisateur => `<label><input type="checkbox" name="membres" value="${utilisateur.id}" ${idsMembres.includes(utilisateur.id) ? 'checked' : ''}>${echapper(nomDe(utilisateur))} <small class="discret">${ROLES[utilisateur.role]}</small></label>`).join('')}</div>
  <div class="actions">${id ? '<button type="button" class="bouton danger" data-action="supprimer_pole">Supprimer</button>' : ''}<button type="button" class="bouton fantome" data-action="fermer">Annuler</button><button class="bouton">Enregistrer</button></div></form>`);
}
async function enregistrerPole(formulaire) {
  const id = formulaire.dataset.id,
    donnees = new FormData(formulaire),
    enregistrement = {
      nom: donnees.get('nom').trim(),
      description: donnees.get('description'),
      couleur: donnees.get('couleur'),
      accepte_demandes: donnees.get('accepte_demandes') === 'on',
      modele_demande: donnees.get('modele_demande') || ''
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

/* ---------- Équipe : comptes et clients ---------- */
const ongletsEquipe = () => `<div class="filtres"><button class="bascule ${ETAT.ongletEquipe === 'clients' ? '' : 'actif'}" data-action="onglet_equipe" data-onglet="comptes">Comptes</button><button class="bascule ${ETAT.ongletEquipe === 'clients' ? 'actif' : ''}" data-action="onglet_equipe" data-onglet="clients">Clients</button></div>`;
function vueComptes() {
  const total = ETAT.profils.length;
  return enTete('Équipe', `${total} compte${total > 1 ? 's' : ''}`) + ongletsEquipe() + `<div class="panneau">${ETAT.profils.map(utilisateur => {
    const estMoi = utilisateur.id === ETAT.moi.id,
      nom = echapper(nomDe(utilisateur)),
      etiquettes = utilisateur.role === 'client' ? groupesDe(utilisateur.id).map(client => client.nom) : ETAT.liens.filter(membre => membre.utilisateur_id === utilisateur.id).map(membre => poleDe(membre.pole_id)?.nom).filter(Boolean);
    return `<div class="membre${utilisateur.actif ? '' : ' en-attente'}"><span class="avatar">${initiales(nomDe(utilisateur))}</span>
    <div class="membre-infos"><div class="membre-nom"><b>${nom}</b>${estMoi ? '<span class="etiquette">Vous</span>' : ''}${utilisateur.actif ? '' : '<span class="etiquette haute">En attente</span>'}</div>
    <small class="discret membre-email">${echapper(utilisateur.email)}</small>
    ${etiquettes.length ? `<div class="membre-poles">${etiquettes.map(libelle => `<span class="etiquette">${echapper(libelle)}</span>`).join('')}</div>` : ''}</div>
    <div class="membre-actions"><select data-role="${utilisateur.id}" ${estMoi ? 'disabled' : ''} aria-label="Rôle de ${nom}">${Object.entries(ROLES).map(([cle, libelle]) => `<option value="${cle}" ${utilisateur.role === cle ? 'selected' : ''}>${libelle}</option>`).join('')}</select>
    <label class="interrupteur"><input type="checkbox" role="switch" data-actif="${utilisateur.id}" ${utilisateur.actif ? 'checked' : ''} ${estMoi ? 'disabled' : ''}><span>Actif</span></label></div></div>`;
  }).join('')}</div><p class="discret" style="margin-top:14px">Rattachez les membres à leurs pôles depuis la page Pôles, et les clients à leur groupe depuis l’onglet Clients.</p>`;
}
function vueClients() {
  const liste = ETAT.clients;
  return enTete('Équipe', `${liste.length} client${liste.length > 1 ? 's' : ''}`, '<button class="bouton" data-action="nouveau_client">Nouveau client</button>') + ongletsEquipe() + (liste.length ? `<div class="cartes">${liste.map(client => {
    const membres = ETAT.membresClient.filter(lien => lien.client_id === client.id).map(lien => utilisateurDe(lien.utilisateur_id)).filter(Boolean),
      demandes = ETAT.demandes.filter(demande => demande.client_id === client.id),
      ouvertes = demandes.filter(demande => !['terminee', 'refusee'].includes(demande.statut)).length;
    return `<button class="pole" style="--couleur:#2C5AA0" data-action="modifier_client" data-id="${client.id}"><h2>${echapper(client.nom)}</h2><p class="discret">${echapper(client.description) || 'Aucune description'}</p>
      <div class="discret">${demandes.length} demande${demandes.length > 1 ? 's' : ''} · ${ouvertes} en cours</div>
      <div style="display:flex">${membres.slice(0, 5).map(utilisateur => `<span class="avatar" title="${echapper(nomDe(utilisateur))}" style="margin-right:-8px;border:2px solid #fff">${initiales(nomDe(utilisateur))}</span>`).join('')}${membres.length > 5 ? `<span class="discret" style="margin-left:16px">+${membres.length - 5}</span>` : ''}${membres.length ? '' : '<span class="discret">Aucune personne rattachée</span>'}</div></button>`;
  }).join('')}</div>` : '<div class="panneau"><div class="vide">Créez votre premier client, puis rattachez-y les personnes qui ont créé un compte client.<button class="bouton" data-action="nouveau_client">Nouveau client</button></div></div>');
}
function formulaireClient(id) {
  const client = id ? clientDe(id) : {},
    idsMembres = ETAT.membresClient.filter(lien => lien.client_id === id).map(lien => lien.utilisateur_id),
    comptes = ETAT.profils.filter(utilisateur => utilisateur.role === 'client');
  ouvrirModale(`<form class="formulaire-modale" id="formulaire-client" data-id="${id || ''}"><h2>${id ? 'Modifier le client' : 'Nouveau client'}</h2>
  <label for="champ-nom-client">Nom du client</label><input id="champ-nom-client" name="nom" required value="${echapper(client.nom)}">
  <label for="champ-description-client">Description</label><textarea id="champ-description-client" name="description" rows="2">${echapper(client.description)}</textarea>
  <label>Personnes du groupe</label><div class="cases">${comptes.length ? comptes.map(utilisateur => `<label><input type="checkbox" name="membres" value="${utilisateur.id}" ${idsMembres.includes(utilisateur.id) ? 'checked' : ''}>${echapper(nomDe(utilisateur))} <small class="discret">${utilisateur.actif ? echapper(utilisateur.email) : 'en attente de validation'}</small></label>`).join('') : '<p class="discret">Aucun compte client pour le moment. Les clients créent leur compte depuis l’écran de connexion (« Je suis » : Client), puis vous le validez dans Équipe.</p>'}</div>
  <div class="actions">${id ? '<button type="button" class="bouton danger" data-action="supprimer_client">Supprimer</button>' : ''}<button type="button" class="bouton fantome" data-action="fermer">Annuler</button><button class="bouton">Enregistrer</button></div></form>`);
}
async function enregistrerClient(formulaire) {
  const id = formulaire.dataset.id,
    donnees = new FormData(formulaire),
    enregistrement = {
      nom: donnees.get('nom').trim(),
      description: donnees.get('description')
    };
  let idClient = id;
  if (id) {
    const { error } = await bdd.from('clients').update(enregistrement).eq('id', id);
    if (error) return notifier(error.message, 1);
  } else {
    const { data, error } = await bdd.from('clients').insert(enregistrement).select().single();
    if (error) return notifier(error.message, 1);
    idClient = data.id;
  }
  await bdd.from('membres_client').delete().eq('client_id', idClient);
  const idsChoisis = donnees.getAll('membres');
  if (idsChoisis.length) {
    const { error } = await bdd.from('membres_client').insert(idsChoisis.map(idUtilisateur => ({ client_id: idClient, utilisateur_id: idUtilisateur })));
    if (error) return notifier(error.message, 1);
  }
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Client enregistré');
}
async function supprimerClient(id) {
  const { error } = await bdd.from('clients').delete().eq('id', id);
  if (error) return notifier(error.message, 1);
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Client supprimé');
}

/* ---------- Demandes d'intervention ---------- */
const ligneDemande = demande => {
  const pole = poleDe(demande.pole_id),
    client = clientDe(demande.client_id),
    suivi = SUIVI_DEMANDE.includes(demande.statut),
    precisions = [estClient() && ETAT.clients.length < 2 ? '' : client?.nom, pole?.nom || 'Pôle non défini', 'reçue le ' + formaterDate(formatIso(new Date(demande.cree_le)))].filter(Boolean).map(echapper).join(' · ');
  return `<button class="tache" data-action="demande" data-id="${demande.id}" style="--couleur:${pole?.couleur || '#697089'}"><span class="pastille"></span>
  <span style="min-width:0"><b class="tronque" style="display:block">${echapper(demande.titre)}</b><small class="discret tronque" style="display:block">${precisions}</small></span>
  <span class="etiquette ${demande.statut}">${STATUTS_DEMANDE[demande.statut]}</span>
  <span class="tache-progression">${suivi ? `<span class="barre"><i style="width:${demande.progression}%"></i></span><small>${demande.progression}%</small>` : ''}</span>
  <span class="tache-echeance">${demande.echeance_souhaitee ? 'Souhaitée : ' + formaterDate(demande.echeance_souhaitee) : 'Sans échéance'}</span></button>`;
};
function vueDemandesClient() {
  const action = ETAT.clients.length ? '<button class="bouton" data-action="nouvelle_demande">Nouvelle demande</button>' : '';
  let corps;
  if (!ETAT.clients.length) corps = '<div class="vide">Votre compte n’est pas encore rattaché à un groupe client. Contactez 3xCom pour finaliser votre accès.</div>';
  else if (!ETAT.demandes.length) corps = `<div class="vide">Vous n’avez fait aucune demande pour le moment.${action ? '<button class="bouton" data-action="nouvelle_demande">Faire une demande</button>' : ''}</div>`;
  else corps = ETAT.demandes.map(ligneDemande).join('');
  return enTete('Mes demandes', ETAT.clients.map(client => echapper(client.nom)).join(', ') || 'Suivi de vos demandes d’intervention', action) + `<div class="panneau">${corps}</div>`;
}
function vueDemandesAgence() {
  const filtres = ETAT.filtres,
    liste = ETAT.demandes.filter(demande => (!filtres.demandeStatut || demande.statut === filtres.demandeStatut) && (!filtres.demandeClient || demande.client_id === filtres.demandeClient) && (!filtres.demandePole || demande.pole_id === filtres.demandePole)).sort((premiere, seconde) => (seconde.statut === 'nouvelle') - (premiere.statut === 'nouvelle')),
    nouvelles = ETAT.demandes.filter(demande => demande.statut === 'nouvelle').length,
    options = (elements, valeur, texteTous) => `<option value="">${texteTous}</option>` + elements.map(([cle, libelle]) => `<option value="${cle}" ${valeur === cle ? 'selected' : ''}>${echapper(libelle)}</option>`).join('');
  return enTete('Demandes', `${liste.length} demande${liste.length > 1 ? 's' : ''}${nouvelles ? ` · ${nouvelles} à traiter` : ''}`, estAdmin() && ETAT.clients.length ? '<button class="bouton" data-action="nouvelle_demande">Nouvelle demande</button>' : '') + `<div class="filtres">
    <select data-filtre="demandeStatut" aria-label="Statut">${options(Object.entries(STATUTS_DEMANDE), filtres.demandeStatut, 'Tous les statuts')}</select>
    <select data-filtre="demandeClient" aria-label="Client">${options(ETAT.clients.map(client => [client.id, client.nom]), filtres.demandeClient, 'Tous les clients')}</select>
    <select data-filtre="demandePole" aria-label="Pôle">${options(ETAT.poles.map(pole => [pole.id, pole.nom]), filtres.demandePole, 'Tous les pôles')}</select></div>
    <div class="panneau">${liste.length ? liste.map(ligneDemande).join('') : '<div class="vide">Aucune demande ne correspond.</div>'}</div>`;
}
function formulaireDemande() {
  const poles = polesOuverts(),
    groupes = ETAT.clients;
  if (!groupes.length) return notifier('Aucun groupe client n’est disponible.', 1);
  if (!estClient() && !poles.length) return notifier('Aucun pôle n’accepte de demandes pour le moment.', 1);
  const premier = poles[0],
    modele = echapper(estClient() ? '' : premier?.modele_demande || '');
  ouvrirModale(`<form class="formulaire-modale" id="formulaire-demande"><h2>Nouvelle demande</h2><p class="discret">Décrivez l’intervention souhaitée : l’agence vous répond directement ici.</p>
  ${groupes.length > 1 || estAdmin() ? `<label for="champ-client">Client</label><select id="champ-client" name="client_id">${groupes.map(client => `<option value="${client.id}">${echapper(client.nom)}</option>`).join('')}</select>` : `<input type="hidden" name="client_id" value="${groupes[0].id}">`}
  ${estClient() ? '<p class="discret aide-champ">Pas besoin de choisir une équipe : 3xCom orientera votre demande.</p>' : `<label for="champ-pole-demande">Pôle concerné</label><select id="champ-pole-demande" name="pole_id">${poles.map(pole => `<option value="${pole.id}">${echapper(pole.nom)}</option>`).join('')}</select><small class="discret aide-champ" id="aide-pole">${echapper(premier.description)}</small>`}
  <label for="champ-titre-demande">Objet de la demande</label><input id="champ-titre-demande" name="titre" required maxlength="140">
  <label for="champ-description-demande">Description</label><textarea id="champ-description-demande" name="description" rows="6" data-modele="${modele}">${modele}</textarea>
  ${audioDemandeVocal ? '<label class="option-audio"><input type="checkbox" name="joindre_audio" checked> Joindre aussi l’enregistrement audio</label>' : ''}
  <div class="grille2"><div><label for="champ-urgence">Urgence</label><select id="champ-urgence" name="urgence">${Object.entries(PRIORITES).map(([cle, libelle]) => `<option value="${cle}" ${cle === 'normale' ? 'selected' : ''}>${libelle}</option>`).join('')}</select></div>
  <div><label for="champ-echeance-demande">Date souhaitée</label><input id="champ-echeance-demande" type="date" name="echeance_souhaitee" min="${aujourdhui()}"></div></div>
  <div class="actions"><button type="button" class="bouton fantome" data-action="fermer">Annuler</button><button type="submit" class="bouton">Envoyer la demande</button></div><p id="erreur-demande" class="erreur" role="alert"></p></form>`);
}
function expliquerErreurDemande(erreur) {
  const detail = String(erreur?.message || erreur || ''), bas = detail.toLocaleLowerCase('fr-FR');
  let message = detail || 'La demande n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.';
  if (bas.startsWith('audio:')) message = estClient() ? 'L’enregistrement audio n’a pas pu être joint. Décochez l’option audio et réessayez, ou contactez 3xCom.' : 'Vérifiez la configuration du stockage privé des audios de demandes.';
  else if (/pole_id/.test(bas) && (erreur?.code === '23502' || /not.null|null value/.test(bas))) message = estClient() ? 'Le service de demandes doit être mis à jour. Votre demande n’a pas été envoyée; contactez 3xCom ou réessayez plus tard.' : 'La base doit être mise à jour pour accepter les demandes sans pôle : exécutez supabase/migration_audio_demandes.sql.';
  else if (/audio_path|bucket not found/.test(bas) && (/column|schema cache|does not exist|could not find|bucket not found/.test(bas))) message = estClient() ? 'L’enregistrement audio n’a pas pu être joint. Décochez l’option audio et réessayez, ou contactez 3xCom.' : 'La base doit être mise à jour pour joindre un audio : exécutez supabase/migration_audio_demandes.sql.';
  else if (/row.level security|permission denied|not authorized/.test(bas)) message = estClient() ? 'Votre compte n’est pas autorisé à envoyer cette demande. Contactez votre interlocuteur 3xCom.' : 'L’accès à la demande a été refusé par les règles de sécurité.';
  else if (estClient()) message = 'Impossible d’envoyer la demande. Vérifiez votre connexion, puis réessayez. Si le problème continue, contactez 3xCom.';
  const zone = trouver('#erreur-demande');
  if (zone) zone.textContent = message;
  notifier(message, true);
}
async function enregistrerDemande(formulaire) {
  const donnees = Object.fromEntries(new FormData(formulaire)), bouton = formulaire.querySelector('button[type="submit"]');
  bouton.disabled = true;
  let cheminAudio = null;
  try {
    if (audioDemandeVocal && donnees.joindre_audio === 'on') {
      const extension = audioDemandeVocal.type.includes('mp4') ? 'm4a' : audioDemandeVocal.type.includes('ogg') ? 'ogg' : 'webm';
      cheminAudio = `${ETAT.moi.id}/${crypto.randomUUID()}.${extension}`;
      const { error: erreurAudio } = await bdd.storage.from('audios-demandes').upload(cheminAudio, audioDemandeVocal, { contentType: audioDemandeVocal.type.split(';')[0], upsert: false });
      if (erreurAudio) { bouton.disabled = false; return expliquerErreurDemande(`Audio : ${erreurAudio.message}`); }
    }
    const nouvelleDemande = {
      client_id: donnees.client_id,
      cree_par: ETAT.moi.id,
      pole_id: donnees.pole_id || null,
      titre: donnees.titre.trim(),
      description: donnees.description.trim(),
      urgence: donnees.urgence,
      echeance_souhaitee: donnees.echeance_souhaitee || null
    };
    if (cheminAudio) nouvelleDemande.audio_path = cheminAudio;
    const { error } = await bdd.from('demandes').insert(nouvelleDemande);
    if (error) {
      if (cheminAudio) await bdd.storage.from('audios-demandes').remove([cheminAudio]);
      bouton.disabled = false;
      return expliquerErreurDemande(error);
    }
  } catch (erreur) {
    if (cheminAudio) await bdd.storage.from('audios-demandes').remove([cheminAudio]);
    bouton.disabled = false;
    return expliquerErreurDemande(erreur);
  }
  audioDemandeVocal = null;
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Demande envoyée');
}
async function ouvrirDemande(id) {
  const demande = ETAT.demandes.find(element => element.id === id);
  if (!demande) return;
  const pole = poleDe(demande.pole_id),
    client = clientDe(demande.client_id),
    auteur = utilisateurDe(demande.cree_par),
    lie = Boolean(demande.tache_id),
    suivi = SUIVI_DEMANDE.includes(demande.statut),
    peutTraiter = !estClient() && (estAdmin() || peutGerer(demande.pole_id));
  let audio = '';
  if (demande.audio_path) {
    const { data: fichierAudio } = await bdd.storage.from('audios-demandes').createSignedUrl(demande.audio_path, 3600);
    if (fichierAudio?.signedUrl) audio = `<label>Enregistrement audio</label><audio class="audio-demande" controls preload="none" src="${echapper(fichierAudio.signedUrl)}">Votre navigateur ne peut pas lire cet enregistrement.</audio>`;
  }
  const resume = `<h2>${echapper(demande.titre)}</h2><div class="demande-meta"><span class="etiquette ${demande.statut}">${STATUTS_DEMANDE[demande.statut]}</span>${demande.urgence === 'haute' ? '<span class="etiquette haute">Urgence haute</span>' : ''}</div>
  ${suivi ? `<div class="tache-progression" style="margin-top:14px"><span class="barre"><i style="width:${demande.progression}%"></i></span><small>${demande.progression}%</small></div>` : ''}${audio}
  <dl class="detail">${!estClient() || ETAT.clients.length > 1 ? `<dt>Client</dt><dd>${echapper(client?.nom || '—')}</dd>` : ''}<dt>Pôle</dt><dd>${echapper(pole?.nom || '—')}</dd><dt>Demandée par</dt><dd>${echapper(auteur ? nomDe(auteur) : '—')}, le ${formaterDate(formatIso(new Date(demande.cree_le)))}</dd><dt>Date souhaitée</dt><dd>${demande.echeance_souhaitee ? formaterDate(demande.echeance_souhaitee) : '—'}</dd></dl>
  <label>Description</label><p class="texte-libre">${echapper(demande.description) || 'Aucune description'}</p>`;
  if (estClient()) {
    ouvrirModale(`<div class="formulaire-modale">${resume}${demande.reponse ? `<label>Réponse de l’agence</label><p class="texte-libre reponse">${echapper(demande.reponse)}</p>` : ''}<div class="actions"><button type="button" class="bouton" data-action="fermer">Fermer</button></div></div>`);
    return;
  }
  const voirTache = lie && ETAT.taches.some(tache => tache.id === demande.tache_id),
    creerTache = !lie && peutTraiter && demande.statut !== 'refusee';
  ouvrirModale(`<form class="formulaire-modale" id="formulaire-traitement" data-id="${demande.id}">${resume}
  <div class="grille2"><div><label for="champ-statut-demande">Statut</label><select id="champ-statut-demande" name="statut" ${lie || !peutTraiter ? 'disabled' : ''}>${Object.entries(STATUTS_DEMANDE).map(([cle, libelle]) => `<option value="${cle}" ${demande.statut === cle ? 'selected' : ''}>${libelle}</option>`).join('')}</select></div>
  ${estAdmin() ? `<div><label for="champ-pole-traitement">Pôle</label><select id="champ-pole-traitement" name="pole_id">${demande.pole_id ? '' : '<option value="">—</option>'}${ETAT.poles.map(element => `<option value="${element.id}" ${element.id === demande.pole_id ? 'selected' : ''}>${echapper(element.nom)}</option>`).join('')}</select></div>` : ''}</div>
  ${lie ? '<small class="discret aide-champ">Le statut suit automatiquement l’avancement de la tâche liée.</small>' : ''}
  <label for="champ-reponse">Réponse au client</label><textarea id="champ-reponse" name="reponse" rows="3" placeholder="Message visible par le client" ${peutTraiter ? '' : 'disabled'}>${echapper(demande.reponse)}</textarea>
  <div class="actions">${estAdmin() ? '<button type="button" class="bouton danger" data-action="supprimer_demande">Supprimer</button>' : ''}${voirTache ? `<button type="button" class="bouton fantome" data-action="voir_tache" data-id="${demande.tache_id}">Voir la tâche</button>` : ''}${creerTache ? '<button type="button" class="bouton fantome" data-action="convertir_demande">Créer la tâche</button>' : ''}<button type="button" class="bouton fantome" data-action="fermer">${peutTraiter ? 'Annuler' : 'Fermer'}</button>${peutTraiter ? '<button class="bouton">Enregistrer</button>' : ''}</div></form>`);
}
async function enregistrerTraitement(formulaire) {
  const id = formulaire.dataset.id,
    demande = ETAT.demandes.find(element => element.id === id),
    champs = formulaire.elements,
    modifs = { reponse: champs.reponse.value.trim() };
  if (!demande) return;
  if (!demande.tache_id && champs.statut && !champs.statut.disabled) modifs.statut = champs.statut.value;
  if (estAdmin() && champs.pole_id && champs.pole_id.value && champs.pole_id.value !== demande.pole_id) modifs.pole_id = champs.pole_id.value;
  const { error } = await bdd.from('demandes').update(modifs).eq('id', id);
  if (error) return notifier(error.message, 1);
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Demande enregistrée');
}
async function convertirDemande(id) {
  const demande = ETAT.demandes.find(element => element.id === id),
    formulaire = trouver('#formulaire-traitement');
  if (!demande || !formulaire) return;
  const idPole = estAdmin() && formulaire.elements.pole_id && formulaire.elements.pole_id.value ? formulaire.elements.pole_id.value : demande.pole_id,
    reponse = formulaire.elements.reponse.value.trim();
  if (!idPole || !peutGerer(idPole)) return notifier('Vous ne pouvez pas créer de tâche dans ce pôle.', 1);
  const client = clientDe(demande.client_id),
    { data: tache, error } = await bdd.from('taches').insert({
      titre: demande.titre,
      description: `Demande de ${client?.nom || 'un client'}${demande.description ? '\n\n' + demande.description : ''}`,
      pole_id: idPole,
      priorite: demande.urgence,
      echeance: demande.echeance_souhaitee || null
    }).select().single();
  if (error) return notifier(error.message, 1);
  const modifs = { tache_id: tache.id, reponse };
  if (estAdmin() && idPole !== demande.pole_id) modifs.pole_id = idPole;
  const { error: erreurLien } = await bdd.from('demandes').update(modifs).eq('id', id);
  if (erreurLien) return notifier(erreurLien.message, 1);
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Tâche créée : assignez-la à l’équipe');
  if (ETAT.taches.some(element => element.id === tache.id)) formulaireTache(tache.id);
}
async function supprimerDemande(id) {
  const { error } = await bdd.from('demandes').delete().eq('id', id);
  if (error) return notifier(error.message, 1);
  fermerModale();
  await chargerTout();
  afficher();
  notifier('Demande supprimée');
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
  } else if (action === 'saisie-vocale') {
    ouvrirSaisieVocale();
  } else if (action === 'demarrer-vocal') {
    demarrerVocal(bouton);
  } else if (action === 'terminer-vocal') {
    terminerVocal();
  } else if (action === 'utiliser-vocal') {
    utiliserDictée();
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
  } else if (action === 'nouvelle_demande') {
    formulaireDemande();
  } else if (action === 'demande') {
    ouvrirDemande(id);
  } else if (action === 'voir_tache') {
    fermerModale();
    formulaireTache(id);
  } else if (action === 'convertir_demande') {
    convertirDemande(trouver('#formulaire-traitement').dataset.id);
  } else if (action === 'supprimer_demande' && confirm('Supprimer cette demande ?')) {
    supprimerDemande(trouver('#formulaire-traitement').dataset.id);
  } else if (action === 'onglet_equipe') {
    ETAT.ongletEquipe = bouton.dataset.onglet;
    afficher();
  } else if (action === 'nouveau_client') {
    formulaireClient();
  } else if (action === 'modifier_client') {
    formulaireClient(id);
  } else if (action === 'supprimer_client' && confirm('Supprimer ce client et toutes ses demandes ?')) {
    supprimerClient(trouver('#formulaire-client').dataset.id);
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
  if (formulaire.id === 'formulaire-demande') return enregistrerDemande(formulaire);
  if (formulaire.id === 'formulaire-traitement') return enregistrerTraitement(formulaire);
  if (formulaire.id === 'formulaire-client') return enregistrerClient(formulaire);
  if (formulaire.id === 'formulaire-connexion') {
    const donnees = Object.fromEntries(new FormData(formulaire)),
      zoneErreur = trouver('#erreur');
    zoneErreur.textContent = '';
    const reponse = ETAT.mode === 'inscription' ? await bdd.auth.signUp({
      email: donnees.email,
      password: donnees.password,
      options: {
        data: {
          nom_complet: donnees.nom_complet,
          type_compte: donnees.type_compte === 'client' ? 'client' : 'membre'
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
  } else if (cible.id === 'champ-pole-demande') {
    const pole = poleDe(cible.value),
      zone = trouver('#champ-description-demande');
    if (zone.value.trim() === '' || zone.value === zone.dataset.modele) zone.value = pole?.modele_demande || '';
    zone.dataset.modele = pole?.modele_demande || '';
    trouver('#aide-pole').textContent = pole?.description || '';
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
