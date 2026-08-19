# Entorno staging

## Variables de entorno

Configurar en el proyecto Vercel de staging:

```text
VITE_SUPABASE_URL=<URL del proyecto Supabase staging>
VITE_SUPABASE_ANON_KEY=<anon key del proyecto Supabase staging>
```

No utilizar nunca `service_role` ni credenciales de producción en el frontend.

## Crear Supabase staging

1. Crear un proyecto Supabase independiente de producción.
2. Copiar las variables de staging, sin publicarlas en el repositorio.
3. Abrir el SQL Editor del proyecto staging.
4. Ejecutar `supabase/schema.sql` completo.
5. Revisar `migration.sql` y ejecutar únicamente las migraciones que sean necesarias para una base ya existente. En un proyecto nuevo, no ejecutarlo automáticamente si `schema.sql` ya cubre esas columnas y constraints.
6. Comprobar manualmente tablas, índices, constraints y políticas RLS.

No ejecutar ningún SQL de este documento en Supabase producción.

## Comprobación obligatoria

ANTES DE HACER PRUEBAS, confirmar:

```text
VITE_SUPABASE_URL != URL DE SUPABASE PRODUCCIÓN
```

También verificar en el panel de Vercel que las variables pertenecen al proyecto de staging y que no se han copiado valores de producción.

## Conectar Vercel staging

1. Crear un proyecto Vercel nuevo, separado del proyecto de producción.
2. Conectar el mismo repositorio de GitHub.
3. Seleccionar la rama `staging` como rama de producción del proyecto Vercel staging.
4. Añadir únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de staging.
5. Usar el build configurado en el proyecto: `npm run build`.
6. Verificar que la URL pública `/checkin/{token}` funciona en staging.

## Migraciones identificadas

El archivo `migration.sql` contiene cambios incrementales para instalaciones anteriores, incluyendo `reservation_date`, campos ampliados de huéspedes y constraints de parentesco. No se ha ejecutado ni validado contra producción en esta preparación.

Antes de aplicarlo en staging, comparar su estado con el resultado de `schema.sql`. Mantener las migraciones versionadas y ejecutarlas manualmente en el proyecto Supabase de staging.

## Auth y Edge Function en staging

1. En Supabase staging, crear manualmente el usuario propietario en Authentication > Users usando email/password.
2. No habilitar registro público desde la aplicación; el login del panel solo usa `signInWithPassword`.
3. Configurar los secrets `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` únicamente en la Edge Function. Nunca usar `SUPABASE_SERVICE_ROLE_KEY` en `VITE_`, frontend o Git.
4. Desplegar manualmente `supabase/functions/public-checkin` desde el proyecto Supabase staging.
5. `getReservation` está preparada, pero el formulario actual todavía no la utiliza.
6. `submitCheckin` devuelve `501` y queda documentada para una fase posterior; no sustituye a `saveGuests()`.

Las RLS, `schema.sql` y `migration.sql` no se modifican en esta fase.

## Check-in público por Edge Function

La lectura y el envío público usan `supabase/functions/public-checkin`. La operación `submitCheckin` llama a la RPC `public.submit_checkin_by_token`, que debe existir en staging antes de probar el envío.

Orden manual en Supabase staging:

1. Ejecutar el `schema.sql` actualizado, o ejecutar manualmente la parte equivalente de `migration.sql` si el proyecto ya está creado.
2. Desplegar `public-checkin`.
3. Verificar que `SUPABASE_SERVICE_ROLE_KEY` solo está configurada como secret de la Edge Function.
4. Probar primero un token válido y después un token inválido.

La RPC usa el token para resolver la reserva, hereda `contact_phone` en backend y realiza borrado, inserción y actualización dentro de una única transacción. Su ejecución pública está revocada y solo se concede a `service_role`.

Verificación de deployment automático de staging.
