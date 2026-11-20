import { test } from "node:test";
import assert from "node:assert/strict";
import { getBookingPaymentLabel, getBookingStatusLabel } from "../src/lib/booking-payment-label.js";

// Regression for QA finding: an unpaid booking abandoned at the PayU gateway
// rendered as "Paid via PayU" on the customer dashboard and "STATUS: UPCOMING"
// in vendor Client Bookings while payment_status stayed "unpaid".

test("unpaid upcoming booking never claims to be paid", () => {
  const b = { status: "upcoming", paymentStatus: "unpaid", paymentMethod: "PayU", totalPaid: 111 };
  assert.equal(getBookingPaymentLabel(b), "Payment pending");
});

test("unpaid upcoming booking status line says Payment pending, not upcoming", () => {
  assert.equal(getBookingStatusLabel({ paymentStatus: "unpaid" }, "upcoming"), "Payment pending");
});

test("paid booking still shows the payment method", () => {
  const b = { status: "upcoming", paymentStatus: "paid", paymentMethod: "PayU", totalPaid: 111 };
  assert.equal(getBookingPaymentLabel(b), "Paid via PayU");
});

test("paid booking without a recorded method shows the placeholder", () => {
  const b = { status: "upcoming", paymentStatus: "paid", paymentMethod: null, totalPaid: 50 };
  assert.equal(getBookingPaymentLabel(b), "Paid via —");
});

test("refunded booking shows Refunded", () => {
  assert.equal(getBookingPaymentLabel({ status: "completed", paymentStatus: "refunded", totalPaid: 10 }), "Refunded");
});

test("cancelled paid booking shows Refund Pending", () => {
  assert.equal(getBookingPaymentLabel({ status: "cancelled", paymentStatus: "paid", totalPaid: 10 }), "Refund Pending");
});

test("cancelled unpaid booking shows Cancelled, not Payment pending", () => {
  assert.equal(getBookingPaymentLabel({ status: "cancelled", paymentStatus: "unpaid", totalPaid: 0 }), "Cancelled");
});

test("non-upcoming derived statuses pass through with spaces", () => {
  assert.equal(getBookingStatusLabel({ paymentStatus: "paid" }, "in_progress"), "in progress");
  assert.equal(getBookingStatusLabel({ paymentStatus: "paid" }, "missed"), "missed");
});

test("null booking yields an empty payment label", () => {
  assert.equal(getBookingPaymentLabel(null), "");
});
