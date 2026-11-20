// Display-truth labels for a booking's payment state.
// Rule: never describe money as received unless payment_status says so.

export function getBookingPaymentLabel(booking) {
  if (!booking) return "";
  const paymentStatus = booking.paymentStatus;
  const totalPaid = Number(booking.totalPaid) || 0;
  const method = booking.paymentMethod || "—";

  if (paymentStatus === "refunded") return "Refunded";
  if (booking.status === "cancelled") {
    if (totalPaid > 0 && paymentStatus !== "unpaid") return "Refund Pending";
    return "Cancelled";
  }
  if (paymentStatus === "unpaid") return "Payment pending";
  return `Paid via ${method}`;
}

// Short status line for surfaces that show booking status text
// (e.g. vendor Client Bookings). Derived lifecycle status wins except
// that an unpaid booking is never presented as a confirmed upcoming one.
export function getBookingStatusLabel(booking, derivedStatus) {
  const derived = derivedStatus || "";
  if (derived === "upcoming" && booking && booking.paymentStatus === "unpaid") {
    return "Payment pending";
  }
  return derived.replace(/_/g, " ");
}
