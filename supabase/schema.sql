create extension if not exists pgcrypto;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  reservation_name text,
  contact_phone text not null,
  reservation_reference text,
  reservation_date date not null default current_date,
  check_in date not null,
  check_out date not null,
  adult_count int not null default 1,
  child_count int not null default 0,
  total_guests int generated always as (adult_count + child_count) stored,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  ses_status text not null default 'not_sent'
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  guest_index int not null,
  guest_type text not null default 'adult',
  tipo_documento text,
  nombre text,
  apellidos text,
  sexo text,
  nacionalidad text,
  nombre_completo text not null,
  id_documento text,
  num_soporte text,
  fecha_nacimiento date not null,
  fecha_expedicion date,
  pais_expedicion text,
  direccion text not null,
  municipio text,
  provincia text,
  codigo_postal text,
  pais text,
  telefono text,
  telefono_padre_madre text,
  parentesco text,
  parentesco_responsable text,
  parentesco_menor text,
  firma_digital text,
  created_at timestamptz not null default now()
);

-- Migracion compatible desde la version anterior con guest_count.
alter table public.reservations add column if not exists adult_count int not null default 1;
alter table public.reservations add column if not exists child_count int not null default 0;
alter table public.reservations add column if not exists contact_phone text;
alter table public.reservations add column if not exists reservation_reference text;
alter table public.reservations add column if not exists reservation_date date not null default current_date;

update public.reservations
set contact_phone = 'SIN_TELEFONO'
where contact_phone is null;

alter table public.reservations alter column contact_phone set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'guest_count'
  ) then
    execute 'update public.reservations set adult_count = coalesce(guest_count, adult_count, 1), child_count = coalesce(child_count, 0) where child_count = 0';
    execute 'alter table public.reservations alter column guest_count drop not null';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'total_guests'
  ) then
    execute 'alter table public.reservations add column total_guests int generated always as (adult_count + child_count) stored';
  end if;
end $$;

alter table public.guests add column if not exists guest_type text not null default 'adult';
alter table public.guests add column if not exists tipo_documento text;
alter table public.guests add column if not exists nombre text;
alter table public.guests add column if not exists apellidos text;
alter table public.guests add column if not exists sexo text;
alter table public.guests add column if not exists nacionalidad text;
alter table public.guests add column if not exists fecha_expedicion date;
alter table public.guests add column if not exists pais_expedicion text;
alter table public.guests add column if not exists municipio text;
alter table public.guests add column if not exists provincia text;
alter table public.guests add column if not exists pais text;
alter table public.guests add column if not exists telefono text;
alter table public.guests add column if not exists telefono_padre_madre text;
alter table public.guests add column if not exists parentesco text;
alter table public.guests add column if not exists parentesco_responsable text;
alter table public.guests add column if not exists parentesco_menor text;

update public.guests
set tipo_documento = 'nif'
where guest_type = 'adult'
  and tipo_documento is null;

alter table public.guests alter column id_documento drop not null;
alter table public.guests alter column num_soporte drop not null;
alter table public.guests alter column codigo_postal drop not null;
alter table public.guests alter column firma_digital drop not null;

alter table public.guests drop constraint if exists guests_adult_required_fields_check;
alter table public.guests drop constraint if exists guests_child_required_fields_check;
alter table public.reservations drop constraint if exists reservations_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_adult_count_check'
  ) then
    alter table public.reservations
      add constraint reservations_adult_count_check check (adult_count between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reservations_child_count_check'
  ) then
    alter table public.reservations
      add constraint reservations_child_count_check check (child_count between 0 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reservations_total_guests_check'
  ) then
    alter table public.reservations
      add constraint reservations_total_guests_check check ((adult_count + child_count) between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reservations_contact_phone_check'
  ) then
    alter table public.reservations
      add constraint reservations_contact_phone_check check (length(trim(contact_phone)) > 0);
  end if;

  alter table public.reservations
    add constraint reservations_status_check check (status in ('pending', 'in_progress', 'completed', 'ses_sent', 'ses_error'));

  if not exists (
    select 1 from pg_constraint where conname = 'reservations_ses_status_check'
  ) then
    alter table public.reservations
      add constraint reservations_ses_status_check check (ses_status in ('not_sent', 'pending', 'sent', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_guest_type_check'
  ) then
    alter table public.guests
      add constraint guests_guest_type_check check (guest_type in ('adult', 'child'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_tipo_documento_check'
  ) then
    alter table public.guests
      add constraint guests_tipo_documento_check check (
        tipo_documento is null or tipo_documento in ('nif', 'pasaporte', 'otros')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_parentesco_responsable_check'
  ) then
    alter table public.guests
      add constraint guests_parentesco_responsable_check check (
        parentesco_responsable is null
        or parentesco_responsable in ('padre', 'madre', 'tutor', 'tutora', 'abuelo', 'abuela', 'tio', 'tia', 'hermano', 'hermana')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_parentesco_menor_check'
  ) then
    alter table public.guests
      add constraint guests_parentesco_menor_check check (
        parentesco_menor is null
        or parentesco_menor in ('hijo', 'hija', 'nieto', 'nieta', 'sobrino', 'sobrina', 'tutelado', 'tutelada', 'hermano', 'hermana')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_adult_required_fields_check'
  ) then
    alter table public.guests
      add constraint guests_adult_required_fields_check check (
        guest_type <> 'adult'
        or (
          tipo_documento in ('nif', 'pasaporte', 'otros')
          and
          id_documento is not null and length(trim(id_documento)) > 0
          and codigo_postal is not null and length(trim(codigo_postal)) > 0
          and firma_digital is not null and length(trim(firma_digital)) > 0
          and (
            tipo_documento <> 'nif'
            or (num_soporte is not null and length(trim(num_soporte)) > 0)
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_child_required_fields_check'
  ) then
    alter table public.guests
      add constraint guests_child_required_fields_check check (
        guest_type <> 'child'
        or (
          parentesco is not null and length(trim(parentesco)) > 0
        )
      );
  end if;
end $$;

alter table public.guests drop constraint if exists guests_reservation_id_guest_index_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guests_reservation_type_index_key'
  ) then
    alter table public.guests
      add constraint guests_reservation_type_index_key unique (reservation_id, guest_type, guest_index);
  end if;
end $$;

create index if not exists reservations_token_idx on public.reservations(token);
create index if not exists guests_reservation_id_idx on public.guests(reservation_id);

alter table public.reservations enable row level security;
alter table public.guests enable row level security;

drop policy if exists "owner prototype can read reservations" on public.reservations;
drop policy if exists "owner prototype can create reservations" on public.reservations;
drop policy if exists "owner prototype can update reservations" on public.reservations;
drop policy if exists "owner prototype can delete reservations" on public.reservations;
drop policy if exists "owner prototype can read guests" on public.guests;
drop policy if exists "owner prototype can delete guests" on public.guests;
drop policy if exists "public can insert guests for open reservation" on public.guests;

-- MVP sin login: estas politicas permiten al panel propietario operar con anon key.
-- No uses service role key en frontend. En produccion, sustituir por auth real de propietario.
create policy "owner prototype can read reservations"
on public.reservations for select
using (true);

create policy "owner prototype can create reservations"
on public.reservations for insert
with check (
  adult_count between 1 and 4
  and child_count between 0 and 3
  and adult_count + child_count between 1 and 4
  and length(trim(contact_phone)) > 0
);

create policy "owner prototype can update reservations"
on public.reservations for update
using (true)
with check (
  adult_count between 1 and 4
  and child_count between 0 and 3
  and adult_count + child_count between 1 and 4
  and length(trim(contact_phone)) > 0
);

create policy "owner prototype can delete reservations"
on public.reservations for delete
using (true);

create policy "owner prototype can read guests"
on public.guests for select
using (true);

create policy "owner prototype can delete guests"
on public.guests for delete
using (true);

-- El formulario publico inserta huespedes solo si la reserva existe y no esta completada.
create policy "public can insert guests for open reservation"
on public.guests for insert
with check (
  guest_type in ('adult', 'child')
  and exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.status in ('pending', 'in_progress')
  )
);
