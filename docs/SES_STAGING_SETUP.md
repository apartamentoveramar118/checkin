# SES PRE en staging

## Secrets

Configurar únicamente en Supabase staging:

```text
SES_HOSPEDAJES_USERNAME=<usuario del Servicio Web SES PRE>
SES_HOSPEDAJES_PASSWORD=<contraseña del Servicio Web SES PRE>
SES_HOSPEDAJES_ENV=pre
```

No usar `VITE_` para estas credenciales y no incluirlas en Git, frontend o logs.

## Despliegue manual

```bash
npx supabase functions deploy ses-hospedajes --project-ref noduavtmgclwfdolsnec
```

Ejecutar solo cuando se quiera desplegar en staging. No usar el project-ref de producción.

## Prueba

1. Configurar los tres secrets en Supabase staging.
2. Desplegar `ses-hospedajes` en staging.
3. Abrir `https://precheckin-staging.vercel.app` con el propietario autenticado.
4. En `Prueba SES`, seleccionar `Tipo de pago` y pulsar `Consultar catalogo`.

La función solo permite `getCatalog` para `TIPO_PAGO`, `TIPO_PARENTESCO` y `TIPO_DOCUMENTO`. Esta fase no envía partes de viajeros ni reservas.

## Especificación

El repositorio no contiene el WSDL/XSD oficial. El sobre de catálogo se ha construido con la operación `catalogo` descrita en la documentación v3.1.3; debe validarse con el fichero oficial antes de usarlo como integración definitiva.
