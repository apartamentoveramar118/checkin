import { isSupabaseConfigured } from "./services/config.js";
import { reservationService } from "./services/reservationService.js";
import { exportReservationPdf } from "./services/pdfService.js";

const app = document.querySelector("#app");
let reservations = [];
let activeSignatures = [];
let reservationFilter = "all";
let reservationSearch = "";
let isCreateFormOpen = false;
const notifiedCompletedReservations = new Set();

const statusLabels = {
  pending: "Pendiente",
  in_progress: "Pendiente",
  completed: "Check-in completado",
  ses_sent: "Enviado a SES",
  ses_error: "Error SES",
};

const statusClasses = {
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  in_progress: "bg-amber-100 text-amber-900 ring-amber-200",
  completed: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  ses_sent: "bg-sky-100 text-sky-900 ring-sky-200",
  ses_error: "bg-red-100 text-red-900 ring-red-200",
};

const statusDots = {
  pending: "bg-amber-500",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  ses_sent: "bg-sky-500",
  ses_error: "bg-red-500",
};

function icon(name, className = "h-4 w-4") {
  return `<i data-lucide="${name}" class="${className}"></i>`;
}

function refreshIcons() {
  window.lucide?.createIcons();
}

function publicUrl(token) {
  return `${window.location.origin}/checkin/${token}`;
}

function getRoute() {
  const match = window.location.pathname.match(/^\/checkin\/([^/]+)/);
  return match ? { mode: "guest", token: match[1] } : { mode: "owner" };
}

function shell(content) {
  app.innerHTML = `
    <main class="min-h-screen">
      <div class="mx-auto w-full max-w-6xl px-4 py-2.5 sm:px-6 sm:py-4 lg:px-8">
        ${content}
      </div>
    </main>
  `;
  refreshIcons();
}

function toast(message, type = "info") {
  const colors = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-slate-200 bg-white text-slate-700",
  }[type] || "border-slate-200 bg-white text-slate-700";
  const node = document.createElement("div");
  node.className = `fixed bottom-4 left-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl sm:left-auto sm:w-96 ${colors}`;
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3600);
}

function field(name, label, type = "text", value = "", attrs = "") {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${value || ""}" ${attrs} />
      <p class="error-message">Campo obligatorio.</p>
    </div>
  `;
}

function compositionText(reservation) {
  const adults = `${reservation.adultCount} adulto${reservation.adultCount === 1 ? "" : "s"}`;
  const children = `${reservation.childCount} nino${reservation.childCount === 1 ? "" : "s"}`;
  return `${adults} · ${children}`;
}

function statusBadge(status) {
  const safeStatus = statusLabels[status] ? status : "pending";
  return `
    <span class="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses[safeStatus]}">
      <span class="h-2 w-2 rounded-full ${statusDots[safeStatus]}"></span>
      ${statusLabels[safeStatus]}
    </span>
  `;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(Math.max(0, diffMs) / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} dia${days === 1 ? "" : "s"}`;
}

function isPendingStatus(status) {
  return status === "pending" || status === "in_progress";
}

function validateCounts(adultCount, childCount) {
  return adultCount >= 1 && adultCount <= 4 && childCount >= 0 && childCount <= 3 && adultCount + childCount <= 4;
}

function selectOptions(values, selected) {
  return values.map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value}</option>`).join("");
}

function documentTypeLabel(type) {
  const labels = {
    nif: "NIF",
    pasaporte: "Pasaporte",
    otros: "Otros",
  };
  return labels[type] || "NIF";
}

function optionList(options) {
  return options.map(({ value, label }) => `<option value="${value}">${label}</option>`).join("");
}

const responsibleRelationshipOptions = [
  { value: "padre", label: "Padre" },
  { value: "madre", label: "Madre" },
  { value: "tutor", label: "Tutor" },
  { value: "abuelo", label: "Abuelo" },
  { value: "abuela", label: "Abuela" },
  { value: "tio", label: "Tio" },
  { value: "tia", label: "Tia" },
];

const minorRelationshipOptions = [
  { value: "hijo", label: "Hijo" },
  { value: "hija", label: "Hija" },
  { value: "nieto", label: "Nieto" },
  { value: "nieta", label: "Nieta" },
  { value: "sobrino", label: "Sobrino" },
  { value: "sobrina", label: "Sobrina" },
  { value: "tutelado", label: "Tutelado" },
  { value: "tutelada", label: "Tutelada" },
];

function normalizePhoneForWhatsApp(phone) {
  const cleaned = String(phone || "").replace(/[\s-]/g, "");
  if (/^[6789]\d+$/.test(cleaned)) return `34${cleaned}`;
  return cleaned.replace(/^\+/, "");
}

function whatsappUrl(reservation) {
  const phone = normalizePhoneForWhatsApp(reservation.contactPhone);
  const message = `Hola.\n\nPara agilizar vuestra llegada podeis completar el pre-check-in antes de entrar al apartamento.\n\nSolo tardareis unos minutos.\n\n${publicUrl(reservation.token)}\n\nMuchas gracias.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function sortedReservations(items) {
  return [...items].sort((a, b) => {
    const statusScoreA = isPendingStatus(a.status) ? 0 : 1;
    const statusScoreB = isPendingStatus(b.status) ? 0 : 1;
    if (statusScoreA !== statusScoreB) return statusScoreA - statusScoreB;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

function filteredReservations() {
  const query = reservationSearch.trim().toLowerCase();
  return sortedReservations(reservations).filter((reservation) => {
    const matchesFilter =
      reservationFilter === "all" ||
      (reservationFilter === "pending" && isPendingStatus(reservation.status)) ||
      (reservationFilter === "completed" && reservation.status === "completed");

    if (!matchesFilter) return false;
    if (!query) return true;

    const searchable = [
      reservation.name,
      reservation.contactPhone,
      reservation.reservationReference,
      ...(reservation.guestNames || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });
}

function notifyRecentCompletions(items) {
  items
    .filter((reservation) => reservation.status === "completed" && reservation.completedAt)
    .filter((reservation) => Date.now() - new Date(reservation.completedAt).getTime() < 5 * 60 * 1000)
    .forEach((reservation) => {
      if (notifiedCompletedReservations.has(reservation.id)) return;
      notifiedCompletedReservations.add(reservation.id);
      toast(`Check-in completado: ${reservation.name || "Reserva sin nombre"} · ${compositionText(reservation)}`, "success");
    });
}

async function renderOwnerDashboard() {
  reservations = await reservationService.listReservations();
  notifyRecentCompletions(reservations);
  const visibleReservations = filteredReservations();
  shell(`
    <header class="mb-2 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Pre-Check-in Digital</h1>
      </div>
      <div class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold text-slate-500">
        <span class="h-2 w-2 rounded-full ${isSupabaseConfigured() ? "bg-emerald-500" : "bg-red-500"}"></span>
        ${isSupabaseConfigured() ? "Supabase conectado" : "Supabase no configurado"}
      </div>
    </header>

    <section class="space-y-2.5">
      <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
        <button id="toggle-reservation-form" type="button" class="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
          <span class="inline-flex items-center gap-2 text-sm font-bold text-slate-950">
            ${icon("plus-circle", "h-4 w-4 text-slate-900")}
            Nueva reserva
          </span>
          ${icon(isCreateFormOpen ? "chevron-up" : "chevron-down", "h-4 w-4 text-slate-500")}
        </button>
        ${isCreateFormOpen ? `
          <form id="reservation-form" class="border-t border-slate-100 p-4">
            <div class="grid gap-3 sm:grid-cols-2">
              ${field("name", "Nombre de la reserva (opcional)", "text", "", 'placeholder="Ej. Familia Martin"')}
              ${field("contactPhone", "Telefono WhatsApp de contacto", "tel", "", 'required placeholder="Ej. 612345678"')}
              ${field("reservationReference", "Localizador Booking / referencia", "text", "", 'placeholder="Ej. BK123456"')}
              ${field("checkIn", "Fecha entrada", "date", "", "required")}
              ${field("checkOut", "Fecha salida", "date", "", "required")}
              <div class="grid grid-cols-2 gap-3">
                <div class="field">
                  <label for="adultCount">Numero de adultos</label>
                  <select id="adultCount" name="adultCount" required>${selectOptions([1, 2, 3, 4], 1)}</select>
                  <p class="error-message">Minimo 1 adulto.</p>
                </div>
                <div class="field">
                  <label for="childCount">Numero de ninos</label>
                  <select id="childCount" name="childCount" required>${selectOptions([0, 1, 2, 3], 0)}</select>
                  <p class="error-message">Maximo 3 ninos.</p>
                </div>
              </div>
              <p id="capacity-help" class="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:col-span-2">Capacidad maxima: 4 personas.</p>
              <button class="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 sm:col-span-2">
                ${icon("link")} Generar enlace
              </button>
            </div>
          </form>
        ` : ""}
      </section>

      <section id="reservations-section" class="border-t border-slate-200 pt-2.5">
        <div class="mb-2.5 flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Reservas</h2>
            <span id="visible-count" class="text-sm font-semibold text-slate-500">${visibleReservations.length} visibles</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label class="relative block">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${icon("search", "h-4 w-4")}</span>
              <input id="reservation-search" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-slate-400" value="${reservationSearch}" placeholder="Buscar por reserva, telefono, Booking o huesped" />
            </label>
            <div class="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-1">
              ${renderFilterButton("all", "Todos")}
              ${renderFilterButton("pending", "Pendientes")}
              ${renderFilterButton("completed", "Completados")}
            </div>
          </div>
        </div>
        <div id="reservations-list" class="grid gap-3">
          ${visibleReservations.length ? visibleReservations.map(renderReservationCard).join("") : renderEmptyState()}
        </div>
      </section>
    </section>
  `);

  document.querySelector("#toggle-reservation-form").addEventListener("click", () => {
    isCreateFormOpen = !isCreateFormOpen;
    renderOwnerDashboard();
  });
  document.querySelector("#reservation-form")?.addEventListener("submit", handleCreateReservation);
  document.querySelector("#adultCount")?.addEventListener("change", updateCreateCapacityHelp);
  document.querySelector("#childCount")?.addEventListener("change", updateCreateCapacityHelp);
  document.querySelector("#reservation-search").addEventListener("input", (event) => {
    reservationSearch = event.target.value;
    refreshReservationsList();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      reservationFilter = button.dataset.filter;
      refreshReservationsList();
    });
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleReservationAction));
}

function renderFilterButton(value, label) {
  const active = reservationFilter === value;
  return `
    <button data-filter="${value}" class="rounded-md px-3 py-2 text-xs font-bold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}">
      ${label}
    </button>
  `;
}

function refreshReservationsList() {
  const visibleReservations = filteredReservations();
  const list = document.querySelector("#reservations-list");
  const count = document.querySelector("#visible-count");

  if (count) count.textContent = `${visibleReservations.length} visibles`;
  if (list) {
    list.innerHTML = visibleReservations.length ? visibleReservations.map(renderReservationCard).join("") : renderEmptyState();
    list.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleReservationAction));
  }

  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === reservationFilter;
    button.classList.toggle("bg-slate-950", active);
    button.classList.toggle("text-white", active);
    button.classList.toggle("text-slate-600", !active);
    button.classList.toggle("hover:bg-slate-50", !active);
  });

  refreshIcons();
}

function updateCreateCapacityHelp() {
  const adultCount = Number(document.querySelector("#adultCount").value);
  const childCount = Number(document.querySelector("#childCount").value);
  const help = document.querySelector("#capacity-help");
  const total = adultCount + childCount;
  help.textContent = `${total}/4 personas seleccionadas.`;
  help.classList.toggle("bg-red-50", total > 4);
  help.classList.toggle("text-red-700", total > 4);
}

function renderEmptyState() {
  return `
    <div class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      ${icon("inbox", "mx-auto h-8 w-8 text-slate-400")}
      <p class="mt-3 font-semibold text-slate-700">Todavia no hay reservas.</p>
      <p class="mt-1 text-sm text-slate-500">Crea una y comparte el enlace por WhatsApp.</p>
    </div>
  `;
}

function renderReservationCard(reservation) {
  return `
    <article class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-bold text-slate-950">${reservation.name || "Reserva sin nombre"}</h3>
            ${statusBadge(reservation.status)}
          </div>
          <p class="mt-1.5 text-sm text-slate-600">${formatDate(reservation.checkIn)} -> ${formatDate(reservation.checkOut)} - ${compositionText(reservation)}</p>
          <p class="mt-0.5 text-sm text-slate-600">WhatsApp: ${reservation.contactPhone || "-"}</p>
          ${reservation.reservationReference ? `<p class="mt-0.5 text-sm text-slate-600">Referencia: ${reservation.reservationReference}</p>` : ""}
          <p class="mt-0.5 text-sm font-semibold text-slate-500">${reservation.registeredCount}/${reservation.totalGuests} personas registradas</p>
          <p class="mt-1 text-xs font-semibold text-slate-400">Creada ${relativeTime(reservation.createdAt)}</p>
          <div class="mt-2 flex gap-2">
            <input class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" value="${publicUrl(reservation.token)}" readonly />
            <button data-action="copy" data-id="${reservation.id}" class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold hover:bg-slate-50">${icon("copy")} Copiar enlace</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:w-72">
          <button data-action="view" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold hover:bg-slate-50">Ver reserva</button>
          <button data-action="edit" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold hover:bg-slate-50">Editar</button>
          <button data-action="whatsapp" data-id="${reservation.id}" class="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50">Enviar WhatsApp</button>
          <button data-action="pdf" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold hover:bg-slate-50">Exportar PDF</button>
          <button disabled class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-400">Enviar SES - Proximamente</button>
          <button data-action="delete" data-id="${reservation.id}" class="col-span-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50">Borrar</button>
        </div>
      </div>
    </article>
  `;
}

async function handleCreateReservation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit'], button:not([type])");
  const data = Object.fromEntries(new FormData(form));
  const adultCount = Number(data.adultCount);
  const childCount = Number(data.childCount);

  if (!data.contactPhone?.trim()) {
    toast("Falta telefono WhatsApp de contacto.", "error");
    return;
  }

  if (!data.checkIn || !data.checkOut || !validateCounts(adultCount, childCount)) {
    toast("Revisa fechas y capacidad: maximo 4 personas, minimo 1 adulto.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = `${icon("loader-circle", "h-4 w-4 animate-spin")} Creando reserva...`;

  try {
    await reservationService.createReservation({
      ...data,
      contactPhone: data.contactPhone,
      reservationReference: data.reservationReference,
      adultCount,
      childCount,
    });
    toast("Reserva creada correctamente.", "success");
    isCreateFormOpen = false;
    form.reset();
    await renderOwnerDashboard();
    document.querySelector("#reservations-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    toast(error.message || "No se pudo crear la reserva.", "error");
    submitButton.disabled = false;
    submitButton.innerHTML = `${icon("link")} Generar enlace`;
    refreshIcons();
  }
}

function confirmDeleteReservation(reservation) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-end bg-slate-950/40 p-4 sm:items-center sm:justify-center";
    overlay.innerHTML = `
      <section class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div class="flex items-start gap-3">
          <span class="rounded-lg bg-red-50 p-2 text-red-700">${icon("trash-2", "h-5 w-5")}</span>
          <div>
            <h2 class="text-lg font-bold text-slate-950">Borrar reserva</h2>
            <p class="mt-2 text-sm text-slate-600">Se borrara "${reservation.name || "Reserva sin nombre"}" y todos sus huespedes asociados.</p>
          </div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-2">
          <button type="button" data-modal-cancel class="rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50">Cancelar</button>
          <button type="button" data-modal-confirm class="rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700">Borrar</button>
        </div>
      </section>
    `;

    const close = (answer) => {
      overlay.remove();
      resolve(answer);
    };

    overlay.querySelector("[data-modal-cancel]").addEventListener("click", () => close(false));
    overlay.querySelector("[data-modal-confirm]").addEventListener("click", () => close(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    document.body.append(overlay);
    refreshIcons();
  });
}

async function handleReservationAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  const id = button.dataset.id;
  const reservation = reservations.find((item) => item.id === id);

  if (action === "copy") {
    await navigator.clipboard.writeText(publicUrl(reservation.token));
    toast("Enlace copiado.", "success");
  }

  if (action === "view") {
    await renderReservationDetailsView(id);
  }

  if (action === "edit") {
    await renderEditReservation(id);
  }

  if (action === "whatsapp") {
    toast("Abriendo WhatsApp...");
    window.open(whatsappUrl(reservation), "_blank", "noopener,noreferrer");
  }

  if (action === "pdf") {
    const details = await reservationService.getReservationDetails(id);
    exportReservationPdf(details);
  }

  if (action === "delete") {
    const confirmed = await confirmDeleteReservation(reservation);
    if (!confirmed) return;

    await reservationService.deleteReservation(id);
    toast("Reserva borrada.", "success");
    await renderOwnerDashboard();
  }
}

async function renderReservationDetailsView(id) {
  const details = await reservationService.getReservationDetails(id);
  const { reservation, guests } = details;
  const detailRows = [
    ["Entrada", formatDate(reservation.checkIn)],
    ["Salida", formatDate(reservation.checkOut)],
    ["Adultos", reservation.adultCount],
    ["Ninos", reservation.childCount],
    ["Telefono", reservation.contactPhone || "-"],
    ["Referencia Booking", reservation.reservationReference || "-"],
    ["Estado", statusLabels[reservation.status] || reservation.status],
    ["Fecha creacion", `${relativeTime(reservation.createdAt)} - ${formatDateTime(reservation.createdAt)}`],
    ["Fecha completado", reservation.completedAt ? `${relativeTime(reservation.completedAt)} - ${formatDateTime(reservation.completedAt)}` : "-"],
    ["Enlace", publicUrl(reservation.token)],
  ];

  shell(`
    <button id="back-dashboard" class="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">${icon("arrow-left")} Volver</button>
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold">${reservation.name || "Reserva sin nombre"}</h1>
          <p class="mt-2 text-slate-600">${formatDate(reservation.checkIn)} -> ${formatDate(reservation.checkOut)} - ${compositionText(reservation)}</p>
          <p class="mt-1 text-sm font-semibold text-slate-500">${guests.length}/${reservation.totalGuests} personas registradas</p>
        </div>
        ${statusBadge(reservation.status)}
      </div>
    </section>
    <section class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      ${detailRows.map(([label, value]) => `
        <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${label}</dt>
          <dd class="mt-2 break-words text-sm font-semibold text-slate-900">${value}</dd>
        </article>
      `).join("")}
    </section>
    <section class="mt-5 grid gap-4">
      ${guests.length ? guests.map(renderGuestReadCard).join("") : "<p class='rounded-xl border border-slate-200 bg-white p-6 text-slate-600'>Todavia no hay datos de huespedes.</p>"}
    </section>
  `);
  document.querySelector("#back-dashboard").addEventListener("click", renderOwnerDashboard);
}

function renderGuestReadCard(guest) {
  const isChild = guest.guestType === "child";
  const title = `${isChild ? "Niño" : "Adulto"} ${guest.guestIndex}`;
  const adultRows = [
    ["Nombre", guest.fullName],
    ["Documento", `${guest.documentId} (${documentTypeLabel(guest.documentType)})`],
    ["Fecha nacimiento", guest.birthDate],
    ["Direccion", guest.address],
    ["Codigo postal", guest.postalCode],
  ];

  if (guest.phone) {
    adultRows.push(["Telefono", guest.phone]);
  }

  if (guest.relationshipResponsible) {
    adultRows.push(["Parentesco responsable", guest.relationshipResponsible]);
  }

  if (guest.supportNumber) {
    adultRows.splice(2, 0, ["Numero soporte", guest.supportNumber]);
  }

  const rows = isChild
    ? [
        ["Nombre", guest.fullName],
        ["Fecha nacimiento", guest.birthDate],
        ["Direccion", guest.address],
        ["Codigo postal", guest.postalCode],
        ["Telefono", guest.phone || guest.parentPhone],
        ["Parentesco del menor", guest.relationshipMinor || guest.relationship],
      ]
    : adultRows;

  return `
    <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="font-bold">${title}</h2>
      <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        ${rows.map(([label, value]) => `<div><dt class="font-bold text-slate-500">${label}</dt><dd class="mt-1 font-semibold">${value || "-"}</dd></div>`).join("")}
      </dl>
      ${!isChild && guest.signature ? `<img class="mt-4 h-28 rounded-lg border border-slate-200 bg-white object-contain" src="${guest.signature}" alt="Firma ${title}" />` : ""}
    </article>
  `;
}

async function renderEditReservation(id) {
  const reservation = reservations.find((item) => item.id === id);
  shell(`
    <button id="back-dashboard" class="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">${icon("arrow-left")} Volver</button>
    <form id="edit-form" class="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h1 class="mb-5 text-xl font-bold">Editar reserva</h1>
      <div class="space-y-4">
        ${field("name", "Nombre de la reserva", "text", reservation.name)}
        ${field("contactPhone", "Telefono WhatsApp de contacto", "tel", reservation.contactPhone, "required")}
        ${field("reservationReference", "Localizador Booking / referencia", "text", reservation.reservationReference)}
        ${field("checkIn", "Fecha entrada", "date", reservation.checkIn, "required")}
        ${field("checkOut", "Fecha salida", "date", reservation.checkOut, "required")}
        <div class="grid grid-cols-2 gap-3">
          <div class="field">
            <label for="adultCount">Numero de adultos</label>
            <select id="adultCount" name="adultCount" required>${selectOptions([1, 2, 3, 4], reservation.adultCount)}</select>
          </div>
          <div class="field">
            <label for="childCount">Numero de ninos</label>
            <select id="childCount" name="childCount" required>${selectOptions([0, 1, 2, 3], reservation.childCount)}</select>
          </div>
        </div>
        <div class="field">
          <label for="status">Estado</label>
          <select id="status" name="status">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === reservation.status ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <button class="min-h-11 w-full rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Guardar cambios</button>
      </div>
    </form>
  `);
  document.querySelector("#back-dashboard").addEventListener("click", renderOwnerDashboard);
  document.querySelector("#edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const adultCount = Number(data.adultCount);
    const childCount = Number(data.childCount);

    if (!validateCounts(adultCount, childCount)) {
      toast("La capacidad maxima es de 4 personas y debe haber al menos 1 adulto.", "error");
      return;
    }

    if (!data.contactPhone?.trim()) {
      toast("Falta telefono WhatsApp de contacto.", "error");
      return;
    }

    await reservationService.updateReservation(id, {
      name: data.name,
      contactPhone: data.contactPhone,
      reservationReference: data.reservationReference,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      adultCount,
      childCount,
      status: data.status,
    });
    await renderOwnerDashboard();
  });
}

async function renderGuestCheckin(token) {
  const reservation = await reservationService.getReservationByToken(token);

  if (!reservation) {
    shell(`<div class="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 class="text-xl font-bold">Enlace no encontrado</h1></div>`);
    return;
  }

  if (reservation.status === "completed" || reservation.status === "ses_sent") {
    shell(`
      <section class="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        ${icon("check-circle", "mx-auto h-10 w-10 text-emerald-600")}
        <h1 class="mt-4 text-2xl font-bold">Registro ya completado.</h1>
        <p class="mt-2 text-slate-600">Gracias.</p>
      </section>
    `);
    return;
  }

  await reservationService.updateReservation(reservation.id, { status: "in_progress" });
  shell(`
    <header class="mx-auto mb-5 max-w-3xl">
      <p class="text-sm font-bold uppercase tracking-wide text-slate-500">Bienvenido</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight">Pre-check-in de huespedes</h1>
      <p class="mt-2 text-slate-600">Para agilizar su llegada rellene los datos solicitados.</p>
      <p class="mt-2 text-sm font-semibold text-slate-500">${compositionText(reservation)}</p>
    </header>
    <form id="guest-checkin-form" class="mx-auto max-w-3xl space-y-4">
      ${Array.from({ length: reservation.adultCount }, (_, index) => renderAdultFormCard(index + 1, reservation.childCount > 0)).join("")}
      ${Array.from({ length: reservation.childCount }, (_, index) => renderChildFormCard(index + 1)).join("")}
      <button class="min-h-12 w-full rounded-xl bg-slate-950 px-4 text-base font-bold text-white shadow-sm">Enviar</button>
    </form>
  `);

  initializeGuestSignatures();
  initializeDocumentTypeSelectors();
  document.querySelector("#guest-checkin-form").addEventListener("submit", (event) => handleGuestSubmit(event, reservation));
}

function renderAdultFormCard(index, hasChildren) {
  return `
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-guest-card="adult-${index}">
      <h2 class="mb-4 text-lg font-bold">Adulto ${index}</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        ${field(`adult_${index}_fullName`, "Nombre completo", "text", "", "required")}
        <div class="field">
          <label for="adult_${index}_documentType">Tipo de documento</label>
          <select id="adult_${index}_documentType" name="adult_${index}_documentType" data-document-type="${index}" required>
            <option value="nif">NIF</option>
            <option value="pasaporte">Pasaporte</option>
            <option value="otros">Otros</option>
          </select>
          <p class="error-message">Selecciona un tipo valido.</p>
        </div>
        <div class="field">
          <label for="adult_${index}_documentId" data-document-label="${index}">Documento / NIF</label>
          <input id="adult_${index}_documentId" name="adult_${index}_documentId" type="text" required />
          <p class="error-message">Campo obligatorio.</p>
        </div>
        <div class="field" data-support-wrapper="${index}">
          <label for="adult_${index}_supportNumber">Numero de soporte</label>
          <input id="adult_${index}_supportNumber" name="adult_${index}_supportNumber" type="text" required />
          <p class="error-message">Numero de soporte obligatorio para NIF.</p>
        </div>
        ${field(`adult_${index}_birthDate`, "Fecha nacimiento", "date", "", "required")}
        <div class="sm:col-span-2">${field(`adult_${index}_address`, "Direccion", "text", "", "required")}</div>
        ${field(`adult_${index}_postalCode`, "Codigo postal", "text", "", 'required inputmode="numeric"')}
        ${index === 1 && hasChildren ? `
          <div class="field">
            <label for="adult_${index}_relationshipResponsible">Parentesco responsable</label>
            <select id="adult_${index}_relationshipResponsible" name="adult_${index}_relationshipResponsible" required>
              <option value="">Selecciona parentesco</option>
              ${optionList(responsibleRelationshipOptions)}
            </select>
            <p class="error-message">Campo obligatorio.</p>
          </div>
        ` : ""}
      </div>
      ${renderSignatureField(`adult-${index}`, "Firma digital", true)}
    </section>
  `;
}

function initializeDocumentTypeSelectors() {
  document.querySelectorAll("[data-document-type]").forEach((select) => {
    updateDocumentTypeFields(select);
    select.addEventListener("change", () => updateDocumentTypeFields(select));
  });
}

function updateDocumentTypeFields(select) {
  const index = select.dataset.documentType;
  const type = select.value;
  const documentLabel = document.querySelector(`[data-document-label="${index}"]`);
  const supportWrapper = document.querySelector(`[data-support-wrapper="${index}"]`);
  const supportInput = document.querySelector(`#adult_${index}_supportNumber`);

  if (documentLabel) {
    documentLabel.textContent = type === "nif" ? "Documento / NIF" : type === "pasaporte" ? "Documento / Pasaporte" : "Documento";
  }

  if (!supportWrapper || !supportInput) return;

  const needsSupport = type === "nif";
  supportWrapper.classList.toggle("hidden", !needsSupport);
  supportWrapper.classList.remove("has-error");
  supportInput.classList.remove("field-invalid");
  supportInput.required = needsSupport;
  if (!needsSupport) supportInput.value = "";
}

function renderChildFormCard(index) {
  return `
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-guest-card="child-${index}">
      <h2 class="mb-4 text-lg font-bold">Niño ${index}</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        ${field(`child_${index}_fullName`, "Nombre completo", "text", "", "required")}
        ${field(`child_${index}_birthDate`, "Fecha nacimiento", "date", "", "required")}
        <div class="field">
          <label for="child_${index}_relationshipMinor">Parentesco del menor</label>
          <select id="child_${index}_relationshipMinor" name="child_${index}_relationshipMinor" required>
            <option value="">Selecciona parentesco</option>
            ${optionList(minorRelationshipOptions)}
          </select>
          <p class="error-message">Campo obligatorio.</p>
        </div>
      </div>
    </section>
  `;
}

function renderSignatureField(key, label, required) {
  return `
    <div class="field mt-4" data-signature-field="${key}" data-required="${required ? "true" : "false"}">
      <div class="mb-2 flex items-center justify-between gap-3">
        <label class="mb-0">${label}</label>
        <button type="button" class="clear-signature rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50" data-index="${key}">Borrar firma</button>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <canvas class="signature-canvas rounded-lg bg-white" data-signature="${key}"></canvas>
      </div>
      <p class="error-message">Firma obligatoria.</p>
    </div>
  `;
}

function initializeGuestSignatures() {
  activeSignatures = [];
  document.querySelectorAll("[data-signature]").forEach((canvas) => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    activeSignatures.push({
      index: canvas.dataset.signature,
      pad: new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(15, 23, 42)",
      }),
    });
  });
  document.querySelectorAll(".clear-signature").forEach((button) => {
    button.addEventListener("click", () => {
      activeSignatures.find((item) => item.index === button.dataset.index)?.pad.clear();
    });
  });
}

function readRequired(form, name) {
  const input = form.elements[name];
  const empty = !String(input.value).trim();
  input.classList.toggle("field-invalid", empty);
  input.closest(".field")?.classList.toggle("has-error", empty);
  return empty ? null : input.value;
}

function readRequiredWithMessage(form, name, message, errors) {
  const value = readRequired(form, name);
  if (value === null) errors.push(message);
  return value;
}

function readOptional(form, name) {
  return form.elements[name]?.value || "";
}

async function handleGuestSubmit(event, reservation) {
  event.preventDefault();
  const form = event.currentTarget;
  const guests = [];
  const validationErrors = [];
  let adultOneAddress = "";
  let adultOnePostalCode = "";
  const contactPhone = reservation.contactPhone || "";

  if (!contactPhone.trim()) {
    toast("La reserva no tiene telefono WhatsApp de contacto.", "error");
    return;
  }

  for (let index = 1; index <= reservation.adultCount; index += 1) {
    const signature = activeSignatures.find((item) => item.index === `adult-${index}`);
    const card = form.querySelector(`[data-guest-card="adult-${index}"]`);
    const label = `Adulto ${index}`;
    const values = {
      guestType: "adult",
      guestIndex: index,
      fullName: readRequiredWithMessage(form, `adult_${index}_fullName`, `Falta nombre completo en ${label}`, validationErrors),
      documentType: readRequiredWithMessage(form, `adult_${index}_documentType`, `Falta tipo de documento en ${label}`, validationErrors),
      documentId: readRequiredWithMessage(form, `adult_${index}_documentId`, `Falta documento en ${label}`, validationErrors),
      supportNumber: readOptional(form, `adult_${index}_supportNumber`),
      birthDate: readRequiredWithMessage(form, `adult_${index}_birthDate`, `Falta fecha de nacimiento en ${label}`, validationErrors),
      address: readRequiredWithMessage(form, `adult_${index}_address`, `Falta direccion en ${label}`, validationErrors),
      postalCode: readRequiredWithMessage(form, `adult_${index}_postalCode`, `Falta codigo postal en ${label}`, validationErrors),
      phone: contactPhone,
      relationshipResponsible: index === 1 && reservation.childCount > 0
        ? readRequiredWithMessage(form, `adult_${index}_relationshipResponsible`, `Falta parentesco responsable en ${label}`, validationErrors)
        : "",
      relationshipMinor: "",
      relationship: "",
      signature: signature?.pad.toDataURL("image/png"),
    };

    if (values.documentType === "nif") {
      values.supportNumber = readRequiredWithMessage(form, `adult_${index}_supportNumber`, `Falta numero de soporte en ${label}`, validationErrors);
    } else {
      values.supportNumber = "";
    }

    const missingSignature = !signature || signature.pad.isEmpty();
    card.querySelector(`[data-signature-field="adult-${index}"]`)?.classList.toggle("has-error", missingSignature);
    if (missingSignature) validationErrors.push(`Falta firma en ${label}`);

    if (index === 1) {
      adultOneAddress = values.address || "";
      adultOnePostalCode = values.postalCode || "";
    }

    guests.push(values);
  }

  for (let index = 1; index <= reservation.childCount; index += 1) {
    const label = `Niño ${index}`;
    const values = {
      guestType: "child",
      guestIndex: index,
      fullName: readRequiredWithMessage(form, `child_${index}_fullName`, `Falta nombre completo en ${label}`, validationErrors),
      birthDate: readRequiredWithMessage(form, `child_${index}_birthDate`, `Falta fecha de nacimiento en ${label}`, validationErrors),
      address: adultOneAddress,
      postalCode: adultOnePostalCode,
      phone: contactPhone,
      parentPhone: contactPhone,
      relationshipResponsible: "",
      relationshipMinor: readRequiredWithMessage(form, `child_${index}_relationshipMinor`, `Falta parentesco del menor en ${label}`, validationErrors),
      relationship: "",
      signature: null,
      documentId: "",
      supportNumber: "",
    };

    guests.push(values);
  }

  if (validationErrors.length) {
    toast(validationErrors[0], "error");
    return;
  }

  await reservationService.saveGuests(reservation.id, guests);
  toast("Check-in completado.", "success");
  shell(`
    <section class="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      ${icon("check-circle", "mx-auto h-10 w-10 text-emerald-600")}
      <h1 class="mt-4 text-2xl font-bold">Registro completado correctamente.</h1>
      <p class="mt-2 text-slate-600">Gracias.</p>
    </section>
  `);
}

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("No se pudo registrar el service worker:", error);
    });
  }

  const route = getRoute();
  if (route.mode === "guest") {
    await renderGuestCheckin(route.token);
  } else {
    await renderOwnerDashboard();
  }
}

function renderFatalError(error) {
  const message = error?.message || "No se pudo conectar con Supabase.";
  shell(`
    <section class="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
      <div class="flex items-start gap-3">
        ${icon("triangle-alert", "mt-1 h-5 w-5 shrink-0 text-red-700")}
        <div>
          <h1 class="text-xl font-bold text-red-950">No se pudo cargar la aplicacion</h1>
          <p class="mt-2 text-sm font-semibold text-red-800">${message}</p>
          <p class="mt-3 text-sm text-red-700">La aplicacion ya no usa almacenamiento local. Revisa la conexion y las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    </section>
  `);
}

window.addEventListener("popstate", boot);
boot().catch((error) => {
  console.error(error);
  renderFatalError(error);
});
