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
