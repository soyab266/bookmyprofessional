"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAuth } from "@/context/AuthContext";
import { getNotificationPrefs, updateNotificationPrefs } from "@/lib/data/notifications";
import { getProfile, updateProfile } from "@/lib/data/profiles";
import {
  Calendar,
  Clock,
  MapPin,
  FileText,
  User,
  CreditCard,
  Star,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Phone,
  Mail,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ArrowRight,
  MessageSquare,
  Camera,
  Heart,
  Lock,
} from "lucide-react";
import { uploadImage, ikImage } from "@/lib/imagekit";
import { formatMoney } from "@/lib/money";
import { nextBookingDates, getAvailableSlots, rescheduleBooking } from "@/lib/data/bookings";
import { getDerivedBookingStatus, isBookingExpired } from "@/lib/datetime";
import { getBookingPaymentLabel } from "@/lib/booking-payment-label";
import { cleanPincode, isValidPincodeFormat } from "@/lib/pincode";
import { cleanPhone, isValidIndianPhone } from "@/lib/phone";
import PincodeInput from "@/components/PincodeInput";
import WhatsAppConsentSettings from "@/components/WhatsAppConsentSettings";
import { listMyWishlist, removeWish } from "@/lib/data/wishlist";

export default function CustomerDashboardPage() {
  const {
    bookings,
    cancelBooking,
    addBooking,
    customerProfile,
    setCustomerProfile,
    professionals: marketplacePros,
  } = useMarketplace();
  const { showToast, user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'professional') {
        router.replace('/vendor');
        return;
      }
      // Onboarding enforcement (owner decision, 20 Nov 2026): a customer who
      // has not completed onboarding (required number + required agreement)
      // is sent to finish it before using the dashboard. Accounts completed
      // once - including legacy accounts backfilled by the release migration
      // - are never sent back, and consent withdrawal never re-gates.
      // Client-side gate on the destination; direct API calls and other
      // pages are not covered by this guard.
      const hasValidPhone = cleanPhone(user.phone || "").length === 10;
      const onboardingDone =
        Boolean(user.onboarding_completed_at) || (hasValidPhone && user.whatsapp_consent);
      if (!onboardingDone) {
        router.replace("/complete-profile?next=/dashboard");
      }
    }
  }, [isLoading, user, router]);

  const [activeTab, setActiveTab] = useState("bookings"); // "bookings" | "profile" | "invoices" | "wishlist"
  const [bookingFilter, setBookingFilter] = useState("all"); // "all" | "upcoming" | "in_progress" | "completed" | "cancelled"
  const [profileForm, setProfileForm] = useState(customerProfile);
  const [prefs, setPrefs] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [savedProIds, setSavedProIds] = useState([]);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const rescheduleRequestRef = React.useRef(0);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      showToast("Please sign in to update your profile photo.", "error");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const url = await uploadImage(file);
      await updateProfile(user.id, { avatar_url: url });
      
      setCustomerProfile(prev => ({ ...prev, avatar_url: url }));
      setProfileForm(prev => ({ ...prev, avatar_url: url }));
      
      showToast("Profile photo updated.", "success");
    } catch (err) {
      showToast(err?.message || "Photo upload failed. Please try again.", "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("customerActiveTab");
    if (saved) {
      setActiveTab(saved);
    }

    let active = true;
    listMyWishlist().then((ids) => {
      if (active) setSavedProIds(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("customerActiveTab", tabId);
    }
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    setProfileForm(customerProfile);
  }, [customerProfile]);

  // Load the real profile row for signed-in (non-demo) users so edits round-trip to Supabase.
  useEffect(() => {
    if (!user) return;
    
    const meta = user.user_metadata || {};
    // Immediately set base values from user metadata
    setCustomerProfile((prev) => ({
      ...prev,
      name: prev.name || meta.full_name || meta.name || user.name || "",
      email: prev.email || user.email || "",
      phone: prev.phone || meta.phone || "",
      city: prev.city || meta.city || "",
      pincode: prev.pincode || meta.pincode || "",
    }));

    if (user.demo || !user.id) return;

    let active = true;
    getProfile(user.id).then((p) => {
      if (!active || !p) return;
      setCustomerProfile((prev) => ({
        ...prev,
        name: p.full_name || prev.name,
        email: p.email || prev.email,
        phone: p.phone || prev.phone,
        city: p.city || prev.city,
        pincode: p.pincode || prev.pincode,
        address: p.address || prev.address,
        avatar_url: p.avatar_url || prev.avatar_url,
      }));
    });
    return () => {
      active = false;
    };
  }, [user, setCustomerProfile]);

  useEffect(() => {
    getNotificationPrefs().then(setPrefs);
  }, []);

  const handlePrefToggle = async (key) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const saved = await updateNotificationPrefs({ [key]: next[key] });
    if (saved) {
      setPrefs(saved);
      showToast("Notification preferences updated.", "success");
    } else {
      showToast("Unable to save preferences right now.", "error");
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();

    const cleanNum = cleanPhone(profileForm.phone);
    if (!cleanNum) {
      showToast("Phone number is required. Please enter your 10-digit mobile number.", "error");
      return;
    }
    if (!isValidIndianPhone(cleanNum)) {
      showToast("Please enter a valid 10-digit Indian mobile number (must start with 6, 7, 8, or 9).", "error");
      return;
    }

    if (profileForm.pincode) {
      const cleanPin = cleanPincode(profileForm.pincode);
      if (!isValidPincodeFormat(cleanPin)) {
        showToast("Please enter a valid 6-digit Indian pincode (cannot start with 0).", "error");
        return;
      }
    }

    // Persist to Supabase for real sessions; demo mode keeps the local-only mock.
    if (user?.id && !user.demo) {
      try {
        await updateProfile(user.id, {
          full_name: profileForm.name,
          email: profileForm.email,
          phone: cleanNum,
          city: profileForm.city,
          pincode: cleanPincode(profileForm.pincode),
          address: profileForm.address,
        });
      } catch (err) {
        showToast(err?.message || "Could not save your profile right now.", "error");
        return;
      }
    }

    setCustomerProfile({ ...profileForm, phone: cleanNum });
    setProfileForm((prev) => ({ ...prev, phone: cleanNum }));
    showToast("Profile details updated successfully!", "success");
  };

  const filteredBookings = bookings.filter((b) => {
    const derived = getDerivedBookingStatus(b);
    if (bookingFilter === "all") return true;
    if (bookingFilter === "payment_pending") return derived === "upcoming" && b.paymentStatus !== "paid";
    if (bookingFilter === "upcoming") return derived === "upcoming" && b.paymentStatus === "paid";
    return b.status === bookingFilter;
  });

  const getStatusBadge = (status, b) => {
    const derived = getDerivedBookingStatus(b);
    switch (derived) {
      case "missed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
            <AlertCircle className="w-3 h-3" /> Missed — Needs Action
          </span>
        );
      case "upcoming":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3" /> Upcoming
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3 h-3 animate-spin" /> In Progress
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case "cancelled": {
        const isRefunded = b?.paymentStatus === "refunded";
        const isRefundFailed = b?.paymentStatus === "refund_failed";
        const isRefundPending =
          !isRefundFailed &&
          (b?.paymentStatus === "refund_pending" ||
            (Number(b?.totalPaid) > 0 && b?.paymentStatus !== "refunded" && b?.paymentStatus !== "unpaid"));

        if (isRefunded) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" /> Cancelled & Refunded
            </span>
          );
        }
        if (isRefundFailed) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300">
              <AlertCircle className="w-3 h-3" /> Cancelled • Refund Failed
            </span>
          );
        }
        if (isRefundPending) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
              <RotateCcw className="w-3 h-3 animate-spin" /> Cancelled • Refund Pending
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      }
      default:
        return null;
    }
  };

  const getCancellationEligibility = (b) => {
    if (!b || b.status !== "upcoming") return { canCancel: false, reason: "" };
    // Expired bookings cannot be cancelled via normal flow
    if (isBookingExpired(b)) return { canCancel: false, reason: "Appointment has expired. Contact support." };

    let startMs = null;
    if (b.startsAt) {
      const d = new Date(b.startsAt);
      if (!isNaN(d.getTime())) startMs = d.getTime();
    }
    if (!startMs && b.date && b.timeSlot) {
      const [year, month, day] = b.date.split("-").map(Number);
      const m = String(b.timeSlot).match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (m) {
        let h = Number(m[1]);
        const min = Number(m[2]);
        const pm = (m[3] || "").toUpperCase() === "PM";
        const am = (m[3] || "").toUpperCase() === "AM";
        if (pm && h < 12) h += 12;
        if (am && h === 12) h = 0;
        // UTC epoch for IST (+05:30)
        startMs = Date.UTC(year, month - 1, day, h - 5, min - 30);
      }
    }

    if (!startMs) return { canCancel: true, reason: "" };

    const hoursRemaining = (startMs - Date.now()) / (1000 * 60 * 60);
    if (hoursRemaining < 24) {
      return {
        canCancel: false,
        reason:
          hoursRemaining <= 0
            ? "Appointment time has arrived"
            : `Within 24-hour window (cannot cancel within 24h of appointment)`,
        hoursRemaining: Math.max(0, Math.round(hoursRemaining)),
      };
    }

    return { canCancel: true, reason: "" };
  };

  const handleCancel = async (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking) {
      const { canCancel, reason } = getCancellationEligibility(booking);
      if (!canCancel) {
        showToast(reason || "Cannot cancel within 24 hours of appointment.", "info");
        return;
      }
    }
    try {
      await cancelBooking(bookingId);
    } catch (err) {
      showToast(err?.message || "Unable to cancel this booking.", "error");
    }
  };

  const rescheduleDates = nextBookingDates(14);

  const isRescheduleDayAvailable = (dateStr) => {
    if (!rescheduleTarget?.proId) return true;
    const pro = marketplacePros?.find((p) => p.id === rescheduleTarget.proId);
    const avail = pro?.availability;
    const days = Array.isArray(avail?.days) ? avail.days : [];
    if (days.length === 0) return true;
    const weekday = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    return days.some((d) => String(d).toLowerCase() === weekday.toLowerCase());
  };

  const openReschedule = (booking) => {
    setRescheduleTarget(booking);
    setRescheduleDate("");
    setRescheduleSlot("");
    setRescheduleSlots([]);
  };

  const closeReschedule = () => {
    setRescheduleTarget(null);
  };

  const handleRescheduleDate = async (date) => {
    setRescheduleDate(date);
    setRescheduleSlot("");
    setRescheduleSlots([]);
    setIsLoadingRescheduleSlots(true);
    const requestId = ++rescheduleRequestRef.current;
    const pro = marketplacePros?.find((p) => p.id === rescheduleTarget?.proId);
    const slots = await getAvailableSlots(rescheduleTarget.proId, date, pro?.availability);
    if (requestId !== rescheduleRequestRef.current) return;
    setRescheduleSlots(slots);
    setIsLoadingRescheduleSlots(false);
  };

  const handleRescheduleConfirm = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) return;
    setIsRescheduling(true);
    try {
      const updated = await rescheduleBooking(rescheduleTarget.id, {
        date: rescheduleDate,
        timeSlot: rescheduleSlot,
      });
      addBooking(updated);
      showToast("Booking rescheduled", "success");
      setRescheduleTarget(null);
    } catch (err) {
      showToast(err?.message || "Could not reschedule", "error");
    } finally {
      setIsRescheduling(false);
    }
  };

  // Prefer the real UTC instant when present; fall back to the display date + slot.
  const formatWhen = (b) => {
    if (b.startsAt) {
      const d = new Date(b.startsAt);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      }
    }
    return `${b.date} at ${b.timeSlot}`;
  };

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
            <span className="text-dark-900 font-semibold">Customer Dashboard</span>
          </div>
        </div>
      </div>

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          {/* HEADER HERO */}
          <div className="bg-surface rounded-2xl border border-border p-6 sm:p-8 shadow-card mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary-500 text-white flex items-center justify-center font-bold font-heading text-2xl shadow-soft overflow-hidden shrink-0">
                  {customerProfile.avatar_url?.trim() ? (
                    <img src={ikImage(customerProfile.avatar_url)} alt="Profile" className="w-full h-full object-cover" />
                  ) : customerProfile.name ? customerProfile.name.charAt(0).toUpperCase() : "A"}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-heading text-xl sm:text-2xl font-bold text-dark-900">
                      {customerProfile.name}
                    </h1>
                    <span className="text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded-full border border-primary-200">
                      Verified Member
                    </span>
                  </div>
                  <p className="text-xs text-dark-500 mt-0.5">
                    {customerProfile.email} • {customerProfile.phone}
                  </p>
                </div>
              </div>

              <Link
                href="/professionals"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs shadow-button transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span>Book a New Service</span>
              </Link>
            </div>
          </div>

          {/* DASHBOARD TABS AND CONTENT */}
          <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex border-b border-border px-6 bg-dark-50/50 gap-6 overflow-x-auto no-scrollbar">
              {[
                { id: "bookings", label: `My Bookings (${bookings.length})`, icon: Calendar },
                { id: "wishlist", label: "My Wishlist", icon: Heart },
                { id: "profile", label: "My Profile & Address", icon: User },
                { id: "invoices", label: "Invoices & Receipts", icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`py-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 -mb-px transition-all whitespace-nowrap ${
                      isActive
                        ? "border-primary-500 text-primary-600"
                        : "border-transparent text-dark-500 hover:text-dark-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENTS */}
            <div className="p-6 sm:p-8">
              {/* TAB 1: MY BOOKINGS */}
              {activeTab === "bookings" && (
                <div className="space-y-6">
                  {/* Status Filters */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
                    {[
                      { id: "all", label: "All Bookings" },
                      { id: "upcoming", label: "Upcoming" },
                      { id: "payment_pending", label: "Payment Pending" },
                      { id: "in_progress", label: "In Progress" },
                      { id: "completed", label: "Completed" },
                      { id: "cancelled", label: "Cancelled" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setBookingFilter(f.id)}
                        className={`px-4 py-2 rounded-xl border transition-all ${
                          bookingFilter === f.id
                            ? "bg-primary-500 text-white border-primary-500 shadow-xs"
                            : "bg-surface border-border text-dark-600 hover:bg-dark-50"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {filteredBookings.length === 0 ? (
                    <div className="p-12 text-center bg-dark-50 rounded-2xl border border-dashed border-border">
                      <Calendar className="w-12 h-12 text-dark-400 mx-auto mb-3" />
                      <h3 className="font-heading text-base font-bold text-dark-900">
                        No Bookings Found
                      </h3>
                      <p className="text-xs text-dark-500 mt-1 max-w-sm mx-auto">
                        You don't have any appointments in this status category.
                      </p>
                      <Link
                        href="/professionals"
                        className="inline-flex items-center justify-center mt-4 px-5 py-2.5 rounded-xl bg-primary-500 text-white text-xs font-semibold shadow-button"
                      >
                        Explore Verified Professionals
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredBookings.map((b) => (
                        <div
                          key={b.id}
                          className={`p-5 sm:p-6 rounded-2xl border transition-all space-y-4 shadow-xs ${
                            b.status === "cancelled"
                              ? "bg-dark-50/50 border-border opacity-75 grayscale-[0.2]"
                              : "bg-surface border-border hover:border-primary-200"
                          }`}
                        >
                          {/* Top Row: Ref ID + Status */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-xs font-bold text-dark-900 bg-dark-50 px-2 py-0.5 rounded">
                                #{b.id}
                              </span>
                              <span className="text-dark-300">•</span>
                              <span className="text-xs text-dark-500" suppressHydrationWarning>
                                Booked on {new Date(b.createdAt).toLocaleDateString("en-IN")}
                              </span>
                            </div>
                            <div>{getStatusBadge(b.status, b)}</div>
                          </div>

                          {/* Middle Row: Pro Info + Date + Location */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              {b.proAvatar?.trim() ? (
                                <img
                                  src={ikImage(b.proAvatar)}
                                  alt={b.proName}
                                  className="w-14 h-14 rounded-2xl object-cover border border-border bg-dark-100 shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg border border-border shrink-0">
                                  {b.proName?.charAt(0) || "P"}
                                </div>
                              )}
                              <div>
                                <h3 className="font-heading text-base font-bold text-dark-900">
                                  {b.proName}
                                </h3>
                                <p className="text-xs text-primary-600 font-semibold mt-0.5">
                                  {b.serviceTitle}
                                </p>
                                <div className="flex flex-wrap items-center gap-4 text-xs text-dark-500 mt-1.5">
                                  <span className="flex items-center gap-1 font-semibold text-dark-900">
                                    <Calendar className="w-3.5 h-3.5 text-primary-500" />
                                    {formatWhen(b)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-dark-400" />
                                    {b.address}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Price Box */}
                            <div className="text-left md:text-right shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                              <span className="text-[11px] text-dark-400 block uppercase font-semibold">
                                Total Amount
                              </span>
                              <span className={`text-xl font-bold font-heading ${b.status === 'cancelled' ? 'text-dark-400 line-through' : 'text-dark-900'}`}>
                                {formatMoney(b.totalPaid)}
                              </span>
                              <span className={`block text-[11px] font-medium mt-0.5 ${b.status === 'cancelled' ? (b.paymentStatus === 'refunded' ? 'text-emerald-600' : 'text-amber-600') : (b.paymentStatus === 'unpaid' ? 'text-amber-600' : 'text-emerald-600')}`}>
                                {getBookingPaymentLabel(b)}
                              </span>
                            </div>
                          </div>

                          {/* Bottom Row: Notes & Actions */}
                          <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-dark-500">
                              Instructions:{" "}
                              <span className="text-dark-700 italic">{b.customerNotes}</span>
                            </div>

                            <div className="flex items-center gap-2.5">
                              {getDerivedBookingStatus(b) === "upcoming" && (() => {
                                const { canCancel, reason } = getCancellationEligibility(b);
                                if (canCancel) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleCancel(b.id)}
                                      className="py-2 px-3.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors shadow-xs"
                                    >
                                      Cancel Booking
                                    </button>
                                  );
                                }
                                return (
                                  <div className="flex flex-col items-end gap-1">
                                    <button
                                      type="button"
                                      disabled
                                      className="py-2 px-3.5 rounded-xl border border-dark-200 bg-dark-100 text-dark-400 text-xs font-semibold cursor-not-allowed opacity-60"
                                      title="Cannot cancel within 24 hours of scheduled appointment"
                                    >
                                      Cancel Booking
                                    </button>
                                    <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-amber-500" />
                                      {reason || "Inside 24h window (cannot cancel)"}
                                    </span>
                                  </div>
                                );
                              })()}

                              {getDerivedBookingStatus(b) === "upcoming" && b.paymentStatus === "paid" && (
                                <button
                                  type="button"
                                  onClick={() => openReschedule(b)}
                                  className="py-2 px-3.5 rounded-xl border border-border text-dark-700 hover:bg-dark-50 text-xs font-semibold transition-colors"
                                >
                                  Reschedule
                                </button>
                              )}

                              {b.status === "completed" && !b.hasReview && (
                                <Link
                                  href={`/review/${b.id}`}
                                  className="inline-flex items-center py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-xs transition-colors"
                                >
                                  <Star className="w-3.5 h-3.5 mr-1.5 fill-white" />
                                  Write Review
                                </Link>
                              )}

                              {b.status === "completed" && b.hasReview && (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl font-medium border border-amber-200">
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  Reviewed ({b.reviewRating}★)
                                </span>
                              )}

                              <Link
                                href={`/messages?booking=${b.id}`}
                                className="py-2 px-3.5 rounded-xl border border-border hover:bg-dark-50 text-dark-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Message</span>
                              </Link>

                              <Link
                                href={`/invoice/${b.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-2 px-3.5 rounded-xl border border-border hover:bg-dark-50 text-dark-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Receipt PDF</span>
                              </Link>

                              <Link
                                href={`/book/${b.proId}`}
                                className="py-2 px-3.5 rounded-xl bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-semibold transition-colors"
                              >
                                Book Again
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: MY PROFILE */}
              {activeTab === "profile" && (
                <>
                <form onSubmit={handleProfileSave} className="space-y-6 max-w-xl">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Personal Contact Details
                    </h3>
                    <p className="text-xs text-dark-500 mt-1">
                      Keep your information current for smooth appointment confirmations.
                    </p>
                  </div>

                  <div className="mb-6 flex items-center gap-5">
                    <div className="relative w-20 h-20 rounded-2xl bg-dark-100 border border-border shadow-soft overflow-hidden shrink-0">
                      {profileForm.avatar_url?.trim() ? (
                        <img src={ikImage(profileForm.avatar_url)} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-dark-400">
                          <User className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-heading text-sm font-bold text-dark-900 mb-2">Profile Photo</h4>
                      <label className={`cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border bg-white hover:bg-dark-50 text-dark-700 text-xs font-semibold shadow-soft transition-colors ${isUploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploadingPhoto ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        {isUploadingPhoto ? "Uploading..." : "Change Photo"}
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="text"
                          required
                          value={profileForm.name}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, name: e.target.value })
                          }
                          className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="email"
                          required
                          value={profileForm.email}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, email: e.target.value })
                          }
                          className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-dark-700">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        {(() => {
                          const digits = cleanPhone(profileForm.phone);
                          if (!digits) return null;
                          if (digits.length === 10 && isValidIndianPhone(digits)) {
                            return <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">✓ Valid 10 digits</span>;
                          }
                          if (digits.length === 10) {
                            return <span className="text-[10px] text-amber-600 font-semibold">Must start with 6-9</span>;
                          }
                          return (
                            <span className="text-[10px] text-amber-600 font-semibold">
                              {digits.length}/10 digits ({10 - digits.length} more)
                            </span>
                          );
                        })()}
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          value={profileForm.phone || ""}
                          placeholder="10-digit mobile number"
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setProfileForm({ ...profileForm, phone: val });
                          }}
                          className={`w-full pl-9 pr-3 py-2.5 bg-dark-50 border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none transition-colors ${
                            !profileForm.phone
                              ? "border-border focus:border-primary-500"
                              : cleanPhone(profileForm.phone).length === 10 && isValidIndianPhone(profileForm.phone)
                              ? "border-emerald-300 focus:border-emerald-500"
                              : "border-amber-300 focus:border-amber-500"
                          }`}
                        />
                      </div>
                      <p className="text-[10px] text-dark-400 mt-1">
                        10-digit Indian mobile number without country code or prefix (e.g. 9699942331)
                      </p>
                    </div>

                    <div>
                      <PincodeInput
                        value={profileForm.pincode || ""}
                        onChange={(val) => {
                          setProfileForm((prev) => ({
                            ...prev,
                            pincode: val,
                            city: val.length < 6 ? "" : prev.city,
                            state: val.length < 6 ? "" : prev.state,
                          }));
                        }}
                        onCityDetected={(detectedCity, res) => {
                          setProfileForm((prev) => ({
                            ...prev,
                            city: detectedCity,
                            state: res?.state || prev.state || "",
                          }));
                        }}
                        enforceLocationMatch={false}
                        label="Pincode"
                        placeholder="e.g. 501218"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        City & State
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={
                            profileForm.city
                              ? `${profileForm.city}${profileForm.state ? `, ${profileForm.state}` : ""}`
                              : ""
                          }
                          placeholder="Auto-filled from Pincode"
                          className="w-full pl-3 pr-8 py-2.5 bg-dark-100 border border-border rounded-xl text-xs text-dark-900 cursor-not-allowed font-medium"
                        />
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dark-400" />
                      </div>
                      <p className="text-[10px] text-dark-400 mt-1">
                        Locked to your verified pincode.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Default Home Address
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="text"
                          value={profileForm.address || ""}
                          placeholder="e.g. 123 Main Street, Appt 4B"
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, address: e.target.value })
                          }
                          className="w-full pl-9 pr-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" variant="primary" size="md" className="font-semibold shadow-button text-xs py-2.5 px-6">
                    Save Profile Changes
                  </Button>
                </form>

                <div className="mt-8 pt-8 border-t border-border max-w-xl space-y-4">
                  <WhatsAppConsentSettings />
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Notification Preferences
                    </h3>
                    <p className="text-xs text-dark-500 mt-1">
                      Choose which updates you want to hear about.
                    </p>
                  </div>

                  {!prefs ? (
                    <p className="text-xs text-dark-400">Loading preferences…</p>
                  ) : (
                    <div className="space-y-2.5">
                      {[
                        {
                          key: "whatsapp",
                          label: "WhatsApp notifications",
                          hint: "Receive booking updates, status changes and alerts directly on WhatsApp.",
                        },
                        {
                          key: "email",
                          label: "Email notifications",
                          hint: "Receive booking confirmations, invoices and reminders via email.",
                        },
                        {
                          key: "bookings",
                          label: "Booking updates",
                          hint: "Confirmations, status changes and cancellations.",
                        },
                        {
                          key: "reviewReplies",
                          label: "Review replies",
                          hint: "When a professional responds to your review.",
                        },
                        {
                          key: "announcements",
                          label: "Announcements",
                          hint: "Platform news and important notices.",
                        },
                      ].map((row) => (
                        <label
                          key={row.key}
                          className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-dark-50/50 cursor-pointer"
                        >
                          <span>
                            <span className="block text-xs font-semibold text-dark-900">
                              {row.label}
                            </span>
                            <span className="block text-[11px] text-dark-500 mt-0.5">
                              {row.hint}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={!!prefs[row.key]}
                            onChange={() => handlePrefToggle(row.key)}
                            className="mt-0.5 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                </>
              )}

              {/* TAB 3: INVOICES */}
              {activeTab === "invoices" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Payment History & Transaction Invoices
                    </h3>
                    <p className="text-xs text-dark-500 mt-1">
                      Download digital receipts for tax filing and personal records.
                    </p>
                  </div>

                  <div className="overflow-x-auto border border-border rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-dark-50 border-b border-border text-dark-700 font-bold">
                        <tr>
                          <th className="p-4">Invoice #</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Professional</th>
                          <th className="p-4">Service</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4">Payment Method</th>
                          <th className="p-4 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {bookings.map((b) => (
                          <tr key={b.id} className="hover:bg-dark-50/50 transition-colors">
                            <td className="p-4 font-mono font-bold text-dark-900">INV-{b.id}</td>
                            <td className="p-4 text-dark-600" suppressHydrationWarning>
                              {new Date(b.createdAt).toLocaleDateString("en-IN")}
                            </td>
                            <td className="p-4 font-semibold text-dark-900">{b.proName}</td>
                            <td className="p-4 text-dark-600 max-w-[160px] truncate">
                              {b.serviceTitle}
                            </td>
                            <td className="p-4 font-bold text-dark-900">{formatMoney(b.totalPaid)}</td>
                            <td className="p-4">
                              <span className="block font-semibold text-dark-900">
                                {b.paymentMethod || "—"}
                              </span>
                              <span
                                className={`inline-block mt-1 text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                                  b.paymentStatus === "paid"
                                    ? "text-emerald-700 bg-emerald-50"
                                    : b.paymentStatus === "refunded"
                                    ? "text-emerald-700 bg-emerald-50"
                                    : b.status === "cancelled" && Number(b.totalPaid) > 0 && b.paymentStatus !== "unpaid"
                                    ? "text-amber-800 bg-amber-50 border border-amber-200"
                                    : "text-amber-700 bg-amber-50"
                                }`}
                              >
                                {b.paymentStatus === "paid"
                                  ? "Paid (Escrow)"
                                  : b.paymentStatus === "refunded"
                                  ? "Refunded"
                                  : b.status === "cancelled" && Number(b.totalPaid) > 0 && b.paymentStatus !== "unpaid"
                                  ? "Refund Pending"
                                  : "Unpaid"}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <Link
                                href={`/invoice/${b.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-bold"
                              >
                                <Download className="w-3.5 h-3.5" /> PDF
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: WISHLIST */}
              {activeTab === "wishlist" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      My Wishlist
                    </h3>
                    <p className="text-xs text-dark-500 mt-1">
                      Professionals you've saved for later.
                    </p>
                  </div>

                  {savedProIds.length === 0 ? (
                    <div className="text-center py-12 px-4 bg-dark-50 rounded-xl border border-dashed border-border">
                      <Heart className="w-8 h-8 text-dark-300 mx-auto mb-3" />
                      <h4 className="text-sm font-bold text-dark-800">Your wishlist is empty</h4>
                      <p className="text-xs text-dark-500 mt-1 max-w-sm mx-auto mb-4">
                        Save professionals you like by clicking the heart icon on their profile.
                      </p>
                      <Link href="/professionals" className="inline-flex items-center justify-center bg-white border border-border shadow-soft rounded-lg px-4 py-2 text-xs font-semibold text-dark-700 hover:text-primary-600 hover:border-primary-200 transition-colors">
                        Browse Professionals
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {savedProIds.map(id => {
                        const pro = marketplacePros?.find(p => p.id === id);
                        if (!pro) return null;
                        return (
                          <div key={pro.id} className="group bg-surface rounded-card border border-border shadow-card hover:shadow-soft hover:border-primary-200 transition-all duration-200 overflow-hidden flex flex-col justify-between">
                            <Link href={`/professionals/${pro.id}`} className="block">
                              <div className="relative aspect-square w-full bg-dark-100 overflow-hidden">
                                {pro.image ? (
                                  <img
                                    src={ikImage(pro.image)}
                                    alt={pro.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-heading font-bold text-3xl text-dark-400">
                                    {pro.name?.charAt(0) || "P"}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    await removeWish(pro.id);
                                    setSavedProIds(prev => prev.filter(pId => pId !== pro.id));
                                    showToast(`${pro.name} removed from wishlist`, "info");
                                  }}
                                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-red-500 hover:bg-white transition-colors shadow-xs"
                                >
                                  <Heart className="w-3.5 h-3.5 fill-red-500" />
                                </button>
                              </div>
                              <div className="p-3.5">
                                <h3 className="font-heading font-bold text-sm text-dark-900 leading-tight truncate group-hover:text-primary-600 transition-colors">
                                  {pro.name}
                                </h3>
                                <p className="text-xs text-dark-600 font-medium mt-0.5">
                                  {pro.role}
                                </p>
                              </div>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {rescheduleTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
          <div
            className="fixed inset-0 bg-dark-900/70 backdrop-blur-sm"
            onClick={closeReschedule}
            aria-hidden="true"
          />

          <div
            className="relative w-full max-w-lg my-auto bg-surface rounded-2xl shadow-2xl border border-border/80 overflow-hidden z-10 p-6 sm:p-7 space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-heading text-lg font-bold text-dark-900">Reschedule Booking</h3>
                <p className="text-xs text-dark-500 mt-1">
                  Booking <span className="font-mono font-bold text-dark-900">#{rescheduleTarget.id}</span> · currently{" "}
                  {formatWhen(rescheduleTarget)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReschedule}
                className="text-dark-400 hover:text-dark-800 text-xl leading-none font-bold"
                aria-label="Close reschedule modal"
              >
                ×
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-dark-700 mb-2">Pick a new date</p>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {rescheduleDates.map((d) => {
                  const isAvailable = isRescheduleDayAvailable(d.date);
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => isAvailable && handleRescheduleDate(d.date)}
                      title={!isAvailable ? `${d.label} is closed` : `Select ${d.label}, ${d.date}`}
                      className={`shrink-0 min-w-[64px] px-3 py-2 rounded-xl border text-center transition-all ${
                        !isAvailable
                          ? "bg-dark-50/70 border-dashed border-border/80 text-dark-400 opacity-60 cursor-not-allowed"
                          : rescheduleDate === d.date
                          ? "bg-primary-500 border-primary-500 text-white shadow-xs"
                          : "bg-surface border-border text-dark-600 hover:bg-dark-50"
                      }`}
                    >
                      <span className="block text-[11px] font-semibold">
                        {isAvailable ? d.label : "Closed"}
                      </span>
                      <span className="block text-sm font-bold">{d.num}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-dark-700 mb-2">Pick a new time slot</p>
              {!rescheduleDate ? (
                <p className="text-xs text-dark-400">Select a date to see available slots.</p>
              ) : isLoadingRescheduleSlots ? (
                <p className="text-xs text-dark-400">Loading slots…</p>
              ) : rescheduleSlots.length === 0 ? (
                <p className="text-xs text-dark-400">No slots available on this date.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {rescheduleSlots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRescheduleSlot(s)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        rescheduleSlot === s
                          ? "bg-primary-500 border-primary-500 text-white shadow-xs"
                          : "bg-surface border-border text-dark-600 hover:bg-dark-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={closeReschedule}
                className="py-2 px-3.5 rounded-xl border border-border text-dark-700 hover:bg-dark-50 text-xs font-semibold transition-colors"
              >
                Keep Current Slot
              </button>
              <button
                type="button"
                onClick={handleRescheduleConfirm}
                disabled={!rescheduleSlot || isRescheduling}
                className="py-2 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-button transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isRescheduling ? "Rescheduling…" : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
