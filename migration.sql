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

alter table public.guests
  drop constraint if exists guests_child_required_fields_check;

alter table public.guests
  add constraint guests_child_required_fields_check check (
    guest_type <> 'child'
    or (
      (
        parentesco_menor is not null and length(trim(parentesco_menor)) > 0
      )
      or (
        parentesco is not null and length(trim(parentesco)) > 0
      )
    )
  );

create or replace function public.submit_checkin_by_token(p_token text, p_guests jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare r public.reservations%rowtype; adults int; children int;
begin
  select * into r from public.reservations where token = p_token for update;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  if r.status in ('completed', 'ses_sent') then raise exception 'reservation_already_completed' using errcode = 'P0003'; end if;
  if r.status not in ('pending', 'in_progress') then raise exception 'reservation_not_open' using errcode = 'P0004'; end if;
  select count(*) into adults from jsonb_to_recordset(p_guests) as x(guest_type text) where x.guest_type = 'adult';
  select count(*) into children from jsonb_to_recordset(p_guests) as x(guest_type text) where x.guest_type = 'child';
  if adults <> r.adult_count or children <> r.child_count then raise exception 'guest_count_mismatch' using errcode = 'P0005'; end if;
  if exists (select 1 from jsonb_to_recordset(p_guests) as x(guest_type text, nombre_completo text, fecha_nacimiento date)
    where x.guest_type not in ('adult', 'child') or coalesce(trim(x.nombre_completo), '') = '' or x.fecha_nacimiento is null) then
    raise exception 'required_guest_data_missing' using errcode = 'P0006';
  end if;
  delete from public.guests where reservation_id = r.id;
  insert into public.guests (reservation_id,guest_index,guest_type,nombre_completo,nombre,apellidos,fecha_nacimiento,direccion,municipio,provincia,codigo_postal,pais,telefono,telefono_padre_madre,parentesco,parentesco_responsable,parentesco_menor,firma_digital,tipo_documento,id_documento,num_soporte,fecha_expedicion,pais_expedicion)
  select r.id,x.guest_index,x.guest_type,x.nombre_completo,x.nombre,x.apellidos,x.fecha_nacimiento,x.direccion,x.municipio,x.provincia,x.codigo_postal,x.pais,r.contact_phone,case when x.guest_type = 'child' then r.contact_phone else null end,x.parentesco,x.parentesco_responsable,x.parentesco_menor,x.firma_digital,x.tipo_documento,x.id_documento,x.num_soporte,x.fecha_expedicion,x.pais_expedicion
  from jsonb_to_recordset(p_guests) as x(guest_index int,guest_type text,nombre_completo text,nombre text,apellidos text,fecha_nacimiento date,direccion text,municipio text,provincia text,codigo_postal text,pais text,parentesco text,parentesco_responsable text,parentesco_menor text,firma_digital text,tipo_documento text,id_documento text,num_soporte text,fecha_expedicion date,pais_expedicion text);
  update public.reservations set status = 'completed', completed_at = now() where id = r.id;
  return true;
end;
$$;
revoke all on function public.submit_checkin_by_token(text, jsonb) from public;
grant execute on function public.submit_checkin_by_token(text, jsonb) to service_role;

-- Cierre de RLS para staging. Ejecutar manualmente en Supabase staging.
drop policy if exists "owner prototype can read reservations" on public.reservations;
drop policy if exists "owner prototype can create reservations" on public.reservations;
drop policy if exists "owner prototype can update reservations" on public.reservations;
drop policy if exists "owner prototype can delete reservations" on public.reservations;
drop policy if exists "owner prototype can read guests" on public.guests;
drop policy if exists "owner prototype can delete guests" on public.guests;
drop policy if exists "public can insert guests for open reservation" on public.guests;
drop policy if exists "authenticated can read reservations" on public.reservations;
drop policy if exists "authenticated can create reservations" on public.reservations;
drop policy if exists "authenticated can update reservations" on public.reservations;
drop policy if exists "authenticated can delete reservations" on public.reservations;
drop policy if exists "authenticated can read guests" on public.guests;
drop policy if exists "authenticated can delete guests" on public.guests;

create policy "authenticated can read reservations"
on public.reservations for select to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can create reservations"
on public.reservations for insert to authenticated
with check (auth.role() = 'authenticated' and adult_count between 1 and 4 and child_count between 0 and 3 and adult_count + child_count between 1 and 4 and length(trim(contact_phone)) > 0);

create policy "authenticated can update reservations"
on public.reservations for update to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated' and adult_count between 1 and 4 and child_count between 0 and 3 and adult_count + child_count between 1 and 4 and length(trim(contact_phone)) > 0);

create policy "authenticated can delete reservations"
on public.reservations for delete to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can read guests"
on public.guests for select to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can delete guests"
on public.guests for delete to authenticated
using (auth.role() = 'authenticated');
