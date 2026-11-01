-- Migration : assignation à plusieurs personnes + sous-tâches.
-- À exécuter UNE fois sur une base créée avec la version précédente de schema.sql.

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

insert into public.assignations (tache_id, utilisateur_id)
  select id, assigne_id from public.taches where assigne_id is not null;

drop policy "taches_modif" on public.taches;
alter table public.taches drop column assigne_id;
create or replace function public.proteger_tache() returns trigger language plpgsql as $$
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
create policy "taches_modif" on public.taches for update using (
  public.mon_role() = 'admin' or (public.mon_role() = 'responsable' and public.dans_pole(pole_id))
  or (public.mon_role() is not null and public.est_assigne(id)));

create policy "assignations_lecture" on public.assignations for select using (public.mon_role() is not null);
create policy "assignations_gestion" on public.assignations for all
  using (public.peut_gerer_tache(tache_id)) with check (public.peut_gerer_tache(tache_id));

create policy "sous_taches_lecture" on public.sous_taches for select
  using (public.mon_role() is not null and exists (select 1 from public.taches where taches.id = sous_taches.tache_id));
create policy "sous_taches_ajout" on public.sous_taches for insert with check (public.peut_gerer_tache(tache_id));
create policy "sous_taches_modif" on public.sous_taches for update
  using (public.peut_gerer_tache(tache_id) or public.est_assigne(tache_id));
create policy "sous_taches_suppression" on public.sous_taches for delete using (public.peut_gerer_tache(tache_id));

alter publication supabase_realtime add table public.assignations, public.sous_taches;
