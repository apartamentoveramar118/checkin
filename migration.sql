-- Migration segura para anadir fecha de reserva.
-- Ejecutar manualmente en Supabase SQL Editor.

alter table public.reservations
  add column if not exists reservation_date date not null default current_date;
