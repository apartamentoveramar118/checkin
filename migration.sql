-- Migration segura para actualizar datos de reserva y parentescos.
-- Ejecutar manualmente en Supabase SQL Editor.

alter table public.reservations
  add column if not exists contact_phone text;

alter table public.reservations
  add column if not exists reservation_reference text;

update public.reservations
set contact_phone = 'SIN_TELEFONO'
where contact_phone is null;

alter table public.reservations
  alter column contact_phone set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_contact_phone_check'
  ) then
    alter table public.reservations
      add constraint reservations_contact_phone_check check (length(trim(contact_phone)) > 0);
  end if;
end $$;

alter table public.guests
  add column if not exists tipo_documento text;

alter table public.guests
  add column if not exists telefono_padre_madre text;

alter table public.guests
  add column if not exists parentesco text;

alter table public.guests
  add column if not exists telefono text;

alter table public.guests
  add column if not exists parentesco_responsable text;

alter table public.guests
  add column if not exists parentesco_menor text;

alter table public.guests
  alter column tipo_documento drop not null;

alter table public.guests
  alter column firma_digital drop not null;

alter table public.guests
  alter column id_documento drop not null;

alter table public.guests
  alter column num_soporte drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guests_parentesco_responsable_check'
  ) then
    alter table public.guests
      add constraint guests_parentesco_responsable_check check (
        parentesco_responsable is null
        or parentesco_responsable in ('padre', 'madre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guests_parentesco_menor_check'
  ) then
    alter table public.guests
      add constraint guests_parentesco_menor_check check (
        parentesco_menor is null
        or parentesco_menor in ('hijo', 'hija', 'nieto', 'nieta', 'sobrino', 'sobrina', 'tutelado', 'tutelada')
      );
  end if;
end $$;
