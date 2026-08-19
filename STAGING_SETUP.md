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

Verificación de deployment automático de staging.
