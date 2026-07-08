# Pre-Check-in Digital

PWA mobile first para alojamientos turisticos. El propietario crea una reserva, comparte un enlace por WhatsApp y el huesped completa los datos antes de llegar.

## Stack

- HTML
- Tailwind CSS
- JavaScript Vanilla
- Supabase + PostgreSQL
- Signature Pad
- jsPDF
- PWA

No usa React, OCR, IA, foto DNI ni camara.

## Ejecutar

```bash
npm install
npm run dev
```

La aplicacion requiere Supabase siempre. No existe modo local de prueba ni fallback a `localStorage`.

HTTPS local para movil:

```bash
npm run dev:https -- --port 8139
```

Abre en el movil la IP local del ordenador con el puerto de Vite, por ejemplo:

```text
https://192.168.1.27:8139
```

El navegador mostrara aviso de certificado no seguro. Hay que aceptar/continuar.

## Conectar Supabase

1. Crea un proyecto en Supabase.
2. Abre el SQL editor.
3. Ejecuta completo:

```text
supabase/schema.sql
```

4. Crea un archivo `.env` con:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

5. Reinicia Vite.

No uses nunca la `service_role key` en el frontend. La app usa solo `anon key`.

Si `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` no estan configuradas, la app muestra un error claro y no permite crear, leer ni guardar reservas.

## Modelo de datos

`reservations`:

- `id`
- `token`
- `reservation_name`
- `contact_phone`
- `reservation_reference`
- `reservation_date`
- `check_in`
- `check_out`
- `adult_count`
- `child_count`
- `total_guests`
- `status`
- `created_at`
- `completed_at`
- `ses_status`

`guests`:

- `id`
- `reservation_id`
- `guest_index`
- `guest_type`: `adult` o `child`
- `nombre_completo`
- `tipo_documento`: `nif`, `pasaporte` u `otros`, solo adultos
- `id_documento`: solo adultos
- `num_soporte`: obligatorio solo para adultos con `tipo_documento = nif`
- `fecha_nacimiento`
- `direccion`
- `codigo_postal`: solo adultos
- `telefono`: heredado desde `reservations.contact_phone`
- `telefono_padre_madre`: compatibilidad, heredado desde `reservations.contact_phone` en ninos
- `parentesco`: compatibilidad
- `parentesco_responsable`: Adulto 1 si hay ninos
- `parentesco_menor`: cada nino
- `firma_digital`: obligatoria en adultos, null en ninos
- `created_at`

## Reglas de capacidad

- Maximo total: 4 personas.
- Minimo obligatorio: 1 adulto.
- Maximo adultos: 4.
- Maximo ninos: 3.
- Adultos + ninos nunca puede superar 4.

## Migracion desde `guest_count`

El archivo `supabase/schema.sql` es compatible con reservas existentes:

- Anade `adult_count`, `child_count` y `total_guests`.
- Si existe `guest_count`, copia su valor a `adult_count`.
- Deja `guest_count` sin `not null` para que la app pueda dejar de escribirlo.
- Mantiene el borrado en cascada de `guests`.
- Cambia la unicidad de huespedes a `(reservation_id, guest_type, guest_index)`.

Si quieres revisar la migracion antes de aplicarla en produccion, ejecutala primero en un proyecto Supabase de prueba.

## RLS

El SQL activa RLS y deja politicas minimas para MVP sin login:

- El panel puede crear, leer, actualizar y borrar reservas con `anon key`.
- El formulario publico puede insertar huespedes solo si la reserva existe y esta `pending` o `in_progress`.
- El borrado de reservas elimina huespedes por `on delete cascade`.

Antes de produccion/SaaS hay que anadir autenticacion de propietario y endurecer politicas por usuario.

## Flujo

Propietario:

- Crea reserva indicando adultos y ninos.
- Informa telefono WhatsApp obligatorio y, opcionalmente, localizador Booking / referencia.
- Se genera token y enlace publico `/checkin/{token}`.
- Lista reservas reales desde Supabase.
- Ve composicion, por ejemplo `2 adultos · 1 nino`.
- Ve progreso, por ejemplo `3/3 personas registradas`.
- Ve contadores superiores de reservas, pendientes, completadas y entradas de hoy.
- Puede buscar por reserva, telefono, referencia Booking o nombre de huesped.
- Puede filtrar por todos, pendientes o completados.
- Puede ver detalle, editar, copiar enlace, enviar WhatsApp, exportar PDF o borrar con modal de confirmacion.
- El boton SES queda preparado y deshabilitado como `Proximamente`.

Huesped:

- Abre enlace.
- La app carga la reserva por token desde Supabase.
- Completa tarjetas separadas: `Adulto 1`, `Adulto 2`, `Nino 1`, etc.
- Los adultos eligen tipo de documento: NIF, Pasaporte u Otros.
- Solo los adultos con NIF rellenan numero de soporte obligatorio.
- Los adultos siempre rellenan documento, fecha nacimiento, direccion, codigo postal y firma obligatoria.
- El huesped no escribe telefono: se hereda siempre de `contact_phone` de la reserva.
- Si hay ninos, Adulto 1 rellena `parentesco responsable`.
- Los ninos solo rellenan nombre, fecha nacimiento y `parentesco del menor`.
- La app copia direccion y codigo postal de Adulto 1 a cada nino antes de guardar.
- Envia.
- Se insertan huespedes en `guests`.
- La reserva pasa a `completed` y guarda `completed_at`.
- Si ya esta completada, se muestra `Registro ya completado`.

## PDF

El PDF lee datos reales desde Supabase.

- Primera pagina: informacion de reserva, composicion y progreso.
- Incluye telefono de contacto y localizador Booking / referencia si existe.
- Una pagina por persona.
- Adultos: tipo de documento, documento, fecha nacimiento, direccion, codigo postal, telefono heredado y firma. El soporte solo aparece si existe. El parentesco responsable aparece en Adulto 1 si hay menores.
- Ninos: fecha nacimiento, direccion, codigo postal, telefono heredado y parentesco del menor. No muestra DNI, soporte ni firma.

## SES Hospedajes

La integracion real no esta implementada. Toda llamada pasa por:

```text
src/services/sesService.js
```

Funcion preparada:

```js
sendReservationToSES(reservationId)
```

Actualmente devuelve: `SES pendiente de implementación.`.
