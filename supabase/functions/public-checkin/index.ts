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
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("public-checkin is not configured: missing Supabase service credentials");
    return json({ error: "Function not configured", code: "function_not_configured" }, 500);
  }

  const body = await request.json().catch(() => null);
  const operation = body?.operation;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!tokenPattern.test(token)) return json({ error: "Invalid token", code: "invalid_token" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (operation === "getReservation") {
    const { data, error } = await adminClient
      .from("reservations")
      .select("id,reservation_name,check_in,check_out,adult_count,child_count,total_guests,status")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("getReservation query failed", { code: error.code, message: error.message, details: error.details });
      return json({ error: "Could not load reservation", code: "reservation_query_failed" }, 500);
    }
    if (!data) return json({ error: "Reservation not found", code: "reservation_not_found" }, 404);
    return json({ reservation: data });
  }

  if (operation === "submitCheckin") {
    if (!Array.isArray(body?.guests)) return json({ error: "Guests are required" }, 400);

    const { data: reservation, error: reservationError } = await adminClient
      .from("reservations")
      .select("id,adult_count,child_count,total_guests,status,contact_phone")
      .eq("token", token)
      .maybeSingle();

    if (reservationError) {
      console.error("submitCheckin reservation query failed", { code: reservationError.code, message: reservationError.message, details: reservationError.details });
      return json({ error: "Could not load reservation", code: "reservation_query_failed" }, 500);
    }
    if (!reservation) return json({ error: "Reservation not found", code: "reservation_not_found" }, 404);
    if (["completed", "ses_sent"].includes(reservation.status)) return json({ error: "Reservation already completed", code: "reservation_completed" }, 409);
    if (!["pending", "in_progress"].includes(reservation.status)) return json({ error: "Reservation is not open", code: "reservation_not_open" }, 409);

    const guests = body.guests;
    const adults = guests.filter((guest) => guest?.guestType === "adult");
    const children = guests.filter((guest) => guest?.guestType === "child");
    if (adults.length !== reservation.adult_count || children.length !== reservation.child_count) {
      return json({ error: "Guest count does not match reservation" }, 400);
    }
    if (guests.some((guest) => !["adult", "child"].includes(guest?.guestType) || !guest?.fullName?.trim() || !guest?.birthDate)) {
      return json({ error: "Required guest data is missing" }, 400);
    }

    const dbGuests = guests.map((guest) => ({
      guest_index: Number(guest.guestIndex),
      guest_type: guest.guestType,
      nombre_completo: String(guest.fullName).trim(),
      nombre: guest.firstName?.trim() || null,
      apellidos: guest.lastName?.trim() || null,
      fecha_nacimiento: guest.birthDate,
      direccion: guest.address?.trim() || null,
      municipio: guest.city?.trim() || null,
      provincia: guest.province?.trim() || null,
      codigo_postal: guest.postalCode?.trim() || null,
      pais: guest.country?.trim() || null,
      telefono: reservation.contact_phone,
      telefono_padre_madre: guest.guestType === "child" ? reservation.contact_phone : null,
      parentesco: guest.relationship?.trim() || null,
      parentesco_responsable: guest.relationshipResponsible?.trim() || null,
      parentesco_menor: guest.relationshipMinor?.trim() || null,
      firma_digital: guest.signature || null,
      tipo_documento: guest.documentType || null,
      id_documento: guest.documentId?.trim() || null,
      num_soporte: guest.supportNumber?.trim() || null,
      fecha_expedicion: guest.issueDate || null,
      pais_expedicion: guest.issueCountry?.trim() || null,
    }));

    const { error: submitError } = await adminClient.rpc("submit_checkin_by_token", {
      p_token: token,
      p_guests: dbGuests,
    });
    if (submitError) {
      console.error("submitCheckin RPC failed", { code: submitError.code, message: submitError.message, details: submitError.details });
      return json({ error: "Could not save check-in", code: "submit_failed" }, 400);
    }
    return json({ success: true });
  }

  return json({ error: "Unknown operation" }, 400);
});
