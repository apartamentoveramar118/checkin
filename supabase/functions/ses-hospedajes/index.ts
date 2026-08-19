import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedCatalogs = new Set(["TIPO_PAGO", "TIPO_PARENTESCO", "TIPO_DOCUMENTO"]);
const endpointPre = "https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion";
const soapNamespace = "http://www.soap.servicios.hospedajes.mir.es/comunicacion";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[character]));
}

function parseCatalog(xml: string) {
  const resultCode = xml.match(/<codigo>([^<]*)<\/codigo>/i)?.[1] || xml.match(/<codigoRetorno>([^<]*)<\/codigoRetorno>/i)?.[1];
  const resultDescription = xml.match(/<descripcion>([^<]*)<\/descripcion>/i)?.[1] || "";
  const responseBlock = xml.match(/<(?:(?:[\w-]+):)?respuesta[\s\S]*?<\/(?:(?:[\w-]+):)?respuesta>/i)?.[0] || "";
  const items = [...responseBlock.matchAll(/<(?:(?:[\w-]+):)?tupla>\s*<(?:(?:[\w-]+):)?codigo>([^<]*)<\/(?:(?:[\w-]+):)?codigo>\s*<(?:(?:[\w-]+):)?descripcion>([^<]*)<\/(?:(?:[\w-]+):)?descripcion>\s*<\/(?:(?:[\w-]+):)?tupla>/gi)]
    .map((match) => ({ code: match[1], label: match[2] }));
  if (resultCode && resultCode !== "0") return { ok: false, error: { code: resultCode, message: resultDescription || "SES devolvio un error." } };
  return { ok: true, items };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Metodo no permitido." } }, 405);

  const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!accessToken || !supabaseUrl || !supabaseAnonKey) return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Se requiere una sesión de propietario." } }, 401);

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión no válida." } }, 401);

  const body = await request.json().catch(() => null);
  if (body?.operation !== "getCatalog" || !allowedCatalogs.has(body?.catalog)) return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Operación o catálogo no permitido." } }, 400);

  const username = Deno.env.get("SES_HOSPEDAJES_USERNAME");
  const password = Deno.env.get("SES_HOSPEDAJES_PASSWORD");
  const environment = Deno.env.get("SES_HOSPEDAJES_ENV") || "pre";
  if (environment !== "pre" || !username || !password) return json({ ok: false, error: { code: "SES_NOT_CONFIGURED", message: "SES PRE no está configurado." } }, 503);

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${soapNamespace}">
  <soapenv:Header/>
  <soapenv:Body>
    <com:catalogoRequest><peticion><catalogo>${escapeXml(body.catalog)}</catalogo></peticion></com:catalogoRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  const basicAuth = btoa(`${username}:${password}`);
  try {
    const response = await fetch(endpointPre, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "", Authorization: `Basic ${basicAuth}` },
      body: soapBody,
    });
    const xml = await response.text();
    if (!response.ok) {
      console.error("SES PRE HTTP error", response.status);
      return json({ ok: false, error: { code: `HTTP_${response.status}`, message: "SES PRE no está disponible." } }, 502);
    }
    return json({ ...parseCatalog(xml), catalog: body.catalog });
  } catch (error) {
    console.error("SES PRE connection error", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: { code: "SES_CONNECTION_ERROR", message: "No se pudo conectar con SES PRE." } }, 502);
  }
});
