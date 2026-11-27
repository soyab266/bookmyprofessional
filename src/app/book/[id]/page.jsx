"use client";

import React, { useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAuth } from "@/context/AuthContext";
import {
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  User,
  Phone,
  Mail,
  FileText,
  Sparkles,
  AlertCircle,
  Download,
  ChevronRight,
  Check,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cleanPincode, isValidPincodeFormat } from "@/lib/pincode";
import PincodeInput from "@/components/PincodeInput";
import { getAvailableSlots, nextBookingDates } from "@/lib/data/bookings";
import { ikImage } from "@/lib/imagekit";

function formatConfirmationDateTime(dateStr, timeSlot) {
  if (!dateStr) return timeSlot || "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayName = dt.toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" });
    const formattedDate = dt.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    return `${dayName}, ${formattedDate} at ${timeSlot} (IST, UTC+5:30)`;
  } catch {
    return `${dateStr} at ${timeSlot} (IST, UTC+5:30)`;
  }
}

function BookingPageContent({ params }) {
  const unwrappedParams = use(params);
  const proId = unwrappedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedServiceId = searchParams.get("service");

  const { professionals, createBooking, customerProfile, isLoadingProfessionals } = useMarketplace();
  const { user } = useAuth();

  // Find the requested pro. `pro` keeps a safe fallback for the hooks below; `matchedPro` gates rendering.
  const matchedPro =
    professionals.find((p) => p.id === proId) ||
    professionals.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, "-").includes(proId));
  const pro = matchedPro || professionals[0];
  const isOwnProfile = !!(user && matchedPro && user.id === matchedPro.id);

  // Wizard Step: 1 = Service, 2 = Date/Slot, 3 = Address, 4 = Payment, 5 = Confirmation
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [confirmedBookingData, setConfirmedBookingData] = useState(null);

  // Form State
  const [selectedService, setSelectedService] = useState(
    (preselectedServiceId && pro?.services?.find((s) => s.id === preselectedServiceId)) ||
      (pro?.services && pro.services[0]) ||
      null
  );
  const [selectedDate, setSelectedDate] = useState(() => nextBookingDates(14)[0].date);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [addressDetails, setAddressDetails] = useState({
    name: customerProfile.name || "",
    email: customerProfile.email || "",
    phone: customerProfile.phone || "",
    street: "",
    city: "",
    postalCode: "",
    notes: "",
  });
  const [pincodeVerification, setPincodeVerification] = useState(null);

  // Keep form updated if profile loads late
  useEffect(() => {
    setAddressDetails((prev) => ({
      ...prev,
      name: prev.name || customerProfile.name || "",
      email: prev.email || customerProfile.email || "",
      phone: prev.phone || customerProfile.phone || "",
    }));
  }, [customerProfile]);

  // Preselect the service once professionals finish loading (direct page load / refresh),
  // unless the customer already picked one.
  useEffect(() => {
    if (selectedService) return;
    if (!pro?.services?.length) return;
    const preselected =
      (preselectedServiceId && pro.services.find((s) => s.id === preselectedServiceId)) ||
      pro.services[0];
    setSelectedService(preselected);
  }, [pro?.services, preselectedServiceId, selectedService]);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState("payu"); // "payu"
  const [cardDetails, setCardDetails] = useState({
    number: "",
    expiry: "",
    cvc: "",
    cardholder: "",
  });
  const [paymentError, setPaymentError] = useState("");
  const [liveAvailability, setLiveAvailability] = useState(null);

  const nextDays = nextBookingDates(14);

  // Helper: check if date is an active working day
  const isDayAvailable = (dateStr) => {
    const avail = liveAvailability || matchedPro?.availability;
    if (!avail) return false;
    const weekday = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    if (avail.daily && typeof avail.daily === "object") {
      return Boolean(avail.daily[weekday]?.enabled);
    }
    const days = Array.isArray(avail?.days) ? avail.days : [];
    if (days.length === 0) return true;
    return days.some((d) => String(d).toLowerCase() === weekday.toLowerCase());
  };

  // Fetch real-time availability from DB for the professional
  useEffect(() => {
    if (!matchedPro?.id) {
      setLiveAvailability(null);
      return;
    }
    let active = true;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase
        .from("professionals")
        .select("availability")
        .eq("id", matchedPro.id)
        .single()
        .then(({ data }) => {
          if (active && data?.availability) {
            setLiveAvailability(data.availability);
          }
        })
        .catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [matchedPro?.id]);

  // Auto-jump to the first open working day
  useEffect(() => {
    if (!liveAvailability && !matchedPro?.availability) return;
    const days = nextBookingDates(14);
    const firstOpen = days.find((d) => isDayAvailable(d.date));
    if (firstOpen) {
      setSelectedDate(firstOpen.date);
    }
  }, [liveAvailability, matchedPro]);

  // Reload real availability whenever the pro or selected date changes.
  useEffect(() => {
    if (!matchedPro) return;
    let active = true;
    setIsLoadingSlots(true);
    getAvailableSlots(matchedPro.id, selectedDate, liveAvailability || matchedPro.availability).then((slots) => {
      if (!active) return;
      setAvailableSlots(slots);
      setSelectedTimeSlot((prev) => (slots.includes(prev) ? prev : slots[0] || ""));
      setIsLoadingSlots(false);
    });
    return () => {
      active = false;
    };
  }, [matchedPro, selectedDate, liveAvailability]);

  const handlePayAndConfirm = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!selectedTimeSlot) return;
    if (!addressDetails.phone?.trim()) {
      setPaymentError("Please enter your phone number before confirming the booking.");
      return;
    }
    if (!addressDetails.street?.trim()) {
      setPaymentError("Please enter your street address.");
      return;
    }
    const cleanPin = cleanPincode(addressDetails.postalCode);
    if (!isValidPincodeFormat(cleanPin)) {
      setPaymentError("Please enter a valid 6-digit Indian postal code.");
      return;
    }
    if (pincodeVerification && !pincodeVerification.valid) {
      setPaymentError(pincodeVerification.error || "Please enter a valid, verified Indian pincode.");
      return;
    }
    
    setPaymentError("");
    setIsProcessingPayment(true);

    const payload = {
      pro: matchedPro,
      service: selectedService || { title: pro.role, price: pro.price, id: null },
      date: selectedDate,
      timeSlot: selectedTimeSlot,
      address: `${addressDetails.street}, ${addressDetails.postalCode} ${addressDetails.city}`,
      pincode: addressDetails.postalCode,
      city: addressDetails.city,
      notes: addressDetails.notes,
      customerName: addressDetails.name,
      customerEmail: addressDetails.email,
      customerPhone: addressDetails.phone,
      paymentMethod: "PayU",
      paymentStatus: "unpaid"
    };

    try {
      const newBooking = await createBooking(payload);

      const servicePrice = selectedService ? selectedService.price : (pro?.price || 0);
      const totalAmount = servicePrice;

      const hashRes = await fetch("/api/payu/hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txnid: newBooking.id,
          amount: totalAmount,
          productinfo: selectedService?.title || pro.role,
          firstname: addressDetails.name || "Customer",
          email: addressDetails.email || "customer@example.com",
          phone: addressDetails.phone || "9999999999",
          surl: `${window.location.origin}/api/payu/callback`,
          furl: `${window.location.origin}/api/payu/callback`
        })
      });

      const hashData = await hashRes.json();
      if (!hashRes.ok) throw new Error(hashData.error || "Failed to initiate payment");

      const form = document.createElement("form");
      form.setAttribute("method", "post");
      form.setAttribute("action", hashData.action || "https://secure.payu.in/_payment");

      const fields = {
        key: hashData.key,
        txnid: hashData.txnid,
        amount: hashData.amount,
        productinfo: hashData.productinfo,
        firstname: hashData.firstname,
        email: hashData.email,
        phone: hashData.phone,
        surl: hashData.surl,
        furl: hashData.furl,
        hash: hashData.hash
      };

      for (const key in fields) {
        const hiddenField = document.createElement("input");
        hiddenField.setAttribute("type", "hidden");
        hiddenField.setAttribute("name", key);
        hiddenField.setAttribute("value", fields[key] || "");
        form.appendChild(hiddenField);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setPaymentError(err.message || "Failed to confirm booking.");
      setIsProcessingPayment(false);
    }
  };

  const servicePrice = selectedService ? selectedService.price : (pro?.price || 0);
  const platformFee = 0;
  const totalAmount = servicePrice + platformFee;

  const isPaymentDisabled = isProcessingPayment || isOwnProfile;

  if (isLoadingProfessionals && !matchedPro) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-dark-800">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </main>
      </div>
    );
  }

  if (!matchedPro && !isLoadingProfessionals) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-dark-800">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-dark-900">
              Professional not found
            </h1>
            <p className="text-sm text-dark-500 mt-2">
              This professional may have been removed or is no longer available to book.
            </p>
            <Link
              href="/professionals"
              className="inline-flex items-center justify-center mt-5 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-button transition-colors"
            >
              Browse Professionals
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (matchedPro && !(matchedPro.verified && matchedPro.verificationStatus === "approved")) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-dark-800">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-dark-900">
              Booking not available yet
            </h1>
            <p className="text-sm text-dark-500 mt-2">
              This professional&apos;s verification is still in progress. Booking opens once their profile is verified.
            </p>
            <Link
              href="/professionals"
              className="inline-flex items-center justify-center mt-5 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-button transition-colors"
            >
              Browse Verified Professionals
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-dark-800">
      <Navbar />

      {/* BREADCRUMBS */}
      <div className="bg-surface border-b border-border py-3">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs text-dark-500 font-medium">
            <Link href="/" className="hover:text-primary-600 transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-400" />
            <Link href="/professionals" className="hover:text-primary-600 transition-colors">
              Professionals
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-400" />
            <Link href={`/professionals/${pro.id}`} className="hover:text-primary-600 transition-colors">
              {pro.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-400" />
            <span className="text-dark-900 font-semibold">Book Appointment</span>
          </div>
        </div>
      </div>

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          {isOwnProfile && (
            <div className="mb-6 max-w-2xl mx-auto p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This is your own professional profile — you cannot book yourself. Manage your work from the vendor dashboard.
              </span>
            </div>
          )}
          {/* STEPPER PROGRESS HEADER */}
          {currentStep < 5 && (
            <div className="mb-8 max-w-2xl mx-auto">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 1, label: "1. Address" },
                  { step: 2, label: "2. Slot" },
                  { step: 3, label: "3. Review" },
                  { step: 4, label: "4. Pay" },
                ].map((s) => (
                  <div key={s.step} className="flex flex-col gap-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        currentStep >= s.step ? "bg-primary-500" : "bg-dark-200"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold text-center truncate ${
                        currentStep === s.step ? "text-primary-600 font-bold" : "text-dark-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TWO COLUMN WORKFLOW LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Main Booking Form Column */}
            <div className="lg:col-span-2">
              <div className="bg-surface rounded-2xl border border-border p-6 sm:p-8 shadow-card space-y-6">
                {/* STEP 1: SERVICE LOCATION & CONTACT (ADDRESS) */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-heading text-xl font-bold text-dark-900">
                        Step 1: Service Location & Contact
                      </h2>
                      <p className="text-xs text-dark-500 mt-1">
                        Where should {pro.name} arrive or deliver this service?
                      </p>
                    </div>

                    {/* Selected Service Package (Option to switch if multiple available) */}
                    {pro.services?.length > 1 ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-dark-700">
                          Selected Service Package (Click to switch)
                        </label>
                        <div className="grid grid-cols-1 gap-2.5">
                          {pro.services.map((srv) => {
                            const isSelected = selectedService?.id === srv.id;
                            return (
                              <div
                                key={srv.id}
                                onClick={() => setSelectedService(srv)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-xs ${
                                  isSelected
                                    ? "border-primary-500 bg-primary-50/40 ring-1 ring-primary-500/20"
                                    : "border-border hover:bg-dark-50"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-primary-600 bg-primary-600" : "border-dark-300"}`}>
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-dark-900 block">{srv.title}</span>
                                    <span className="text-[11px] text-dark-400">Duration: {srv.duration}</span>
                                  </div>
                                </div>
                                <span className="font-bold text-dark-900">{formatMoney(srv.price)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : selectedService ? (
                      <div className="p-3.5 bg-dark-50 rounded-xl border border-border flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-dark-900">{selectedService.title}</span>
                          <span className="text-[11px] text-dark-500 block">Duration: {selectedService.duration}</span>
                        </div>
                        <span className="font-bold text-primary-600">{formatMoney(selectedService.price)}</span>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Contact Full Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type="text"
                            required
                            value={addressDetails.name}
                            onChange={(e) =>
                              setAddressDetails({ ...addressDetails, name: e.target.value })
                            }
                            className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Phone Number (for SMS & Intercom) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type="tel"
                            required
                            value={addressDetails.phone}
                            onChange={(e) =>
                              setAddressDetails({ ...addressDetails, phone: e.target.value })
                            }
                            className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Street Address & Apartment / Unit <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type="text"
                            required
                            value={addressDetails.street}
                            placeholder="e.g. 123 Main Street, Appt 4B"
                            onChange={(e) =>
                              setAddressDetails({ ...addressDetails, street: e.target.value })
                            }
                            className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                          />
                        </div>
                      </div>

                      <div>
                        <PincodeInput
                          value={addressDetails.postalCode}
                          onChange={(val) => {
                            setAddressDetails((prev) => ({
                              ...prev,
                              postalCode: val,
                              city: val.length < 6 ? "" : prev.city,
                              state: val.length < 6 ? "" : prev.state,
                            }));
                            if (val.length < 6) setPincodeVerification(null);
                          }}
                          onVerified={(res) => setPincodeVerification(res)}
                          onCityDetected={(detectedCity, res) => {
                            setAddressDetails((prev) => ({
                              ...prev,
                              city: detectedCity,
                              state: res?.state || prev.state || "",
                            }));
                          }}
                          enforceLocationMatch={false}
                          label="Pincode"
                          placeholder="e.g. 501218"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          City & State
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={
                              addressDetails.city
                                ? `${addressDetails.city}${addressDetails.state ? `, ${addressDetails.state}` : ""}`
                                : ""
                            }
                            placeholder="Auto-filled from 6-digit Pincode"
                            className="w-full pl-3 pr-8 py-2.5 bg-dark-100 border border-border rounded-xl text-xs text-dark-900 cursor-not-allowed font-medium"
                          />
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dark-400" />
                        </div>
                        <p className="text-[10px] text-dark-400 mt-1">
                          City and state are verified and locked to your postal code.
                        </p>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Special Instructions / Notes for Professional
                        </label>
                        <textarea
                          rows={3}
                          value={addressDetails.notes}
                          onChange={(e) =>
                            setAddressDetails({ ...addressDetails, notes: e.target.value })
                          }
                          placeholder="E.g. Building entrance code, parking info, specific symptoms or problem details..."
                          className="w-full p-3 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: SELECT DATE & TIME SLOT (SLOT) */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-heading text-xl font-bold text-dark-900">
                        Step 2: Choose Date & Time Slot
                      </h2>
                      <p className="text-xs text-dark-500 mt-1">
                        Select a date and available appointment slot synced with {pro.name}'s calendar.
                      </p>
                    </div>

                    {/* 7 Days Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-2">
                        Select Appointment Date
                      </label>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {nextDays.map((d) => {
                          const isSelected = selectedDate === d.date;
                          const isAvailable = isDayAvailable(d.date);
                          return (
                            <button
                              key={d.date}
                              type="button"
                              disabled={!isAvailable}
                              onClick={() => isAvailable && setSelectedDate(d.date)}
                              title={!isAvailable ? `${d.day} is closed` : `Select ${d.day}, ${d.date}`}
                              className={`p-3 rounded-xl border text-center transition-all ${
                                !isAvailable
                                  ? "bg-dark-50/70 border-dashed border-border/80 text-dark-400 opacity-60 cursor-not-allowed"
                                  : isSelected
                                  ? "bg-primary-500 text-white border-primary-500 shadow-button"
                                  : "bg-surface border-border text-dark-700 hover:bg-dark-50 hover:border-primary-200"
                              }`}
                            >
                              <span className="block text-[10px] font-medium uppercase opacity-80">
                                {d.day}
                              </span>
                              <span className="block font-heading text-lg font-bold my-0.5">
                                {d.num}
                              </span>
                              <span
                                className={`block text-[10px] truncate ${
                                  !isAvailable ? "font-bold text-red-500" : "opacity-75"
                                }`}
                              >
                                {isAvailable ? d.label : "Closed"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time Slots Grid */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-dark-700">
                          Select Available Time (IST, UTC+5:30)
                        </label>
                        <span className="text-[11px] text-dark-500 font-medium">
                          Note: Last bookable slot is 2 hours before closing
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {isLoadingSlots ? (
                          <div className="col-span-full flex items-center justify-center py-4 text-xs text-dark-400">
                            <div className="h-4 w-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-2" />
                            Checking availability…
                          </div>
                        ) : availableSlots.length === 0 ? (
                          <div className="col-span-full p-4 text-center text-xs text-dark-500 bg-dark-50 border border-dashed border-border rounded-xl">
                            {matchedPro?.availability?.slots?.length
                              ? "No slots available for this date. Please pick another day."
                              : "This professional hasn't published their working hours yet. Please check back later or pick another professional."}
                          </div>
                        ) : (
                          availableSlots.map((time) => {
                            const isSelected = selectedTimeSlot === time;
                            return (
                              <button
                                key={time}
                                type="button"
                                onClick={() => setSelectedTimeSlot(time)}
                                className={`py-3 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                                  isSelected
                                    ? "bg-primary-50 border-primary-500 text-primary-700 ring-2 ring-primary-500/20 shadow-xs"
                                    : "bg-surface border-border text-dark-800 hover:bg-dark-50"
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5 text-primary-500" />
                                <span>{time}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Instant Confirmation Guarantee: Your time slot is reserved immediately upon booking.
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 3: REVIEW BOOKING, PRICE & CANCELLATION RULE */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-heading text-xl font-bold text-dark-900">
                        Step 3: Review Booking & Cancellation Policy
                      </h2>
                      <p className="text-xs text-dark-500 mt-1">
                        Please review your appointment summary, pricing, and cancellation policy before proceeding to pay.
                      </p>
                    </div>

                    {/* Order Details Summary Box */}
                    <div className="bg-dark-50 p-5 rounded-2xl border border-border space-y-3.5 text-xs">
                      <div className="flex justify-between border-b border-border pb-2.5">
                        <span className="text-dark-500">Professional:</span>
                        <span className="font-bold text-dark-900">{pro.name} ({pro.role})</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2.5">
                        <span className="text-dark-500">Service Package:</span>
                        <span className="font-semibold text-dark-900">{selectedService?.title || pro.role}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2.5">
                        <span className="text-dark-500">Appointment Slot:</span>
                        <span className="font-semibold text-primary-600">
                          {formatConfirmationDateTime(selectedDate, selectedTimeSlot)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2.5">
                        <span className="text-dark-500">Service Address:</span>
                        <span className="font-medium text-dark-900 max-w-xs text-right">
                          {addressDetails.street}, {addressDetails.city} {addressDetails.postalCode}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2.5">
                        <span className="text-dark-500">Customer:</span>
                        <span className="font-medium text-dark-900">
                          {addressDetails.name} • {addressDetails.phone}
                        </span>
                      </div>

                      {/* Pricing Breakdown */}
                      <div className="pt-2 space-y-1.5">
                        <div className="flex justify-between text-dark-600">
                          <span>Service Rate</span>
                          <span className="font-semibold text-dark-900">{formatMoney(servicePrice)}</span>
                        </div>
                        <div className="flex justify-between text-dark-600">
                          <span>Platform & Payment Protection</span>
                          <span className="text-emerald-600 font-semibold">FREE</span>
                        </div>
                        <div className="flex justify-between text-dark-600">
                          <span>Applicable Taxes</span>
                          <span>Included</span>
                        </div>
                        <div className="flex justify-between text-base font-bold text-dark-900 pt-2 border-t border-border">
                          <span>Total Payable Amount</span>
                          <span className="font-heading text-xl text-primary-600">{formatMoney(totalAmount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 24-HOUR CANCELLATION POLICY BOX */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>24-Hour Cancellation Policy</span>
                      </div>
                      <p className="leading-relaxed">
                        You can cancel your appointment for a <strong>100% full refund</strong> up to <strong>24 hours</strong> prior to the scheduled slot time. Inside 24 hours of the appointment, contact our support team; requests in this window are reviewed case by case and are not automatically refunded.
                      </p>
                    </div>
                  </div>
                )}

                {/* STEP 4: SECURE PAYMENT GATEWAY (PAY) */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-heading text-xl font-bold text-dark-900">
                        Step 4: Secure Payment
                      </h2>
                      <p className="text-xs text-dark-500 mt-1">
                        Your payment is held by BookMyProfessional and released only after service fulfillment.
                      </p>
                    </div>

                    {/* Total Price Banner on Payment Step */}
                    <div className="p-4 bg-primary-50/50 rounded-xl border border-primary-200 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-dark-600 block">Total Price Payable</span>
                        <span className="text-xs text-dark-400">Includes all fees & taxes</span>
                      </div>
                      <span className="font-heading text-2xl font-bold text-primary-600">
                        {formatMoney(totalAmount)}
                      </span>
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-2">
                        Select Payment Method
                      </label>
                      <div className="grid grid-cols-1 gap-2.5 mb-4">
                        <div
                          className={`py-4 px-4 rounded-xl border text-sm font-semibold transition-all text-center flex items-center justify-center gap-2 bg-primary-50 border-primary-500 text-primary-700 ring-2 ring-primary-500/20 shadow-xs`}
                        >
                          <CreditCard className="w-5 h-5" />
                          <span>Pay Securely with PayU</span>
                        </div>
                      </div>
                    </div>

                    {/* Cancellation Policy Banner */}
                    <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-amber-950">24-Hour Cancellation & Refund Policy</span>
                        <span>Free cancellation up to 24 hours before your scheduled appointment slot. Cancellations within 24 hours are reviewed case by case by our support team and are not automatically refunded.</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-dark-500 font-medium">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>256-bit SSL encrypted • Secure payments via PayU</span>
                    </div>

                    {paymentError && (
                      <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{paymentError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 5: BOOKING CONFIRMATION */}
                {currentStep === 5 && confirmedBookingData && (
                  <div className="text-center py-6 space-y-5 animate-in zoom-in-95">
                    <div className="mx-auto w-18 h-18 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-soft">
                      <CheckCircle2 className="w-12 h-12" />
                    </div>

                    <div>
                      <span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-3.5 py-1 rounded-full mb-2 border border-emerald-200">
                        Booking Confirmed #{confirmedBookingData.id}
                      </span>
                      <h2 className="font-heading text-2xl font-bold text-dark-900">
                        Appointment Successfully Scheduled!
                      </h2>
                      <p className="text-xs sm:text-sm text-dark-600 max-w-md mx-auto mt-1">
                        We've sent your appointment confirmation to{" "}
                        <strong className="text-dark-900">{confirmedBookingData.customerEmail}</strong>.
                      </p>
                    </div>

                    {/* Summary Details Box */}
                    <div className="bg-dark-50 p-5 rounded-2xl border border-border text-left space-y-2.5 text-xs max-w-lg mx-auto">
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-dark-500">Professional:</span>
                        <span className="font-bold text-dark-900">{confirmedBookingData.proName}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-dark-500">Service:</span>
                        <span className="font-semibold text-dark-900">
                          {confirmedBookingData.serviceTitle}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-dark-500">Date & Time:</span>
                        <span className="font-semibold text-primary-600 text-right">
                          {formatConfirmationDateTime(confirmedBookingData.date, confirmedBookingData.timeSlot)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-dark-500">Service Location:</span>
                        <span className="font-semibold text-dark-900 truncate max-w-[240px]">
                          {confirmedBookingData.address}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-dark-500">Total Paid:</span>
                        <span className="font-bold text-dark-900">
                          {formatMoney(confirmedBookingData.totalPaid)} (via {confirmedBookingData.paymentMethod})
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 max-w-md mx-auto">
                      <Link
                        href="/dashboard"
                        className="w-full sm:w-auto flex-1 py-3 px-6 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs shadow-button text-center transition-colors"
                      >
                        View in My Bookings
                      </Link>
                      <Link
                        href="/professionals"
                        className="w-full sm:w-auto flex-1 py-3 px-6 rounded-xl border border-border bg-surface hover:bg-dark-50 text-dark-700 font-semibold text-xs text-center transition-colors"
                      >
                        Browse Other Experts
                      </Link>
                    </div>
                  </div>
                )}

                {/* Bottom Step Actions */}
                {currentStep < 5 && (
                  <div className="pt-6 border-t border-border flex items-center justify-between gap-3">
                    {currentStep > 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(currentStep - 1)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-dark-700 hover:text-dark-900 py-2.5 px-4 rounded-xl border border-border hover:bg-dark-50 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Previous Step</span>
                      </button>
                    ) : (
                      <Link
                        href={`/professionals/${pro.id}`}
                        className="text-xs text-dark-500 hover:text-primary-600 font-medium"
                      >
                        ← Back to Profile
                      </Link>
                    )}

                    {currentStep < 4 ? (
                      <Button
                        variant="primary"
                        size="md"
                        disabled={
                          (currentStep === 1 &&
                            (!addressDetails.name.trim() ||
                              !addressDetails.phone.trim() ||
                              !addressDetails.street.trim() ||
                              !addressDetails.city.trim() ||
                              !addressDetails.postalCode.trim() ||
                              !pincodeVerification?.valid)) ||
                          (currentStep === 2 && !selectedTimeSlot)
                        }
                        onClick={() => setCurrentStep(currentStep + 1)}
                        className="text-xs font-semibold py-3 px-6 shadow-button"
                      >
                        <span>{currentStep === 3 ? "Proceed to Payment" : "Next Step"}</span>
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        disabled={isPaymentDisabled}
                        onClick={handlePayAndConfirm}
                        className="text-xs font-semibold py-3 px-7 shadow-button"
                      >
                        {isProcessingPayment ? (
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Securing Payment...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Lock className="w-4 h-4" />
                            <span>Pay {formatMoney(totalAmount)} & Confirm</span>
                          </div>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Sticky Summary Sidebar */}
            <div className="lg:col-span-1 space-y-5">
              <div className="bg-surface rounded-2xl border border-border p-6 shadow-card sticky top-24 space-y-4">
                <h3 className="font-heading text-sm font-bold text-dark-900 border-b border-border pb-3">
                  Appointment Summary
                </h3>

                {/* Pro Avatar & Specialty */}
                <div className="flex items-center gap-3">
                  {pro.image ? (
                    <img
                      src={ikImage(pro.image)}
                      alt={pro.name}
                      className="w-12 h-12 rounded-xl object-cover border border-border bg-dark-100 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl border border-border bg-dark-100 flex items-center justify-center font-heading font-bold text-lg text-dark-400 shrink-0">
                      {pro.name?.charAt(0) || "P"}
                    </div>
                  )}
                  <div>
                    <h4 className="font-heading text-sm font-bold text-dark-900">{pro.name}</h4>
                    <p className="text-xs text-primary-600 font-medium">{pro.role}</p>
                    <span className="text-[11px] text-dark-400">{pro.location}</span>
                  </div>
                </div>

                {/* Selected Details */}
                <div className="p-3.5 bg-dark-50 rounded-xl space-y-2 text-xs border border-border">
                  <div className="flex justify-between">
                    <span className="text-dark-500">Service:</span>
                    <span className="font-semibold text-dark-900 truncate max-w-[150px]">
                      {selectedService?.title || pro.role}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500">Date:</span>
                    <span className="font-semibold text-dark-900">{selectedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500">Time:</span>
                    <span className="font-semibold text-primary-600">{selectedTimeSlot}</span>
                  </div>
                </div>

                {/* What's included in the selected price */}
                {((selectedService?.inclusions?.length || 0) > 0 || (selectedService?.exclusions?.length || 0) > 0) && (
                  <div className="p-3.5 bg-dark-50 rounded-xl border border-border text-[11px] text-dark-700 space-y-1">
                    {(selectedService?.inclusions?.length || 0) > 0 && (
                      <>
                        <span className="font-semibold text-dark-900">What&apos;s included</span>
                        <ul className="space-y-0.5">
                          {selectedService.inclusions.map((line) => (
                            <li key={line}>✓ {line}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {(selectedService?.exclusions?.length || 0) > 0 && (
                      <p className="text-amber-700">
                        Extra charges: {selectedService.exclusions.join(" • ")}
                      </p>
                    )}
                  </div>
                )}

                {/* Price Breakdown */}
                <div className="space-y-2 pt-2 border-t border-border text-xs">
                  <div className="flex justify-between text-dark-600">
                    <span>Service Fee</span>
                    <span className="font-semibold text-dark-900">{formatMoney(servicePrice)}</span>
                  </div>
                  <div className="flex justify-between text-dark-600">
                    <span>Platform Fee</span>
                    <span className="text-emerald-600 font-semibold">FREE</span>
                  </div>
                  <div className="flex justify-between text-dark-600">
                    <span>Taxes</span>
                    <span>Included</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-dark-900 pt-2 border-t border-border">
                    <span>Total Amount</span>
                    <span className="font-heading text-lg text-primary-600">{formatMoney(totalAmount)}</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 leading-relaxed">
                  ✓ Payment protection. Money is held by BookMyProfessional until the work is completed.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BookingPage({ params }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-dark-500 text-sm">
          Loading booking workflow...
        </div>
      }
    >
      <BookingPageContent params={params} />
    </Suspense>
  );
}
