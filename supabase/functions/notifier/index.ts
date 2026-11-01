// deno-lint-ignore-file no-explicit-any
// Fonction Edge « notifier » : envoie les e-mails de Suivi 3xCom via Resend.
// Appelée uniquement par la base de données (en-tête x-secret), jamais par le navigateur.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const bdd = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CLE_RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const EXPEDITEUR = Deno.env.get('RESEND_FROM') ?? '3xCom <onboarding@resend.dev>';
const SECRET = Deno.env.get('NOTIF_SECRET') ?? '';
const URL_APP = Deno.env.get('APP_URL') ?? '';

type Message = { to: string; subject: string; html: string };

const echapper = (texte: unknown) => String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dateFr = (date: string | null) => date ? new Date(date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'sans échéance';

function gabarit(titre: string, paragraphes: string[]): string {
  return `<div style="font-family:Arial,sans-serif;background:#F2F3F6;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:#14162A;color:#fff;padding:18px 24px;font-size:22px">3x<span style="color:#E0517F">Com</span></div>
  <div style="padding:24px;color:#14162A;line-height:1.5"><h2 style="margin:0 0 12px;font-size:20px">${echapper(titre)}</h2>
  ${paragraphes.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('')}
  ${URL_APP ? `<p style="margin:20px 0 0"><a href="${URL_APP}" style="background:#8E1F45;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;display:inline-block">Ouvrir 3xCom</a></p>` : ''}
  </div></div></div>`;
}

// Profils actifs qui ont accepté les e-mails
async function destinataires(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  const { data } = await bdd.from('profils').select('id, nom_complet, email').in('id', ids).eq('actif', true).eq('notifications_email', true);
  return data ?? [];
}
async function tache(id: string): Promise<any> {
  const { data } = await bdd.from('taches').select('id, titre, description, echeance, pole_id').eq('id', id).single();
  return data;
}
async function nomPole(id: string): Promise<string> {
  const { data } = await bdd.from('poles').select('nom').eq('id', id).single();
  return data?.nom ?? '';
}
async function idsAdmins(): Promise<string[]> {
  const { data } = await bdd.from('profils').select('id').eq('role', 'admin').eq('actif', true);
  return (data ?? []).map((p: any) => p.id);
}

async function assignation(e: any): Promise<Message[]> {
  const t = await tache(e.tache_id);
  if (!t || e.par === e.utilisateur_id) return []; // inutile de prévenir quelqu'un de sa propre action
  const pole = await nomPole(t.pole_id);
  return (await destinataires([e.utilisateur_id])).map((u) => ({
    to: u.email,
    subject: `Nouvelle tâche : ${t.titre}`,
    html: gabarit('Une tâche vous a été assignée', [`<b>${echapper(t.titre)}</b>`, `Pôle : ${echapper(pole)}<br>Échéance : ${echapper(dateFr(t.echeance))}`, ...(t.description ? [echapper(t.description)] : [])]),
  }));
}

async function relecture(e: any): Promise<Message[]> {
  const t = await tache(e.tache_id);
  if (!t) return [];
  const { data: liens } = await bdd.from('membres_pole').select('utilisateur_id').eq('pole_id', t.pole_id);
  const idsPole = (liens ?? []).map((l: any) => l.utilisateur_id);
  let responsables: string[] = [];
  if (idsPole.length) {
    const { data } = await bdd.from('profils').select('id').eq('role', 'responsable').in('id', idsPole);
    responsables = (data ?? []).map((p: any) => p.id);
  }
  const ids = [...new Set([...(await idsAdmins()), ...responsables])].filter((id) => id !== e.par);
  const pole = await nomPole(t.pole_id);
  return (await destinataires(ids)).map((u) => ({
    to: u.email,
    subject: `À relire : ${t.titre}`,
    html: gabarit('Une tâche attend votre relecture', [`<b>${echapper(t.titre)}</b>`, `Pôle : ${echapper(pole)}`]),
  }));
}

async function nouveauCompte(e: any): Promise<Message[]> {
  const { data: nouveau } = await bdd.from('profils').select('nom_complet, email').eq('id', e.utilisateur_id).single();
  if (!nouveau) return [];
  return (await destinataires(await idsAdmins())).map((u) => ({
    to: u.email,
    subject: 'Nouvelle demande d’accès à 3xCom',
    html: gabarit('Nouvelle demande d’accès', [`<b>${echapper(nouveau.nom_complet || nouveau.email)}</b> (${echapper(nouveau.email)}) a créé un compte et attend votre validation.`, 'Rendez-vous dans l’onglet Équipe pour l’activer et choisir son rôle.']),
  }));
}

async function compteActive(e: any): Promise<Message[]> {
  return (await destinataires([e.utilisateur_id])).map((u) => ({
    to: u.email,
    subject: 'Votre accès à 3xCom est activé',
    html: gabarit('Bienvenue sur 3xCom', ['Votre compte a été validé : vous pouvez maintenant vous connecter et consulter vos tâches.']),
  }));
}

async function rappels(): Promise<Message[]> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const demain = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data: taches } = await bdd.from('taches').select('id, titre, echeance').neq('statut', 'terminee').not('echeance', 'is', null).lte('echeance', demain);
  if (!taches?.length) return [];
  const { data: liens } = await bdd.from('assignations').select('tache_id, utilisateur_id').in('tache_id', taches.map((t: any) => t.id));
  const parPersonne: Record<string, { retard: any[]; proches: any[] }> = {};
  for (const lien of liens ?? []) {
    const t = taches.find((x: any) => x.id === lien.tache_id);
    const groupe = (parPersonne[lien.utilisateur_id] ??= { retard: [], proches: [] });
    (t.echeance < aujourdhui ? groupe.retard : groupe.proches).push(t);
  }
  const liste = (titre: string, ts: any[]) => ts.length ? `<b>${titre}</b><br>${ts.map((t) => `• ${echapper(t.titre)} (${echapper(dateFr(t.echeance))})`).join('<br>')}` : '';
  return (await destinataires(Object.keys(parPersonne))).map((u) => {
    const g = parPersonne[u.id];
    return {
      to: u.email,
      subject: g.retard.length ? `${g.retard.length} tâche(s) en retard` : 'Tâches à rendre bientôt',
      html: gabarit('Vos échéances', [liste('En retard', g.retard), liste('Aujourd’hui et demain', g.proches)].filter(Boolean)),
    };
  });
}

async function envoyer(messages: Message[]) {
  for (let i = 0; i < messages.length; i += 100) { // Resend : 100 e-mails par lot
    const reponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLE_RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({ from: EXPEDITEUR, to: [m.to], subject: m.subject, html: m.html }))),
    });
    if (!reponse.ok) throw new Error(`Resend ${reponse.status} : ${await reponse.text()}`);
  }
  return { envoyes: messages.length };
}

const GESTIONNAIRES: Record<string, (e: any) => Promise<Message[]>> = {
  assignation, relecture, nouveau_compte: nouveauCompte, compte_active: compteActive, rappels,
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
