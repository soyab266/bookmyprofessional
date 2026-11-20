// Unpaid-booking guard: an upcoming+unpaid booking must not be actionable as
// confirmed (vendor Start Service) and must not receive paid-booking reminders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.NODE_ENV = "test";

import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);

const { updateBookingStatus } = await import("../src/lib/data/bookings.js");

// Minimal Supabase-client double: updateBookingStatus(status="in_progress")
// first SELECTs the current row, then UPDATEs when guards pass.
function fakeClient(currentRow) {
  const calls = { updated: false };
  return {
    calls,
    from(table) {
      assert.equal(table, "bookings");
      return {
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: currentRow }; } };
            },
          };
        },
        update() {
          calls.updated = true;
          return {
            eq() {
              return {
                select() {
                  return { async single() { return { data: { id: "B1", status: "in_progress", professionals: null } }; } };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("unpaid upcoming booking cannot be started (real updateBookingStatus, mock client)", async () => {
  const client = fakeClient({ status: "upcoming", payment_status: "unpaid", starts_at: null, date: "2099-01-01", time_slot: "10:00 AM" });
  await assert.rejects(
    () => updateBookingStatus("B1", "in_progress", client),
    /hasn't been paid yet/i
  );
  assert.equal(client.calls.updated, false);
});

test("paid upcoming booking can still be started (guard passes paid through)", async () => {
  const client = fakeClient({ status: "upcoming", payment_status: "paid", starts_at: null, date: "2099-01-01", time_slot: "10:00 AM" });
  const r = await updateBookingStatus("B1", "in_progress", client);
  assert.equal(client.calls.updated, true);
  assert.equal(r.status, "in_progress");
});

test("vendor page offers Start Service only for paid bookings and marks unpaid as awaiting payment", () => {
  const s = readFileSync(new URL("../src/app/vendor/page.jsx", import.meta.url), "utf8");
  assert.match(s, /derivedStatus === "upcoming" && b\.paymentStatus !== "paid"/);
  assert.match(s, /Awaiting customer payment/);
});

test("WhatsApp reminder route only selects paid upcoming bookings", () => {
  const s = readFileSync(new URL("../src/app/api/notifications/whatsapp-reminder/route.js", import.meta.url), "utf8");
  const selects = s.match(/from\('bookings'\)[\s\S]*?\.eq\('status', 'upcoming'\)\s*\n?\s*\.eq\('payment_status', 'paid'\)/g);
  assert.ok(selects && selects.length >= 2, "both booking queries must filter payment_status = paid");
});
