import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tokenPattern = /^[a-f0-9]{32}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Function not configured" }, 500);

  const body = await request.json().catch(() => null);
  const operation = body?.operation;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!tokenPattern.test(token)) return json({ error: "Invalid token" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (operation === "getReservation") {
    const { data, error } = await adminClient
      .from("reservations")
      .select("id,reservation_name,check_in,check_out,adult_count,child_count,total_guests,status")
      .eq("token", token)
      .maybeSingle();

    if (error) return json({ error: "Could not load reservation" }, 500);
    if (!data) return json({ error: "Reservation not found" }, 404);
    return json({ reservation: data });
  }

  if (operation === "submitCheckin") {
    return json({ error: "Not implemented. The current browser flow remains active." }, 501);
  }

  return json({ error: "Unknown operation" }, 400);
});
