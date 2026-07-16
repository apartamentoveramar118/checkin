-- Migration segura para anadir fecha de reserva.
-- Ejecutar manualmente en Supabase SQL Editor.

alter table public.reservations
  add column if not exists reservation_date date not null default current_date;

alter table public.guests
  add column if not exists nombre text;

alter table public.guests
  add column if not exists apellidos text;

alter table public.guests
  add column if not exists sexo text;

alter table public.guests
  add column if not exists nacionalidad text;

alter table public.guests
  add column if not exists fecha_expedicion date;

alter table public.guests
  add column if not exists pais_expedicion text;

alter table public.guests
  add column if not exists municipio text;

alter table public.guests
  add column if not exists provincia text;

alter table public.guests
  add column if not exists pais text;

alter table public.guests
  drop constraint if exists guests_parentesco_responsable_check;

alter table public.guests
  add constraint guests_parentesco_responsable_check check (
    parentesco_responsable is null
    or parentesco_responsable in ('padre', 'madre', 'tutor', 'tutora', 'abuelo', 'abuela', 'tio', 'tia', 'hermano', 'hermana')
  );


alter table public.guests
  drop constraint if exists guests_parentesco_menor_check;

alter table public.guests
  add constraint guests_parentesco_menor_check check (
    parentesco_menor is null
    or parentesco_menor in ('hijo', 'hija', 'nieto', 'nieta', 'sobrino', 'sobrina', 'tutelado', 'tutelada', 'hermano', 'hermana')
  );
