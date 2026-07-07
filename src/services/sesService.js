export function prepareReservationForSES(details) {
  return {
    reservationId: details.reservation.id,
    contactPhone: details.reservation.contactPhone,
    reservationReference: details.reservation.reservationReference || null,
    guests: details.guests.map((guest) => ({
      guestType: guest.guestType,
      guestIndex: guest.guestIndex,
      fullName: guest.fullName,
      documentType: guest.guestType === "adult" ? guest.documentType : null,
      documentId: guest.guestType === "adult" ? guest.documentId : null,
      supportNumber: guest.guestType === "adult" && guest.documentType === "nif" ? guest.supportNumber : null,
      birthDate: guest.birthDate,
      address: guest.address,
      postalCode: guest.postalCode,
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
