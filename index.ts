// deno-lint-ignore-file no-explicit-any
// Fonction Edge « notifier » : envoie à l'administrateur les e-mails importants de Suivi 3xCom, via Resend.
// Appelée uniquement par la base de données (en-tête x-secret), jamais par le navigateur.
// Évènements : relecture, nouveau_compte, nouvelle_demande, rappels (et test pour vérifier la configuration).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const bdd = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CLE_RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const EXPEDITEUR = Deno.env.get('MAIL_FROM') ?? Deno.env.get('RESEND_FROM') ?? '3xCom <onboarding@resend.dev>';
const SECRET = Deno.env.get('WEBHOOK_SECRET') ?? Deno.env.get('NOTIF_SECRET') ?? '';
const URL_APP = Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '';
// Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte Resend : c'est l'adresse de l'administrateur.
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? '';

type Message = { subject: string; html: string };

const echapper = (texte: unknown) => String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dateFr = (date: string | null) => date ? new Date(date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'sans échéance';
const URGENCES: Record<string, string> = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };

function gabarit(titre: string, paragraphes: string[]): string {
  return `<div style="font-family:Arial,sans-serif;background:#F2F3F6;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:#14162A;color:#fff;padding:18px 24px;font-size:22px">3x<span style="color:#E0517F">Com</span></div>
  <div style="padding:24px;color:#14162A;line-height:1.5"><h2 style="margin:0 0 12px;font-size:20px">${echapper(titre)}</h2>
  ${paragraphes.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('')}
  ${URL_APP ? `<p style="margin:20px 0 0"><a href="${URL_APP}" style="background:#8E1F45;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;display:inline-block">Ouvrir 3xCom</a></p>` : ''}
  </div></div></div>`;
}

// Petits accès à la base (clé de service : aucune règle d'accès ne s'applique ici)
async function un(table: string, colonnes: string, id: string | null | undefined): Promise<any> {
  if (!id) return null;
  const { data } = await bdd.from(table).select(colonnes).eq('id', id).maybeSingle();
  return data;
}
const nomDe = (profil: any) => profil ? (profil.nom_complet || profil.email) : 'quelqu’un';
async function nomsAssignes(idsTaches: string[]): Promise<Record<string, string[]>> {
  const resultat: Record<string, string[]> = {};
  if (!idsTaches.length) return resultat;
  const { data: liens } = await bdd.from('assignations').select('tache_id, utilisateur_id').in('tache_id', idsTaches);
  const idsPersonnes = [...new Set((liens ?? []).map((l: any) => l.utilisateur_id))];
  const { data: profils } = idsPersonnes.length ? await bdd.from('profils').select('id, nom_complet, email').in('id', idsPersonnes) : { data: [] };
  for (const lien of liens ?? []) {
    const profil = (profils ?? []).find((p: any) => p.id === lien.utilisateur_id);
    (resultat[lien.tache_id] ??= []).push(nomDe(profil));
  }
  return resultat;
}

// Une tâche passe « en relecture »
async function relecture(e: any): Promise<Message[]> {
  const tache = await un('taches', 'id, titre, pole_id', e.tache_id);
  if (!tache) return [];
  const auteur = await un('profils', 'nom_complet, email', e.par);
  if (auteur?.email && auteur.email === ADMIN_EMAIL) return []; // l'administrateur vient de le faire lui-même
  const pole = await un('poles', 'nom', tache.pole_id);
  const assignes = (await nomsAssignes([tache.id]))[tache.id] ?? [];
  return [{
    subject: `À relire : ${tache.titre}`,
    html: gabarit('Une tâche attend votre relecture', [
      `<b>${echapper(tache.titre)}</b>`,
      `Pôle : ${echapper(pole?.nom ?? '')}<br>Assignée à : ${echapper(assignes.join(', ') || 'personne')}${auteur ? `<br>Passée en relecture par : ${echapper(nomDe(auteur))}` : ''}`,
    ]),
  }];
}

// Un compte (membre ou client) vient d'être créé et attend votre validation
async function nouveauCompte(e: any): Promise<Message[]> {
  const nouveau = await un('profils', 'nom_complet, email, role', e.utilisateur_id);
  if (!nouveau) return [];
  const estClient = nouveau.role === 'client';
  let groupe = '';
  if (estClient) {
    const { data: liens } = await bdd.from('membres_client').select('client_id').eq('utilisateur_id', e.utilisateur_id);
    const noms = [];
    for (const lien of liens ?? []) noms.push((await un('clients', 'nom', lien.client_id))?.nom);
    groupe = noms.filter(Boolean).join(', ');
  }
  return [{
    subject: `Nouvelle demande d’accès à 3xCom${estClient ? ' (client)' : ''}`,
    html: gabarit('Nouvelle demande d’accès', [
      `<b>${echapper(nouveau.nom_complet || nouveau.email)}</b> (${echapper(nouveau.email)}) a créé un compte ${estClient ? 'client' : 'membre'} et attend votre validation.`,
      estClient ? (groupe ? `Il s’est rattaché au groupe « ${echapper(groupe)} » : vérifiez que c’est bien lui avant de l’activer dans Équipe.` : 'Il n’a choisi aucun groupe : activez-le dans Équipe, puis rattachez-le à son groupe dans l’onglet Clients.') : 'Rendez-vous dans l’onglet Équipe pour l’activer et choisir son rôle.',
    ]),
  }];
}

// Un client envoie une demande d'intervention
async function nouvelleDemande(e: any): Promise<Message[]> {
  const demande = await un('demandes', 'id, titre, description, urgence, echeance_souhaitee, client_id, pole_id, cree_par', e.demande_id);
  if (!demande) return [];
  const [client, pole, auteur] = await Promise.all([
    un('clients', 'nom', demande.client_id), un('poles', 'nom', demande.pole_id), un('profils', 'nom_complet, email', demande.cree_par),
  ]);
  const extrait = demande.description ? String(demande.description).slice(0, 600) : '';
  return [{
    subject: `Nouvelle demande de ${client?.nom ?? 'un client'} : ${demande.titre}`,
    html: gabarit('Nouvelle demande d’intervention', [
      `<b>${echapper(demande.titre)}</b>`,
      `Client : ${echapper(client?.nom ?? '—')}${auteur ? ` (${echapper(nomDe(auteur))})` : ''}<br>Pôle demandé : ${echapper(pole?.nom ?? '—')}<br>Urgence : ${echapper(URGENCES[demande.urgence] ?? demande.urgence)}<br>Date souhaitée : ${echapper(dateFr(demande.echeance_souhaitee))}`,
      ...(extrait ? [echapper(extrait).replace(/\n/g, '<br>')] : []),
      'Ouvrez l’onglet Demandes pour la traiter.',
    ]),
  }];
}

// Récapitulatif quotidien : retards, échéances du jour et du lendemain, demandes en attente
async function rappels(): Promise<Message[]> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const demain = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data: taches } = await bdd.from('taches').select('id, titre, echeance').neq('statut', 'terminee').not('echeance', 'is', null).lte('echeance', demain).order('echeance');
  const { data: demandes } = await bdd.from('demandes').select('titre').eq('statut', 'nouvelle');
  const liste = taches ?? [];
  if (!liste.length && !(demandes ?? []).length) return [];
  const assignes = await nomsAssignes(liste.map((t: any) => t.id));
  const ligne = (t: any) => `• ${echapper(t.titre)} (${echapper(dateFr(t.echeance))}) — ${echapper((assignes[t.id] ?? []).join(', ') || 'non assignée')}`;
  const retard = liste.filter((t: any) => t.echeance < aujourdhui), proches = liste.filter((t: any) => t.echeance >= aujourdhui);
  const section = (titre: string, lignes: string[]) => lignes.length ? `<b>${titre}</b><br>${lignes.join('<br>')}` : '';
  const sujet = retard.length ? `${retard.length} tâche(s) en retard` : (demandes ?? []).length ? `${(demandes ?? []).length} demande(s) à traiter` : 'Échéances du jour';
  return [{
    subject: `Récapitulatif 3xCom : ${sujet}`,
    html: gabarit('Récapitulatif du jour', [
      section('En retard', retard.map(ligne)),
      section('Aujourd’hui et demain', proches.map(ligne)),
      section('Demandes à traiter', (demandes ?? []).map((d: any) => `• ${echapper(d.titre)}`)),
    ].filter(Boolean)),
  }];
}

// Pour vérifier la configuration : { "type": "test" }
async function test(): Promise<Message[]> {
  return [{ subject: 'Test des notifications 3xCom', html: gabarit('Test réussi', ['Les e-mails de Suivi 3xCom fonctionnent.']) }];
}

async function envoyer(messages: Message[]) {
  if (!messages.length) return { envoyes: 0 }; // rien à envoyer : on évite un appel Resend inutile
  if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL manquant : adresse de l’administrateur (celle du compte Resend)');
  const reponse = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLE_RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages.map((m) => ({ from: EXPEDITEUR, to: [ADMIN_EMAIL], subject: m.subject, html: m.html }))),
  });
  if (!reponse.ok) throw new Error(`Resend ${reponse.status} : ${await reponse.text()}`);
  return { envoyes: messages.length };
}

const GESTIONNAIRES: Record<string, (e: any) => Promise<Message[]>> = {
  relecture, nouveau_compte: nouveauCompte, nouvelle_demande: nouvelleDemande, rappels, test,
};

Deno.serve(async (requete) => {
  if (!SECRET || requete.headers.get('x-secret') !== SECRET) return new Response('Non autorisé', { status: 401 });
  try {
    const evenement = await requete.json();
    const gestionnaire = GESTIONNAIRES[evenement.type];
    if (!gestionnaire) return new Response('Type inconnu', { status: 400 });
    return Response.json(await envoyer(await gestionnaire(evenement)));
  } catch (erreur) {
    console.error(erreur);
    return new Response(String(erreur), { status: 500 });
  }
});
