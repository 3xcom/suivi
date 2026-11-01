-- Suivi 3xCom — notifications par e-mail (module optionnel, à exécuter après schema.sql).
-- Les e-mails sont envoyés par la fonction Edge « notifier » (Resend). Voir README.md.

create extension if not exists pg_net with schema extensions;

-- Préférence de chaque personne (case à cocher en bas de l'accueil)
alter table public.profils add column if not exists notifications_email boolean not null default true;

-- Réglages privés : RLS activée et aucune politique = inaccessibles depuis l'application
create table if not exists public.reglages_serveur (
  cle text primary key,
  valeur text not null
);
alter table public.reglages_serveur enable row level security;
-- À renseigner une fois (voir README) :
-- insert into public.reglages_serveur values
--   ('url_fonction', 'https://VOTRE-PROJET.supabase.co/functions/v1/notifier'),
--   ('secret', 'UN_SECRET_LONG_ET_ALEATOIRE');

-- Envoi asynchrone d'un évènement à la fonction ; un échec ne bloque jamais l'enregistrement
create or replace function public.envoyer_evenement(corps jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare adresse text; secret text;
begin
  select valeur into adresse from public.reglages_serveur where cle = 'url_fonction';
  select valeur into secret from public.reglages_serveur where cle = 'secret';
  if adresse is null or secret is null then return; end if;
  perform net.http_post(url := adresse, body := corps,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-secret', secret));
exception when others then
  raise warning 'Notification non envoyée : %', sqlerrm;
end $$;

-- 1) Une personne est assignée à une tâche
create or replace function public.notifier_assignation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.envoyer_evenement(jsonb_build_object('type', 'assignation',
    'tache_id', new.tache_id, 'utilisateur_id', new.utilisateur_id, 'par', auth.uid()));
  return new;
end $$;
drop trigger if exists notifier_assignation on public.assignations;
create trigger notifier_assignation after insert on public.assignations
  for each row execute function public.notifier_assignation();

-- 2) Une tâche passe « en relecture » (admins et responsables du pôle prévenus)
create or replace function public.notifier_relecture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'relecture' and old.statut is distinct from 'relecture' then
    perform public.envoyer_evenement(jsonb_build_object('type', 'relecture',
      'tache_id', new.id, 'par', auth.uid()));
  end if;
  return new;
end $$;
drop trigger if exists notifier_relecture on public.taches;
create trigger notifier_relecture after update of statut on public.taches
  for each row execute function public.notifier_relecture();

-- 3) Nouvelle demande d'accès (admins prévenus) et compte activé (la personne est prévenue)
create or replace function public.notifier_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not new.actif then
    perform public.envoyer_evenement(jsonb_build_object('type', 'nouveau_compte', 'utilisateur_id', new.id));
  elsif tg_op = 'UPDATE' and new.actif and not old.actif then
    perform public.envoyer_evenement(jsonb_build_object('type', 'compte_active', 'utilisateur_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists notifier_profil on public.profils;
create trigger notifier_profil after insert or update of actif on public.profils
  for each row execute function public.notifier_profil();

-- 4) Rappels quotidiens (retards + échéances du jour et du lendemain), à 7 h UTC.
-- Activez d'abord l'extension pg_cron (Database > Extensions), puis décommentez :
-- select cron.schedule('rappels-3xcom', '0 7 * * *',
--   $$select public.envoyer_evenement('{"type":"rappels"}'::jsonb)$$);
