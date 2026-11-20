import { createClient } from "@/lib/supabase/client";
import { createPaymentForBooking, getCommissionRate } from "./payments";

import { toUtcInstant, isBookingExpired } from "@/lib/datetime";
function generateBookingId() {
  return `BMP-${Math.floor(10000 + Math.random() * 90000)}`;
}

function userFacing(message) {
  const err = new Error(message);
  err.isUserFacing = true;
  return err;
}

// Next `count` calendar days (local) for the slot picker.
export function nextBookingDates(count = 14) {
  const today = new Date();
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    out.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      day,
      num: String(d.getDate()),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : day,
    });
  }
  return out;
}

function normalizeSlots(availability) {
  return Array.isArray(availability?.slots) ? availability.slots : [];
}

async function fetchTimezone(supabase, professionalId) {
  if (!professionalId) return null;
  try {
    const { data, error } = await supabase
      .from("professionals")
      .select("timezone")
      .eq("id", professionalId)
      .single();
    if (error) throw error;
    return data?.timezone || null;
  } catch {
    return null; // ponytail: timezone column unapplied -> toUtcInstant falls back to UTC.
  }
}

function mapBooking(row) {
  const pro = row.professionals || {};
  const customer = row.customer || {};
  let reviews = [];
  if (Array.isArray(row.reviews)) {
    reviews = row.reviews;
  } else if (row.reviews && typeof row.reviews === 'object') {
    reviews = [row.reviews];
  }

  return {
    id: row.id,
    proId: row.professional_id,
    proName: pro.name || "Professional",
    proRole: pro.role_title || "",
    proAvatar: pro.image_url || "",
    serviceTitle: row.service_title || "",
    servicePrice: Number(row.service_price) || 0,
    platformFee: Number(row.platform_fee) || 0,
    totalPaid: Number(row.total_paid) || 0,
    date: row.date,
    timeSlot: row.time_slot,
    startsAt: row.starts_at || null,
    address: row.address || "",
    customerNotes: row.notes || "None provided",
    customerName: customer.full_name || "Customer",
    customerEmail: customer.email || "",
    customerPhone: customer.phone || "",
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || "",
    createdAt: row.created_at,
    hasReview: reviews.length > 0,
    reviewRating: reviews.length > 0 ? reviews[0].rating : null,
  };
}

// ponytail: null when supabase is unavailable / no session, so the context can fall back to INITIAL_BOOKINGS.
export async function listMyBookings(client) {
  try {
    const supabase = client || createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return null;

    let dbBookings = [];
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, professionals(name, role_title, image_url), customer:profiles(full_name, email, phone), reviews(id, rating)"
        )
        .order("created_at", { ascending: false });

      if (!error && data) dbBookings = data.map(mapBooking);
    } catch (err) {}

    return dbBookings;
  } catch {
    return null;
  }
}

// ponytail: empty list on error keeps the slot picker usable while schema.sql is unapplied.
export async function listTakenSlots(professionalId, date, client) {
  try {
    const supabase = client || createClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("time_slot, status, payment_status")
      .eq("professional_id", professionalId)
      .eq("date", date)
      .in("status", ["upcoming", "in_progress", "completed"]);
    if (error) throw error;
    const validSlots = (data || []).filter(r => !(r.status === 'upcoming' && r.payment_status === 'unpaid'));
    return validSlots.map((r) => r.time_slot);
  } catch {
    return [];
  }
}

// Parse "HH:mm" time string to integer minutes from midnight.
export function parseTimeMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  if (isNaN(h)) return null;
  return h * 60 + (isNaN(m) ? 0 : m);
}

// Format "HH:mm" 24-hour time to "hh:mm AM/PM"
export function formatTime24to12(timeStr) {
  if (!timeStr) return "";
  const parts = String(timeStr).split(":");
  let h = parseInt(parts[0], 10);
  const m = parts[1] ? parts[1].padStart(2, "0") : "00";
  if (isNaN(h)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}

// Convert decimal hour e.g. 9.5 to "09:30 AM"
export function formatHourToSlot(hourDecimal) {
  let h = Math.floor(hourDecimal);
  const mins = Math.round((hourDecimal - h) * 60);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  const hPadded = String(h).padStart(2, "0");
  const mPadded = String(mins).padStart(2, "0");
  return `${hPadded}:${mPadded} ${ampm}`;
}

/**
 * Generate slots for a day given its configuration.
 * Rules:
 * - Starts at startTime (default "09:00")
 * - Last bookable slot is strictly 2 hours before closing (endTime)
 * - Skips slots falling within break window (if break is enabled)
 */
export function generateSlotsForDay(dayConfig) {
  if (!dayConfig || !dayConfig.enabled) return [];
  const startMins = parseTimeMinutes(dayConfig.startTime || "09:00");
  const endMins = parseTimeMinutes(dayConfig.endTime || "18:00");
  if (startMins === null || endMins === null || startMins >= endMins) return [];

  // Cutoff rule: Last bookable slot is 2 hours (120 mins) before closing
  const lastSlotMins = endMins - 120;
  if (startMins > lastSlotMins) return [];

  const breakActive = Boolean(dayConfig.break?.enabled && dayConfig.break?.start && dayConfig.break?.end);
  const breakStart = breakActive ? parseTimeMinutes(dayConfig.break.start) : null;
  const breakEnd = breakActive ? parseTimeMinutes(dayConfig.break.end) : null;

  const slots = [];
  // 60-minute step
  for (let m = startMins; m <= lastSlotMins; m += 60) {
    if (breakActive && breakStart !== null && breakEnd !== null) {
      if (m >= breakStart && m < breakEnd) {
        continue;
      }
    }
    slots.push(formatHourToSlot(m / 60));
  }
  return slots;
}

// Check if a date is a working day based on availability object or legacy days array.
export function isWorkingDay(date, availabilityOrDays) {
  if (!availabilityOrDays) return false;
  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });

  if (Array.isArray(availabilityOrDays)) {
    if (availabilityOrDays.length === 0) return true;
    return availabilityOrDays.some((d) => String(d).toLowerCase() === weekday.toLowerCase());
  }

  if (typeof availabilityOrDays === "object") {
    if (availabilityOrDays.daily && typeof availabilityOrDays.daily === "object") {
      return Boolean(availabilityOrDays.daily[weekday]?.enabled);
    }
    if (Array.isArray(availabilityOrDays.days)) {
      if (availabilityOrDays.days.length === 0) return true;
      return availabilityOrDays.days.some((d) => String(d).toLowerCase() === weekday.toLowerCase());
    }
  }

  return false;
}

// Slots the professional offers on `date`, minus already booked slots.
export async function getAvailableSlots(professionalId, date, availability, client) {
  try {
    const supabase = client || createClient();
    let avail = availability;
    if (professionalId) {
      const { data, error } = await supabase
        .from("professionals")
        .select("availability")
        .eq("id", professionalId)
        .single();
      if (!error && data?.availability) {
        avail = data.availability;
      }
    }

    if (!avail || typeof avail !== "object") {
      return [];
    }

    const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });

    let baseSlots = [];
    if (avail.daily && typeof avail.daily === "object") {
      const dayConfig = avail.daily[weekday];
      if (!dayConfig || !dayConfig.enabled) {
        return [];
      }
      baseSlots = generateSlotsForDay(dayConfig);
    } else if (Array.isArray(avail.days) && avail.days.length > 0) {
      const isDayActive = avail.days.some((d) => String(d).toLowerCase() === weekday.toLowerCase());
      if (!isDayActive) return [];
      const closingHour = parseClosingHour(avail.hours);
      const rawSlots = normalizeSlots(avail);
      baseSlots = rawSlots.filter((s) => {
        const h = parseSlotHour(s);
        return h !== null && h <= closingHour - 2;
      });
    } else if (Array.isArray(avail.slots) && avail.slots.length > 0) {
      const closingHour = parseClosingHour(avail.hours);
      baseSlots = avail.slots.filter((s) => {
        const h = parseSlotHour(s);
        return h !== null && h <= closingHour - 2;
      });
    } else {
      return [];
    }

    if (!baseSlots.length) return [];

    const taken = new Set(await listTakenSlots(professionalId, date, supabase));
    let available = baseSlots.filter((s) => !taken.has(s));

    // Convert "now" to IST wall-clock (UTC+5:30) for today comparisons
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const todayIST = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;
    const nowHourIST = nowIST.getUTCHours() + nowIST.getUTCMinutes() / 60;

    // For today: filter out slots that have already passed or are within a 1-hour buffer
    if (date === todayIST) {
      available = available.filter((slot) => {
        const slotH = parseSlotHour(slot);
        return slotH !== null && slotH >= nowHourIST + 1;
      });
    }

    return available;
  } catch {
    return [];
  }
}

/**
 * Parse a slot string like "09:00 AM" or "2:30 PM" into a decimal hour value.
 * Returns null when the string can't be parsed.
 */
function parseSlotHour(slot) {
  const m = String(slot).match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h + mins / 60;
}

/**
 * Parse the closing hour from an hours string like "09:00 AM - 06:00 PM".
 * Returns the decimal hour value, defaulting to 18 (6 PM).
 */
function parseClosingHour(hoursStr) {
  if (!hoursStr) return 18;
  const m = String(hoursStr).match(/[-–]\s*(\d+)[:.]?(\d*)\s*(AM|PM)?/i);
  if (!m) return 18;
  let h = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h + mins / 60;
}

/**
 * Compute the first genuinely open appointment slot across the next `lookAheadDays` days.
 */
export async function getNextAvailableSlot(professionalId, availability, supabase, lookAheadDays = 14) {
  if (!professionalId || !availability || !supabase) return null;

  // Convert "now" to IST wall-clock (UTC+5:30) for correct today comparisons
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const todayIST = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;
  const nowHourIST = nowIST.getUTCHours() + nowIST.getUTCMinutes() / 60;

  for (let i = 0; i < lookAheadDays; i++) {
    const d = new Date(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });

    let validSlots = [];
    if (availability.daily && typeof availability.daily === "object") {
      const dayConfig = availability.daily[weekday];
      if (!dayConfig || !dayConfig.enabled) continue;
      validSlots = generateSlotsForDay(dayConfig);
    } else if (Array.isArray(availability.days) && availability.days.length > 0) {
      if (!availability.days.some((wd) => wd.toLowerCase() === weekday.toLowerCase())) continue;
      const closingHour = parseClosingHour(availability.hours);
      validSlots = (availability.slots || []).filter((s) => {
        const h = parseSlotHour(s);
        return h !== null && h <= closingHour - 2;
      });
    } else if (Array.isArray(availability.slots) && availability.slots.length > 0) {
      const closingHour = parseClosingHour(availability.hours);
      validSlots = availability.slots.filter((s) => {
        const h = parseSlotHour(s);
        return h !== null && h <= closingHour - 2;
      });
    } else {
      continue;
    }

    if (!validSlots.length) continue;

    let taken;
    try {
      taken = new Set(await listTakenSlots(professionalId, dateStr, supabase));
    } catch {
      taken = new Set();
    }

    for (const slot of validSlots) {
      if (taken.has(slot)) continue;

      // For today: skip slots already past or within 1-hour buffer
      if (dateStr === todayIST) {
        const slotH = parseSlotHour(slot);
        if (slotH !== null && slotH < nowHourIST + 1) continue;
      }

      // Found! Format: "Mon, 6 Oct • 09:00 AM"
      const dateLabel = d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      return `${dateLabel} • ${slot}`;
    }
  }

  return null;
}

export async function createBooking(payload, client) {
  const supabase = client || createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw userFacing("Please sign in to confirm your booking.");

  const {
    pro,
    service,
    date,
    timeSlot,
    address,
    notes,
    paymentMethod,
  } = payload || {};

  if (pro?.id && pro.id === auth.user.id) {
    throw userFacing("You cannot book your own service.");
  }

  // Re-check verification against the database — the passed pro object is
  // client-controlled and must never be the only gate for booking creation.
  if (pro?.id) {
    const { data: proRow, error: proLookupError } = await supabase
      .from("professionals")
      .select("id, verified, verification_status")
      .eq("id", pro.id)
      .maybeSingle();
    if (proLookupError || !proRow) {
      throw userFacing("This professional is not available for booking.");
    }
    if (!(proRow.verified === true && proRow.verification_status === "approved")) {
      throw userFacing("This professional's verification is still in progress. Booking opens once their profile is verified.");
    }
  }

  // Server-side pincode and city validation for booking address
  const explicitPin = payload.pincode ? String(payload.pincode).trim().replace(/\D/g, "").slice(0, 6) : null;
  // If not explicit, try to extract 6-digit PIN from address string
  const pinMatch = explicitPin || (address ? String(address).match(/\b[1-9][0-9]{5}\b/)?.[0] : null);
  const explicitCity = payload.city ? String(payload.city).trim() : null;

  if (pinMatch) {
    if (!/^[1-9][0-9]{5}$/.test(pinMatch)) {
      throw userFacing("Pincode must be exactly 6 digits and cannot start with 0.");
    }

    try {
      const origin = typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
      const cityQuery = explicitCity ? `&city=${encodeURIComponent(explicitCity)}` : "";
      const res = await fetch(`${origin}/api/location/verify-pincode?pincode=${pinMatch}${cityQuery}`, {
        headers: { Accept: "application/json" }
      });
      const data = await res.json();
      if (data?.cityMismatch) {
        throw userFacing(data.error || `City "${explicitCity}" does not match pincode ${pinMatch}.`);
      }
      if (!data?.valid && !data?.warning) {
        throw userFacing(data?.error || `Invalid pincode: ${pinMatch} does not exist in India Post records.`);
      }
    } catch (err) {
      if (err?.isUserFacing) throw err;
      console.warn("[createBooking] Pincode verification network warning:", err?.message);
    }
  } else if (address) {
    // If address was provided but has a 5-digit pin, reject it explicitly
    const fiveDigitMatch = String(address).match(/\b\d{5}\b/);
    if (fiveDigitMatch) {
      throw userFacing("Pincode must be exactly 6 digits. 5-digit pincodes are not accepted.");
    }
  }

  const servicePrice = Number(service?.price ?? pro?.price ?? 0);
  const platformFee = 0;
  const totalPaid = servicePrice + platformFee;

  const timezone = pro?.timezone || (await fetchTimezone(supabase, pro?.id)) || "UTC";

  const row = {
    id: generateBookingId(),
    customer_id: auth.user.id,
    professional_id: pro?.id ?? null,
    service_id: service?.id ?? null,
    service_title: service?.title ?? null,
    service_price: servicePrice,
    platform_fee: platformFee,
    total_paid: totalPaid,
    date,
    time_slot: timeSlot,
    address: address ?? null,
    notes: notes ?? null,
    status: "upcoming",
    payment_status: payload.paymentStatus || "unpaid",
    payment_method: paymentMethod ?? null,
    starts_at: toUtcInstant(date, timeSlot, timezone),
  };

  let { data, error } = await supabase
    .from("bookings")
    .insert(row)
    .select("*, professionals(name, role_title, image_url)")
    .single();

  // ponytail: starts_at column may not be migrated yet -> retry without it so the booking still persists.
  if (error && /starts_at/.test(error.message || "")) {
    const withoutStartsAt = { ...row };
    delete withoutStartsAt.starts_at;
    ({ data, error } = await supabase
      .from("bookings")
      .insert(withoutStartsAt)
      .select("*, professionals(name, role_title, image_url)")
      .single());
  }

  if (error) {
    if (error.code === "23505") {
      throw userFacing("Sorry, that time slot was just booked. Please pick another slot.");
    }
    throw error;
  }

  const booking = mapBooking(data);

  // ponytail: escrow row is best-effort — the booking stays valid even if the payments insert fails.
  try {
    const rate = await getCommissionRate(supabase);
    await createPaymentForBooking(booking, rate, supabase);
  } catch {
    // reconcile the escrow row once the payments table exists
  }

  return booking;
}

export async function updateBookingStatus(bookingId, status, client) {
  const supabase = client || createClient();

  if (status === "in_progress") {
    const { data: current } = await supabase
      .from("bookings")
      .select("starts_at, date, time_slot, status, payment_status")
      .eq("id", bookingId)
      .maybeSingle();
    if (current && current.status === "upcoming" && current.payment_status !== "paid") {
      throw userFacing("This booking hasn't been paid yet, so the service can't be started.");
    }
    if (current && current.status === "upcoming") {
      const mapped = mapBooking(current);
      if (isBookingExpired(mapped)) {
        throw userFacing("Cannot start an appointment whose scheduled time has passed. Please contact the customer to reschedule.");
      }
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .select("*, professionals(name, role_title, image_url)")
    .single();
  if (error) {
    // ponytail: the DB trigger owns the state machine; just translate its rejection for the UI.
    if (error.code === "P0001" || /invalid booking status transition/i.test(error.message || "")) {
      throw userFacing("That status change isn't allowed from the current booking state.");
    }
    throw error;
  }
  return mapBooking(data);
}

async function getCancellationWindowHours(supabase) {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "cancellation")
      .single();
    if (error) throw error;
    const hours = Number(data?.value?.window_hours);
    return Number.isFinite(hours) ? hours : 24;
  } catch {
    return 24;
  }
}

export async function cancelBooking(bookingId, client) {
  const supabase = client || createClient();

  const { data: row, error: readError } = await supabase
    .from("bookings")
    .select("*, professionals(name, role_title, image_url)")
    .eq("id", bookingId)
    .single();
  if (readError) throw readError;

  let startsAt = row?.starts_at ? new Date(row.starts_at) : null;
  if (!startsAt) {
    const timezone = await fetchTimezone(supabase, row?.professional_id);
    const iso = toUtcInstant(row?.date, row?.time_slot, timezone);
    startsAt = iso ? new Date(iso) : null;
  }

  if (startsAt && !Number.isNaN(startsAt.getTime())) {
    const windowHours = await getCancellationWindowHours(supabase);
    const cutoff = startsAt.getTime() - windowHours * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      throw userFacing(
        `Cancellation window has passed. Bookings can only be cancelled more than ${windowHours} hours before the appointment.`
      );
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .select("*, professionals(name, role_title, image_url)")
    .single();
  if (error) throw error;
  return mapBooking(data);
}

export async function rescheduleBooking(bookingId, { date, timeSlot }, client) {
  const supabase = client || createClient();

  const { data: row, error: readError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (readError) throw readError;

  if (row?.status !== "upcoming" || row?.payment_status !== "paid") {
    throw userFacing("Only paid, upcoming bookings can be rescheduled.");
  }

  let timezone = null;
  let startsAt = row?.starts_at ? new Date(row.starts_at) : null;
  if (!startsAt) {
    timezone = await fetchTimezone(supabase, row?.professional_id);
    const iso = toUtcInstant(row?.date, row?.time_slot, timezone);
    startsAt = iso ? new Date(iso) : null;
  }

  if (startsAt && !Number.isNaN(startsAt.getTime())) {
    const windowHours = await getCancellationWindowHours(supabase);
    const cutoff = startsAt.getTime() - windowHours * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      throw userFacing(
        `Reschedule window has passed. Bookings can only be changed more than ${windowHours} hours before the appointment.`
      );
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !timeSlot) {
    throw userFacing("Please pick a new date and time slot.");
  }
  if (date === row.date && timeSlot === row.time_slot) {
    throw userFacing("That's already your current slot. Please pick another slot.");
  }

  if (!timezone) timezone = await fetchTimezone(supabase, row?.professional_id);
  const patch = { date, time_slot: timeSlot, starts_at: toUtcInstant(date, timeSlot, timezone) };

  let { data, error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("*, professionals(name, role_title, image_url)")
    .single();

  if (error && /starts_at/.test(error.message || "")) {
    const withoutStartsAt = { ...patch };
    delete withoutStartsAt.starts_at;
    ({ data, error } = await supabase
      .from("bookings")
      .update(withoutStartsAt)
      .eq("id", bookingId)
      .select("*, professionals(name, role_title, image_url)")
      .single());
  }

  if (error) {
    if (error.code === "23505") {
      throw userFacing("That slot was just taken. Please pick another slot.");
    }
    throw error;
  }

  return mapBooking(data);
}
