export function prepareReservationForSES(details) {
  return {
    reservationId: details.reservation.id,
    contactPhone: details.reservation.contactPhone,
    reservationReference: details.reservation.reservationReference || null,
    guests: details.guests.map((guest) => ({
      guestType: guest.guestType,
      guestIndex: guest.guestIndex,
      firstName: guest.firstName || null,
      lastName: guest.lastName || null,
      fullName: guest.fullName,
      sex: guest.sex || null,
      nationality: guest.nationality || null,
      documentType: guest.documentType || null,
      documentId: guest.documentId || null,
      supportNumber: guest.guestType === "adult" && guest.documentType === "nif" ? guest.supportNumber : null,
      birthDate: guest.birthDate,
      issueDate: guest.issueDate || null,
      issueCountry: guest.issueCountry || null,
      address: guest.address,
      city: guest.city || null,
      postalCode: guest.postalCode,
      country: guest.country || null,
      phone: guest.phone || guest.parentPhone || null,
      parentescoResponsable: guest.relationshipResponsible || null,
      parentescoMenor: guest.relationshipMinor || null,
      relationship: guest.relationshipResponsible || guest.relationshipMinor || guest.relationship || null,
    })),
  };
}

export async function sendReservationToSES(reservationId) {
  return {
    ok: false,
    reservationId,
    message: "SES pendiente de implementación.",
  };
}
