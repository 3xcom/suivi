-- Ajoute l’enregistrement audio facultatif aux demandes existantes.
-- À exécuter dans Supabase SQL Editor après la mise en place de la table public.demandes.
alter table public.demandes add column if not exists audio_path text;
-- Les clients peuvent transmettre leur besoin sans choisir un pôle; l’agence l’orientera.
alter table public.demandes alter column pole_id drop not null;

-- Vérification non récursive de l’appartenance du compte au groupe client.
create or replace function public.est_membre_client(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membres_client
    where client_id = c and utilisateur_id = auth.uid()
  )
$$;
revoke all on function public.est_membre_client(uuid) from public;
grant execute on function public.est_membre_client(uuid) to authenticated;

alter table public.demandes enable row level security;
drop policy if exists "demandes_client_creation_vocale" on public.demandes;
create policy "demandes_client_creation_vocale" on public.demandes
for insert to authenticated
with check (
  public.mon_role() = 'client'
  and public.est_membre_client(client_id)
  and cree_par = auth.uid()
  and statut = 'nouvelle'
  and pole_id is null
  and (audio_path is null or (storage.foldername(audio_path))[1] = auth.uid()::text)
);

drop policy if exists "demandes_client_lecture_groupe" on public.demandes;
create policy "demandes_client_lecture_groupe" on public.demandes
for select to authenticated
using (
  public.mon_role() = 'client'
  and public.est_membre_client(client_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios-demandes', 'audios-demandes', false, 26214400,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "audio_demande_ajout_personnel" on storage.objects;
create policy "audio_demande_ajout_personnel"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'audios-demandes'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.mon_role() = 'client'
);

drop policy if exists "audio_demande_lecture_auteur_ou_equipe" on storage.objects;
create policy "audio_demande_lecture_auteur_ou_equipe"
on storage.objects for select to authenticated
using (
  bucket_id = 'audios-demandes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.mon_role() in ('admin', 'responsable', 'membre')
  )
);

drop policy if exists "audio_demande_suppression_auteur" on storage.objects;
create policy "audio_demande_suppression_auteur"
on storage.objects for delete to authenticated
using (
  bucket_id = 'audios-demandes'
  and (storage.foldername(name))[1] = auth.uid()::text
);
