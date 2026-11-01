-- Version précédente en français (sans assignations multiples) : utilisez plutôt supabase/migration_assignations_sous_taches.sql
-- Si vous aviez exécuté une ancienne version (noms anglais), supprimez-la d'abord en décommentant :
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop table if exists public.tasks, public.pole_members, public.poles, public.profiles cascade;
-- drop function if exists public.handle_new_user(), public.my_role(), public.in_pole(uuid), public.guard_profile(), public.guard_task() cascade;

-- Suivi 3xCom — schéma Supabase. À exécuter dans SQL Editor (une seule fois).
-- Le PREMIER compte créé devient administrateur. Les suivants sont "en attente"
-- jusqu'à validation par un administrateur (onglet Équipe).

create table public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom_complet text not null default '',
  email text,
  role text not null default 'membre' check (role in ('admin','responsable','membre')),
  actif boolean not null default false,
  cree_le timestamptz not null default now()
);
create table public.poles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text not null default '',
  couleur text not null default '#8E1F45',
  cree_le timestamptz not null default now()
);
create table public.membres_pole (
  pole_id uuid references public.poles(id) on delete cascade,
  utilisateur_id uuid references public.profils(id) on delete cascade,
  primary key (pole_id, utilisateur_id)
);
create table public.taches (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text not null default '',
  pole_id uuid not null references public.poles(id) on delete cascade,
  cree_par uuid default auth.uid() references public.profils(id) on delete set null,
  statut text not null default 'a_faire' check (statut in ('a_faire','en_cours','relecture','terminee')),
  priorite text not null default 'normale' check (priorite in ('basse','normale','haute')),
  progression int not null default 0 check (progression between 0 and 100),
  echeance date,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index on public.taches (pole_id);

-- Création automatique du profil à l'inscription
create function public.gerer_nouvel_utilisateur() returns trigger
language plpgsql security definer set search_path = public as $$
declare est_premier boolean;
begin
  select not exists (select 1 from public.profils) into est_premier;
  insert into public.profils (id, nom_complet, email, role, actif)
  values (new.id, coalesce(new.raw_user_meta_data->>'nom_complet',''), new.email,
          case when est_premier then 'admin' else 'membre' end, est_premier);
  return new;
end $$;
create trigger a_la_creation_utilisateur after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- Fonctions d'aide pour les règles d'accès
create function public.mon_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profils where id = auth.uid() and actif $$;
create function public.dans_pole(id_pole uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.membres_pole where pole_id = id_pole and utilisateur_id = auth.uid()) $$;

-- Garde-fous : seul un admin change rôle/statut ; un membre ne modifie que statut & progression
create function public.proteger_profil() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(public.mon_role(),'') <> 'admin'
     and (new.role <> old.role or new.actif <> old.actif) then
    raise exception 'Action réservée aux administrateurs';
  end if;
  return new;
end $$;
create trigger proteger_profil before update on public.profils
  for each row execute function public.proteger_profil();

create function public.proteger_tache() returns trigger language plpgsql as $$
begin
  new.modifie_le = now();
  if auth.uid() is not null and not (public.mon_role() = 'admin'
     or (public.mon_role() = 'responsable' and public.dans_pole(old.pole_id))) then
    if new.titre <> old.titre or new.description <> old.description or new.pole_id <> old.pole_id
       or new.priorite <> old.priorite or new.echeance is distinct from old.echeance then
      raise exception 'Vous pouvez seulement modifier le statut et la progression';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_tache before update on public.taches
  for each row execute function public.proteger_tache();

-- Assignations (plusieurs personnes par tâche) et sous-tâches
create table public.assignations (
  tache_id uuid references public.taches(id) on delete cascade,
  utilisateur_id uuid references public.profils(id) on delete cascade,
  primary key (tache_id, utilisateur_id)
);
create index on public.assignations (utilisateur_id);
create table public.sous_taches (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references public.taches(id) on delete cascade,
  titre text not null,
  terminee boolean not null default false,
  position int not null default 0,
  cree_le timestamptz not null default now()
);
create index on public.sous_taches (tache_id);

create function public.pole_de_tache(t uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select pole_id from public.taches where id = t $$;
create function public.est_assigne(t uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.assignations where tache_id = t and utilisateur_id = auth.uid()) $$;
create function public.peut_gerer_tache(t uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.mon_role() = 'admin'
       or (public.mon_role() = 'responsable' and public.dans_pole(public.pole_de_tache(t))) $$;

-- Un assigné peut seulement cocher/décocher une sous-tâche
create function public.proteger_sous_tache() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.peut_gerer_tache(old.tache_id)
     and (new.titre <> old.titre or new.tache_id <> old.tache_id or new.position <> old.position) then
    raise exception 'Vous pouvez seulement cocher ou décocher une sous-tâche';
  end if;
  return new;
end $$;
create trigger proteger_sous_tache before update on public.sous_taches
  for each row execute function public.proteger_sous_tache();

alter table public.assignations enable row level security;
alter table public.sous_taches enable row level security;

-- Row Level Security
alter table public.profils enable row level security;
alter table public.poles enable row level security;
alter table public.membres_pole enable row level security;
alter table public.taches enable row level security;

create policy "profils_lecture" on public.profils for select using (id = auth.uid() or public.mon_role() is not null);
create policy "profils_soi" on public.profils for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profils_admin" on public.profils for update using (public.mon_role() = 'admin');

create policy "poles_lecture" on public.poles for select using (public.mon_role() = 'admin' or (public.mon_role() is not null and public.dans_pole(id)));
create policy "poles_admin" on public.poles for all using (public.mon_role() = 'admin') with check (public.mon_role() = 'admin');

create policy "mp_lecture" on public.membres_pole for select using (public.mon_role() is not null);
create policy "mp_admin" on public.membres_pole for all using (public.mon_role() = 'admin') with check (public.mon_role() = 'admin');

create policy "taches_lecture" on public.taches for select using (public.mon_role() = 'admin' or (public.mon_role() is not null and public.dans_pole(pole_id)));
create policy "taches_ajout" on public.taches for insert with check (public.mon_role() = 'admin' or (public.mon_role() = 'responsable' and public.dans_pole(pole_id)));
create policy "taches_modif" on public.taches for update using (
  public.mon_role() = 'admin' or (public.mon_role() = 'responsable' and public.dans_pole(pole_id))
  or (public.mon_role() is not null and public.est_assigne(id)));
create policy "taches_suppression" on public.taches for delete using (public.mon_role() = 'admin' or (public.mon_role() = 'responsable' and public.dans_pole(pole_id)));

create policy "assignations_lecture" on public.assignations for select using (public.mon_role() is not null);
create policy "assignations_gestion" on public.assignations for all
  using (public.peut_gerer_tache(tache_id)) with check (public.peut_gerer_tache(tache_id));

create policy "sous_taches_lecture" on public.sous_taches for select
  using (public.mon_role() is not null and exists (select 1 from public.taches where taches.id = sous_taches.tache_id));
create policy "sous_taches_ajout" on public.sous_taches for insert with check (public.peut_gerer_tache(tache_id));
create policy "sous_taches_modif" on public.sous_taches for update
  using (public.peut_gerer_tache(tache_id) or public.est_assigne(tache_id));
create policy "sous_taches_suppression" on public.sous_taches for delete using (public.peut_gerer_tache(tache_id));

-- Temps réel sur les tâches
alter publication supabase_realtime add table public.taches, public.assignations, public.sous_taches;
