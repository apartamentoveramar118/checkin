const statusLabels = {
  pending: "Pendiente",
  in_progress: "Pendiente",
  completed: "Check-in completado",
  ses_sent: "Enviado a SES",
  ses_error: "Error SES",
};

function compositionText(reservation) {
  const adults = `${reservation.adultCount} adulto${reservation.adultCount === 1 ? "" : "s"}`;
  const children = `${reservation.childCount} nino${reservation.childCount === 1 ? "" : "s"}`;
  return `${adults} - ${children}`;
}

function documentTypeLabel(type) {
  const labels = {
    nif: "NIF",
    pasaporte: "Pasaporte",
    otros: "Otros",
  };
  return labels[type] || "NIF";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function generatedAt() {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function safeFileName(value) {
  return String(value || "reserva")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function drawFooter(doc) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 282, 190, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Pre-Check-in Digital", 20, 289);
    doc.text(`Pagina ${page}/${pageCount}`, 172, 289);
  }
}

function drawRows(doc, rows, startY) {
  let y = startY;
  rows.forEach(([label, value]) => {
    if (!value) return;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${label}:`, 20, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(String(value), 72, y, { maxWidth: 112 });
    y += 9;
  });
  return y;
}

function guestRows(guest) {
  const isChild = guest.guestType === "child";

  if (isChild) {
    const rows = [
      ["Nombre", guest.fullName],
      ["Fecha nacimiento", formatDate(guest.birthDate)],
      ["Dirección", guest.address],
      ["Municipio", guest.city],
      ["Provincia", guest.province],
      ["Código postal", guest.postalCode],
      ["País", guest.country],
      ["Teléfono", guest.phone || guest.parentPhone],
      ["Parentesco", guest.relationshipMinor || guest.relationship],
    ];
    if (guest.documentType) rows.splice(1, 0, ["Tipo documento", documentTypeLabel(guest.documentType)]);
    if (guest.documentId) rows.splice(2, 0, ["Documento", guest.documentId]);
    if (guest.supportNumber) rows.splice(3, 0, ["Número soporte", guest.supportNumber]);
    return rows;
  }

  const rows = [
    ["Nombre", guest.fullName],
    ["Tipo documento", documentTypeLabel(guest.documentType)],
    ["Documento", guest.documentId],
    ["Fecha nacimiento", formatDate(guest.birthDate)],
    ["Dirección", guest.address],
    ["Municipio", guest.city],
    ["Provincia", guest.province],
    ["Código postal", guest.postalCode],
    ["País", guest.country],
    ["Teléfono", guest.phone || guest.parentPhone],
  ];

  if (guest.supportNumber) rows.splice(3, 0, ["Número soporte", guest.supportNumber]);
  if (guest.relationshipResponsible) rows.push(["Parentesco responsable", guest.relationshipResponsible]);

  return rows;
}

export function exportReservationPdf(details) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { reservation, guests } = details;

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 14, 182, 250, 3, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("Pre-Check-in Digital", 20, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${generatedAt()}`, 20, 38);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Reserva", 20, 56);

  drawRows(
    doc,
    [
      ["Nombre", reservation.name || "Sin nombre"],
      ["Referencia Booking", reservation.reservationReference],
      ["Fecha de la reserva", formatDate(reservation.reservationDate)],
      ["Teléfono contacto", reservation.contactPhone],
      ["Entrada", formatDate(reservation.checkIn)],
      ["Salida", formatDate(reservation.checkOut)],
      ["Composicion", compositionText(reservation)],
      ["Personas registradas", `${guests.length}/${reservation.totalGuests}`],
      ["Estado", statusLabels[reservation.status] || reservation.status],
    ],
    70,
  );

  guests.forEach((guest) => {
    const isChild = guest.guestType === "child";
    const title = `${isChild ? "Niño" : "Adulto"} ${guest.guestIndex}`;

    doc.addPage();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 14, 182, 250, 3, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 20, 30);

    const y = drawRows(doc, guestRows(guest), 48);

    if (guest.signature) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("Firma:", 20, y + 8);
      doc.addImage(guest.signature, "PNG", 20, y + 14, 120, 42);
    }
  });

  drawFooter(doc);
  doc.save(`precheckin-${safeFileName(reservation.name || reservation.token)}.pdf`);
}
