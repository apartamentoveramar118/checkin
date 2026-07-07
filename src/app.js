import { isSupabaseConfigured } from "./services/config.js";
import { reservationService } from "./services/reservationService.js";
import { exportReservationPdf } from "./services/pdfService.js";
import { sendReservationToSES } from "./services/sesService.js";

const app = document.querySelector("#app");
let reservations = [];
let activeSignatures = [];

const statusLabels = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
  ses_sent: "Enviado SES",
};

const statusClasses = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  in_progress: "bg-blue-100 text-blue-800 ring-blue-200",
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  ses_sent: "bg-slate-900 text-white ring-slate-900",
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
      <div class="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        ${content}
      </div>
    </main>
  `;
  refreshIcons();
}

function toast(message, type = "info") {
  const colors = type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700";
  const node = document.createElement("div");
  node.className = `fixed bottom-4 left-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg sm:left-auto sm:w-96 ${colors}`;
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

async function renderOwnerDashboard() {
  reservations = await reservationService.listReservations();
  shell(`
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-sm font-bold uppercase tracking-wide text-slate-500">Propietario</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Pre-Check-in Digital</h1>
        <p class="mt-2 max-w-2xl text-slate-600">Crea enlaces de check-in para WhatsApp y recibe los datos completos antes de la llegada.</p>
      </div>
      <div class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
        ${isSupabaseConfigured() ? "Supabase conectado" : "Modo local de prueba"}
      </div>
    </header>

    <section class="grid gap-5 lg:grid-cols-[380px_1fr]">
      <form id="reservation-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-5 flex items-center gap-2">
          ${icon("calendar-plus", "h-5 w-5 text-slate-900")}
          <h2 class="text-lg font-bold">Crear reserva</h2>
        </div>
        <div class="space-y-4">
          ${field("name", "Nombre de la reserva (opcional)", "text", "", 'placeholder="Ej. Familia Martin"')}
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
          <p id="capacity-help" class="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Capacidad maxima: 4 personas.</p>
          <button class="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800">
            ${icon("link")} Generar enlace
          </button>
        </div>
      </form>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold">Reservas</h2>
          <span class="text-sm font-semibold text-slate-500">${reservations.length} total</span>
        </div>
        <div id="reservations-list" class="grid gap-3">
          ${reservations.length ? reservations.map(renderReservationCard).join("") : renderEmptyState()}
        </div>
      </section>
    </section>
  `);

  document.querySelector("#reservation-form").addEventListener("submit", handleCreateReservation);
  document.querySelector("#adultCount").addEventListener("change", updateCreateCapacityHelp);
  document.querySelector("#childCount").addEventListener("change", updateCreateCapacityHelp);
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleReservationAction));
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
    <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-bold text-slate-950">${reservation.name || "Reserva sin nombre"}</h3>
            <span class="rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusClasses[reservation.status]}">${statusLabels[reservation.status]}</span>
          </div>
          <p class="mt-2 text-sm text-slate-600">${reservation.checkIn} -> ${reservation.checkOut} · ${compositionText(reservation)}</p>
          <p class="mt-1 text-sm font-semibold text-slate-500">${reservation.registeredCount}/${reservation.totalGuests} personas registradas</p>
          <div class="mt-3 flex gap-2">
            <input class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" value="${publicUrl(reservation.token)}" readonly />
            <button data-action="copy" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 text-sm font-bold hover:bg-slate-50">${icon("copy")}</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:w-72">
          <button data-action="view" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">Ver</button>
          <button data-action="edit" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">Editar</button>
          <button data-action="pdf" data-id="${reservation.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">PDF</button>
          <button data-action="ses" data-id="${reservation.id}" class="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">Enviar a SES Hospedajes</button>
          <button data-action="delete" data-id="${reservation.id}" class="col-span-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Borrar</button>
        </div>
      </div>
    </article>
  `;
}

async function handleCreateReservation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const adultCount = Number(data.adultCount);
  const childCount = Number(data.childCount);

  if (!data.checkIn || !data.checkOut || !validateCounts(adultCount, childCount)) {
    toast("Revisa fechas y capacidad: maximo 4 personas, minimo 1 adulto.", "error");
    return;
  }

  await reservationService.createReservation({
    ...data,
    adultCount,
    childCount,
  });
  form.reset();
  await renderOwnerDashboard();
}

async function handleReservationAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  const id = button.dataset.id;
  const reservation = reservations.find((item) => item.id === id);

  if (action === "copy") {
    await navigator.clipboard.writeText(publicUrl(reservation.token));
    toast("Enlace copiado para WhatsApp.");
  }

  if (action === "view") {
    await renderReservationDetails(id);
  }

  if (action === "edit") {
    await renderEditReservation(id);
  }

  if (action === "pdf") {
    const details = await reservationService.getReservationDetails(id);
    exportReservationPdf(details);
  }

  if (action === "ses") {
    const result = await sendReservationToSES(id);
    toast(result.message);
  }

  if (action === "delete") {
    const confirmed = window.confirm("Seguro que quieres borrar esta reserva? Tambien se borraran sus huespedes.");
    if (!confirmed) return;

    await reservationService.deleteReservation(id);
    toast("Reserva borrada.");
    await renderOwnerDashboard();
  }
}

async function renderReservationDetails(id) {
  const details = await reservationService.getReservationDetails(id);
  const { reservation, guests } = details;
  shell(`
    <button id="back-dashboard" class="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">${icon("arrow-left")} Volver</button>
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold">${reservation.name || "Reserva sin nombre"}</h1>
          <p class="mt-2 text-slate-600">${reservation.checkIn} -> ${reservation.checkOut} · ${compositionText(reservation)}</p>
          <p class="mt-1 text-sm font-semibold text-slate-500">${guests.length}/${reservation.totalGuests} personas registradas</p>
          <p class="mt-2 text-sm font-semibold text-slate-500">${publicUrl(reservation.token)}</p>
        </div>
        <span class="w-fit rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusClasses[reservation.status]}">${statusLabels[reservation.status]}</span>
      </div>
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

  if (guest.relationship) {
    adultRows.push(["Parentesco", guest.relationship]);
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
        ["Parentesco", guest.relationship],
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

    await reservationService.updateReservation(id, {
      name: data.name,
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
        ${index === 1 ? field(`adult_${index}_phone`, "Telefono", "tel", "", "required") : ""}
        ${index === 1 && hasChildren ? field(`adult_${index}_relationship`, "Parentesco con los menores", "text", "", 'required placeholder="Ej. madre, padre, tutor"') : ""}
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
  let adultOnePhone = "";
  let adultOneRelationship = "";

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
      phone: index === 1
        ? readRequiredWithMessage(form, `adult_${index}_phone`, `Falta telefono en ${label}`, validationErrors)
        : "",
      relationship: index === 1 && reservation.childCount > 0
        ? readRequiredWithMessage(form, `adult_${index}_relationship`, `Falta parentesco en ${label}`, validationErrors)
        : "",
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
      adultOnePhone = values.phone || "";
      adultOneRelationship = values.relationship || "";
    } else if (reservation.childCount > 0) {
      values.phone = adultOnePhone;
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
      phone: adultOnePhone,
      parentPhone: adultOnePhone,
      relationship: adultOneRelationship,
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

window.addEventListener("popstate", boot);
boot().catch((error) => {
  console.error(error);
  toast("Ha ocurrido un error cargando la aplicacion.", "error");
});
