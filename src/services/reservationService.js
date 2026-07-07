import { supabaseClient } from "./supabaseClient.js";

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  }

  return supabaseClient;
}

function createToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReservation(row) {
  const adultCount = toNumber(row.adult_count ?? row.adultCount ?? row.guest_count ?? row.guestCount, 1);
  const childCount = toNumber(row.child_count ?? row.childCount, 0);
  const totalGuests = toNumber(row.total_guests ?? row.totalGuests, adultCount + childCount);

  return {
    id: row.id,
    token: row.token,
    name: row.reservation_name || row.name || "",
    contactPhone: row.contact_phone || row.contactPhone || "",
    reservationReference: row.reservation_reference || row.reservationReference || "",
    checkIn: row.check_in || row.checkIn,
    checkOut: row.check_out || row.checkOut,
    adultCount,
    childCount,
    totalGuests,
    guestCount: totalGuests,
    registeredCount: toNumber(row.registeredCount ?? row.registered_count, 0),
    status: row.status,
    sesStatus: row.ses_status || row.sesStatus || "not_sent",
    createdAt: row.created_at || row.createdAt,
    completedAt: row.completed_at || row.completedAt || null,
  };
}

function normalizeGuest(row) {
  const guestType = row.guest_type || row.guestType || "adult";
  const documentType = row.tipo_documento || row.documentType || (guestType === "adult" ? "nif" : "");

  return {
    id: row.id,
    reservationId: row.reservation_id || row.reservationId,
    guestIndex: row.guest_index || row.guestIndex,
    guestType,
    documentType,
    fullName: row.nombre_completo || row.fullName || "",
    documentId: row.id_documento || row.documentId || "",
    supportNumber: row.num_soporte || row.supportNumber || "",
    birthDate: row.fecha_nacimiento || row.birthDate || "",
    address: row.direccion || row.address || "",
    postalCode: row.codigo_postal || row.postalCode || "",
    phone: row.telefono || row.phone || row.telefono_padre_madre || row.parentPhone || "",
    parentPhone: row.telefono_padre_madre || row.parentPhone || "",
    relationshipResponsible: row.parentesco_responsable || row.relationshipResponsible || "",
    relationshipMinor: row.parentesco_menor || row.relationshipMinor || "",
    relationship: row.parentesco || row.relationship || row.parentesco_responsable || row.parentesco_menor || "",
    signature: row.firma_digital || row.signature || "",
  };
}

function validateOccupancy(input) {
  const adultCount = Number(input.adultCount);
  const childCount = Number(input.childCount);

  if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 4) {
    throw new Error("El numero de adultos debe estar entre 1 y 4.");
  }

  if (!Number.isInteger(childCount) || childCount < 0 || childCount > 3) {
    throw new Error("El numero de ninos debe estar entre 0 y 3.");
  }

  if (adultCount + childCount > 4) {
    throw new Error("La capacidad maxima es de 4 personas.");
  }

  return { adultCount, childCount, totalGuests: adultCount + childCount };
}

function toDbReservation(input) {
  const output = {};

  if ("name" in input) output.reservation_name = input.name?.trim() || null;
  if ("contactPhone" in input) output.contact_phone = input.contactPhone?.trim();
  if ("reservationReference" in input) output.reservation_reference = input.reservationReference?.trim() || null;
  if ("checkIn" in input) output.check_in = input.checkIn;
  if ("checkOut" in input) output.check_out = input.checkOut;
  if ("adultCount" in input || "childCount" in input) {
    const counts = validateOccupancy({
      adultCount: input.adultCount,
      childCount: input.childCount,
    });
    output.adult_count = counts.adultCount;
    output.child_count = counts.childCount;
  }
  if ("status" in input) output.status = input.status;
  if ("sesStatus" in input) output.ses_status = input.sesStatus;
  if ("completedAt" in input) output.completed_at = input.completedAt;

  return output;
}

function stripUndefined(object) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
}

async function withRegisteredCounts(normalizedReservations) {
  if (!normalizedReservations.length) return normalizedReservations;

  const client = requireSupabase();
  const ids = normalizedReservations.map((reservation) => reservation.id);
  const { data, error } = await client
    .from("guests")
    .select("reservation_id")
    .in("reservation_id", ids);

  if (error) throw error;

  const counts = data.reduce((acc, guest) => {
    acc[guest.reservation_id] = (acc[guest.reservation_id] || 0) + 1;
    return acc;
  }, {});

  return normalizedReservations.map((reservation) => ({
    ...reservation,
    registeredCount: counts[reservation.id] || 0,
  }));
}

function normalizeGuestForDb(guest) {
  const guestType = guest.guestType === "child" ? "child" : "adult";
  const base = {
    reservation_id: guest.reservationId,
    guest_index: Number(guest.guestIndex),
    guest_type: guestType,
    nombre_completo: guest.fullName.trim(),
    fecha_nacimiento: guest.birthDate,
    direccion: guest.address.trim(),
    telefono: guest.phone?.trim() || null,
    firma_digital: guest.signature || null,
  };

  if (guestType === "adult") {
    const documentType = ["nif", "pasaporte", "otros"].includes(guest.documentType) ? guest.documentType : "nif";

    return {
      ...base,
      tipo_documento: documentType,
      id_documento: guest.documentId.trim(),
      num_soporte: documentType === "nif" ? guest.supportNumber.trim() : null,
      codigo_postal: guest.postalCode.trim(),
      telefono_padre_madre: null,
      parentesco: guest.relationshipResponsible?.trim() || guest.relationship?.trim() || null,
      parentesco_responsable: guest.relationshipResponsible?.trim() || null,
      parentesco_menor: null,
    };
  }

  return {
    ...base,
    id_documento: null,
    num_soporte: null,
    tipo_documento: null,
    codigo_postal: guest.postalCode?.trim() || null,
    telefono_padre_madre: guest.phone?.trim() || guest.parentPhone?.trim() || null,
    parentesco: guest.relationshipMinor?.trim() || guest.relationship?.trim() || null,
    parentesco_responsable: null,
    parentesco_menor: guest.relationshipMinor?.trim() || null,
  };
}

export const reservationService = {
  async listReservations() {
    const client = requireSupabase();
    const { data, error } = await client
      .from("reservations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return withRegisteredCounts(data.map(normalizeReservation));
  },

  async createReservation(input) {
    const client = requireSupabase();
    const counts = validateOccupancy(input);
  const reservation = {
      token: createToken(),
      reservation_name: input.name?.trim() || null,
      contact_phone: input.contactPhone?.trim(),
      reservation_reference: input.reservationReference?.trim() || null,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adult_count: counts.adultCount,
      child_count: counts.childCount,
      status: "pending",
      ses_status: "not_sent",
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    if (!reservation.contact_phone) {
      throw new Error("El telefono WhatsApp de contacto es obligatorio.");
    }

    const { data, error } = await client
      .from("reservations")
      .insert(reservation)
      .select()
      .single();

    if (error) throw error;
    return normalizeReservation(data);
  },

  async updateReservation(id, patch) {
    const client = requireSupabase();
    const dbPatch = stripUndefined(toDbReservation(patch));

    const { data, error } = await client
      .from("reservations")
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return normalizeReservation(data);
  },

  async deleteReservation(id) {
    const client = requireSupabase();
    const { error } = await client.from("reservations").delete().eq("id", id);
    if (error) throw error;
  },

  async getReservationByToken(token) {
    const client = requireSupabase();
    const { data, error } = await client
      .from("reservations")
      .select("*")
      .eq("token", token)
      .single();

    if (error) throw error;
    return normalizeReservation(data);
  },

  async getReservationDetails(id) {
    const client = requireSupabase();
    const [{ data: reservation, error }, { data: guests, error: guestsError }] = await Promise.all([
      client.from("reservations").select("*").eq("id", id).single(),
      client
        .from("guests")
        .select("*")
        .eq("reservation_id", id)
        .order("guest_type", { ascending: true })
        .order("guest_index", { ascending: true }),
    ]);

    if (error) throw error;
    if (guestsError) throw guestsError;

    return {
      reservation: normalizeReservation(reservation),
      guests: guests.map(normalizeGuest),
    };
  },

  async saveGuests(reservationId, guests) {
    const client = requireSupabase();
    const normalizedGuests = guests.map((guest) =>
      normalizeGuestForDb({
        ...guest,
        reservationId,
      }),
    );

    await client.from("guests").delete().eq("reservation_id", reservationId);
    const { error } = await client.from("guests").insert(normalizedGuests);
    if (error) throw error;

    await this.updateReservation(reservationId, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  },
};
