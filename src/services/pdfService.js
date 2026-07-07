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

export function exportReservationPdf(details) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { reservation, guests } = details;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Pre-Check-in Digital", 20, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Reserva: ${reservation.name || "Sin nombre"}`, 20, 42);
  doc.text(`Entrada: ${reservation.checkIn}`, 20, 50);
  doc.text(`Salida: ${reservation.checkOut}`, 20, 58);
  doc.text(`Composicion: ${compositionText(reservation)}`, 20, 66);
  doc.text(`Personas registradas: ${guests.length}/${reservation.totalGuests}`, 20, 74);
  doc.text(`Estado: ${reservation.status}`, 20, 82);

  guests.forEach((guest) => {
    const isChild = guest.guestType === "child";
    const title = `${isChild ? "Nino" : "Adulto"} ${guest.guestIndex}`;
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

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(title, 20, 24);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    let y = 42;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value || ""), 68, y, { maxWidth: 116 });
      y += 10;
    });

    if (!isChild && guest.signature) {
      doc.setFont("helvetica", "bold");
      doc.text("Firma:", 20, y + 8);
      doc.addImage(guest.signature, "PNG", 20, y + 14, 120, 42);
    }
  });

  doc.save(`precheckin-${reservation.name || reservation.token}.pdf`);
}
