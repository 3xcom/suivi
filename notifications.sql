-- Suivi 3xCom — notifications par e-mail pour l'administrateur (module optionnel).
-- À exécuter après schema.sql et migration_clients_demandes.sql. Peut être relancé sans risque.
-- Les e-mails sont envoyés par la fonction Edge « notifier » (Resend) à l'adresse ADMIN_EMAIL. Voir README.md.
-- Plus de table de réglages : l'adresse de la fonction et le secret sont écrits directement dans
-- envoyer_evenement() ci-dessous. Remplacez-les dans le SQL Editor de Supabase, sans les enregistrer dans GitHub.

create extension if not exists pg_net with schema extensions;

-- Étape 0 (facultative) : anciens déclencheurs de notification.
-- Si une version précédente a laissé des déclencheurs dont le nom commence par notif_ ou trg_notif_, ils enverraient
-- chaque e-mail en double. Pour les repérer, exécutez d'abord cette requête seule :
--   select event_object_table as table_, trigger_name from information_schema.triggers
--   where trigger_schema = 'public' and (trigger_name ilike 'notif\_%' or trigger_name ilike 'trg\_notif\_%') order by 1, 2;
-- S'il y en a, décommentez ce bloc pour les supprimer (les fonctions restent en place, seuls les déclencheurs partent) :
-- do $$
-- declare t record;
-- begin
--   for t in select event_object_table as tbl, trigger_name as nom from information_schema.triggers
--            where trigger_schema = 'public' and (trigger_name ilike 'notif\_%' or trigger_name ilike 'trg\_notif\_%')
--   loop
--     execute format('drop trigger if exists %I on public.%I', t.nom, t.tbl);
--   end loop;
-- end $$;

-- Ancienne préférence individuelle : conservée telle quelle (l'application s'en sert encore),
-- mais la fonction « notifier » ne l'utilise plus.
alter table public.profils add column if not exists notifications_email boolean not null default true;

-- Ancienne table de réglages : supprimée
drop table if exists public.reglages_serveur;

-- Envoi asynchrone d'un évènement à la fonction ; un échec ne bloque jamais l'enregistrement
create or replace function public.envoyer_evenement(corps jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  adresse constant text := 'https://VOTRE-PROJET.supabase.co/functions/v1/notifier';
  secret  constant text := 'UN_SECRET_LONG_ET_ALEATOIRE'; -- identique au secret NOTIF_SECRET de la fonction
begin
  perform net.http_post(url := adresse, body := corps,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-secret', secret));
exception when others then
  raise warning 'Notification non envoyée : %', sqlerrm;
end $$;
-- Réservée à la base : personne ne peut l'appeler depuis l'application (ni lire le secret)
revoke execute on function public.envoyer_evenement(jsonb) from public, anon, authenticated;

-- Évènements supprimés : l'admin n'a plus besoin d'être prévenu des assignations
drop trigger if exists notifier_assignation on public.assignations;
drop function if exists public.notifier_assignation();

-- 1) Une tâche passe « en relecture »
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

-- 2) Nouvelle demande d'accès (compte membre ou client créé, en attente de validation)
create or replace function public.notifier_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.actif then
    perform public.envoyer_evenement(jsonb_build_object('type', 'nouveau_compte', 'utilisateur_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists notifier_profil on public.profils;
create trigger notifier_profil after insert on public.profils
  for each row execute function public.notifier_profil();

-- 3) Nouvelle demande d'intervention d'un client
create or replace function public.notifier_demande() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.envoyer_evenement(jsonb_build_object('type', 'nouvelle_demande', 'demande_id', new.id));
  return new;
end $$;
drop trigger if exists notifier_demande on public.demandes;
create trigger notifier_demande after insert on public.demandes
  for each row execute function public.notifier_demande();

-- 4) Rappel quotidien des tâches en retard et des échéances du jour et du lendemain, à 7 h UTC.
-- Activez d'abord l'extension pg_cron (Database > Extensions), puis décommentez :
-- select cron.schedule('rappels-3xcom', '0 7 * * *',
--   $$select public.envoyer_evenement('{"type":"rappels"}'::jsonb)$$);
