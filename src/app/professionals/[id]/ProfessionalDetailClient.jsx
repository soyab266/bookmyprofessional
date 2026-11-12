"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAuth } from "@/context/AuthContext";
import { reportReview } from "@/lib/data/reviews";
import { isWished, addWish, removeWish } from "@/lib/data/wishlist";
import { ikImage } from "@/lib/imagekit";
import {
  Star,
  ShieldCheck,
  MapPin,
  Clock,
  Calendar,
  Award,
  CheckCircle2,
  FileCheck,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Share2,
  Heart,
  Phone,
  Mail,
  Shield,
  Zap,
  Flag,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getNextAvailableSlot, formatTime24to12 } from "@/lib/data/bookings";

export default function ProfessionalDetailClient({ proId, initialProfile = null }) {
  const { professionals, startBooking, isLoadingProfessionals } = useMarketplace();
  const { showToast, user, openAuthModal } = useAuth();

  const [activeTab, setActiveTab] = useState("services"); // "services" | "about" | "credentials" | "reviews" | "schedule"
  const [isSaved, setIsSaved] = useState(false);
  const [reported, setReported] = useState({});

  const handleReport = async (review) => {
    try {
      await reportReview(review.id);
      setReported((prev) => ({ ...prev, [review.id]: true }));
      showToast("Review reported. Thanks for helping keep the marketplace safe.", "success");
    } catch {
      showToast("Unable to report this review right now.", "error");
    }
  };

  // Use the server-provided public profile for first render. During a read
  // failure, preserve the existing client directory lookup and recovery behavior.
  const pro = initialProfile?.id === proId
    ? initialProfile
    : professionals.find((p) => p.id === proId) ||
      professionals.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, "-").includes(proId));
  const isOwnProfile = !!(user && pro && user.id === pro.id);

  const [liveAvailability, setLiveAvailability] = useState(null);
  // undefined = not yet computed, null = no slots, string = "Mon 6 Oct • 09:00 AM"
  const [nextAvailableLabel, setNextAvailableLabel] = useState(undefined);

  useEffect(() => {
    if (!pro?.id) {
      setLiveAvailability(null);
      return;
    }
    let active = true;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase
        .from("professionals")
        .select("availability")
        .eq("id", pro.id)
        .single()
        .then(({ data }) => {
          const avail = data?.availability || pro?.availability || null;
          setLiveAvailability(avail);

          // Immediately compute next available slot using the freshly loaded availability
          if (!avail || (!avail.daily && (!Array.isArray(avail.slots) || avail.slots.length === 0))) {
            setNextAvailableLabel(null);
            return;
          }
          getNextAvailableSlot(pro.id, avail, supabase)
            .then((label) => {
              if (active) setNextAvailableLabel(label ?? null);
            })
            .catch(() => {
              if (active) setNextAvailableLabel(null);
            });
        })
        .catch(() => {
          if (active) {
            setLiveAvailability(null);
            setNextAvailableLabel(null);
          }
        });
    });
    return () => {
      active = false;
    };
  }, [pro?.id]);

  useEffect(() => {
    let active = true;
    if (user && pro) {
      isWished(pro.id).then((wished) => {
        if (active) setIsSaved(!!wished);
      });
    }
    return () => {
      active = false;
    };
  }, [pro, user]);

  const toggleSave = async () => {
    if (!user) {
      showToast("Sign in to save professionals", "info");
      openAuthModal("login", "customer");
      return;
    }
    const next = !isSaved;
    setIsSaved(next);
    const ok = next ? await addWish(pro.id) : await removeWish(pro.id);
    if (!ok) {
      setIsSaved(!next);
      showToast("Unable to update your wishlist right now.", "error");
      return;
    }
    showToast(
      next ? "Added to your wishlist" : "Removed from your wishlist",
      next ? "success" : "info"
    );
  };

  if (!pro) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-dark-800">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-dark-900">
              {isLoadingProfessionals ? "Loading professional…" : "Professional not found"}
            </h1>
            {!isLoadingProfessionals && (
              <>
                <p className="text-sm text-dark-500 mt-2">
                  This professional may have been removed or is no longer available.
                </p>
                <Link
                  href="/professionals"
                  className="inline-flex items-center justify-center mt-5 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-button transition-colors"
                >
                  Browse Professionals
                </Link>
              </>
            )}
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
            <span className="text-dark-900 font-semibold truncate">{pro.name}</span>
          </div>
        </div>
      </div>

      <main className="flex-1 py-8 sm:py-10">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          {/* TOP PROFILE HERO CARD */}
          <div className="bg-surface rounded-3xl border border-border shadow-card overflow-hidden mb-8">
            {/* Header Banner Background */}
            <div className="relative h-40 sm:h-52 bg-gradient-to-r from-dark-900 via-primary-950 to-primary-900 p-6 flex items-start justify-between overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:20px_20px] opacity-15 pointer-events-none" />

              <span className="relative z-10 bg-white/20 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                {pro.subcategory ? `${pro.category} · ${pro.subcategory}` : pro.category}
              </span>

              <div className="relative z-10 flex items-center gap-2">
                <Link
                  href={`/messages?dm=${pro.id}`}
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/30 text-white backdrop-blur-md transition-colors"
                  title="Message Professional"
                >
                  <MessageSquare className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={toggleSave}
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/30 text-white backdrop-blur-md transition-colors"
                  title="Save Professional"
                >
                  <Heart className={`w-4 h-4 ${isSaved ? "fill-red-500 text-red-500" : ""}`} />
                </button>
              </div>
            </div>

            {/* Profile Bar Details */}
            <div className="px-6 sm:px-8 pb-6 relative">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 -mt-16 sm:-mt-20 mb-6">
                {/* Avatar & Title */}
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="relative shrink-0">
                    {pro.image ? (
                      <img
                        src={ikImage(pro.image)}
                        alt={pro.name}
                        className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border-4 border-surface shadow-xl bg-dark-100"
                      />
                    ) : (
                      <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl border-4 border-surface shadow-xl bg-dark-100 flex items-center justify-center font-heading font-bold text-4xl text-dark-400">
                        {pro.name?.charAt(0) || "P"}
                      </div>
                    )}
                    {pro.verificationStatus === "approved" && (
                      <div
                        className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1.5 rounded-full border-2 border-surface shadow-md"
                        title="Identity & License Verified"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                    {(pro.verificationStatus === "pending" || pro.verificationStatus === "documents_requested") && (
                      <div
                        className="absolute -bottom-1 -right-1 bg-amber-400 text-white p-1.5 rounded-full border-2 border-surface shadow-md"
                        title="Verification Pending"
                      >
                        <Clock className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                    {pro.verificationStatus === "rejected" && (
                      <div
                        className="absolute -bottom-1 -right-1 bg-red-500 text-white p-1.5 rounded-full border-2 border-surface shadow-md"
                        title="Verification Not Approved"
                      >
                        <XCircle className="w-4 h-4 stroke-[2]" />
                      </div>
                    )}
                    {(!pro.verificationStatus || pro.verificationStatus === "not_submitted") && (
                      <div
                        className="absolute -bottom-1 -right-1 bg-dark-300 text-white p-1.5 rounded-full border-2 border-surface shadow-md"
                        title="Not Verified"
                      >
                        <AlertCircle className="w-4 h-4 stroke-[2]" />
                      </div>
                    )}
                  </div>

                  <div className="sm:mb-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="font-heading text-2xl sm:text-3xl font-bold text-dark-900 sm:text-white">
                        {pro.name}
                      </h1>
                      {pro.verificationStatus === "approved" && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Verified Expert
                        </span>
                      )}
                      {(pro.verificationStatus === "pending" || pro.verificationStatus === "documents_requested") && (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Review
                        </span>
                      )}
                      {pro.verificationStatus === "rejected" && (
                        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-200">
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                          Not Approved
                        </span>
                      )}
                      {(!pro.verificationStatus || pro.verificationStatus === "not_submitted") && (
                        <span className="inline-flex items-center gap-1 bg-dark-100 text-dark-500 text-xs font-bold px-2.5 py-0.5 rounded-full border border-dark-200">
                          <AlertCircle className="w-3.5 h-3.5 text-dark-400" />
                          Not Verified
                        </span>
                      )}
                    </div>

                    <p className="text-sm sm:text-base font-semibold text-primary-600 mt-1">
                      {pro.role}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-dark-500 mt-2">
                      {pro.location && (
                        <span className="flex items-center gap-1 text-dark-700 font-medium">
                          <MapPin className="h-3.5 w-3.5 text-primary-500" />
                          {pro.location}
                        </span>
                      )}
                      {pro.responseTime ? (
                        <>
                          {pro.location && <span>•</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-dark-400" />
                            {pro.responseTime} response time
                          </span>
                        </>
                      ) : null}
                      {pro.experienceYears > 0 && (
                        <>
                          {(pro.location || pro.responseTime) && <span>•</span>}
                          <span className="text-dark-700 font-medium bg-dark-50 px-2 py-0.5 rounded-md">
                            {pro.experienceYears}+ Years Experience
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rating & Action */}
                <div className="flex flex-col sm:items-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3.5 py-1.5 rounded-xl">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    <div>
                      {pro.reviewCount > 0 ? (
                        <>
                          <span className="font-heading font-bold text-base text-dark-900">
                            {pro.rating}
                          </span>
                          <span className="text-xs text-dark-500 ml-1 font-normal">
                            ({pro.reviewCount} reviews)
                          </span>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-primary-700">New professional</span>
                      )}
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[11px] text-dark-400 block font-semibold uppercase">
                      Starting from
                    </span>
                    <span className="font-heading text-2xl font-bold text-dark-900">
                      {formatMoney(pro.price, 0)}
                    </span>
                    <span className="text-xs text-dark-500">/{pro.unit}</span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-border overflow-x-auto no-scrollbar gap-2 pt-2">
                {[
                  { id: "services", label: `Services & Pricing (${pro.services?.length || 0})` },
                  { id: "about", label: "About & Background" },
                  { id: "credentials", label: "Credentials & Verification" },
                  { id: "reviews", label: `Client Reviews (${pro.reviews?.length || 0})` },
                  { id: "schedule", label: "Operating Schedule" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-4 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
                      activeTab === tab.id
                        ? "border-primary-500 text-primary-600 bg-primary-50/50 rounded-t-lg"
                        : "border-transparent text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-t-lg"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MAIN TWO COLUMN CONTENT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column (2 Cols) - Dynamic Tabs Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* TAB 1: SERVICES & PRICING */}
              {activeTab === "services" && (
                <div className="bg-surface rounded-2xl border border-border p-6 shadow-card space-y-4">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-dark-900">
                      Available Service Packages
                    </h2>
                    <p className="text-xs text-dark-500">
                      Select a service package below to book with instant confirmation.
                    </p>
                  </div>

                  <div className="space-y-3.5">
                    {pro.services?.map((srv) => (
                      <div
                        key={srv.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-border hover:border-primary-300 hover:bg-primary-50/20 transition-all bg-surface shadow-xs"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2.5">
                            <h3 className="font-heading text-base font-bold text-dark-900">
                              {srv.title}
                            </h3>
                            <span className="text-[11px] font-semibold text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded-full">
                              {srv.duration}
                            </span>
                          </div>
                          <p className="text-xs text-dark-600 leading-relaxed">
                            {srv.description}
                          </p>
                          {Array.isArray(srv.inclusions) && srv.inclusions.length > 0 && (
                            <ul className="text-[11px] text-dark-600 mt-1.5 space-y-0.5">
                              {srv.inclusions.map((line) => (
                                <li key={line} className="flex items-start gap-1.5">
                                  <Check className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                                  {line}
                                </li>
                              ))}
                            </ul>
                          )}
                          {Array.isArray(srv.exclusions) && srv.exclusions.length > 0 && (
                            <p className="text-[11px] text-amber-700 mt-1.5">
                              Extra charges: {srv.exclusions.join(" • ")}
                            </p>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2.5 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-border">
                          <span className="font-heading text-xl font-bold text-dark-900">
                            {formatMoney(srv.price)}
                          </span>
                          {isOwnProfile ? (
                            <span className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-dark-100 text-dark-500 font-semibold text-xs cursor-not-allowed">
                              Your Service
                            </span>
                          ) : (
                            <Link
                              href={`/book/${pro.id}?service=${srv.id}`}
                              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs shadow-button transition-colors"
                            >
                              <Calendar className="w-3.5 h-3.5 mr-1.5" />
                              Book Package
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: ABOUT & BACKGROUND */}
              {activeTab === "about" && (
                <div className="bg-surface rounded-2xl border border-border p-6 shadow-card space-y-6">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-dark-900 mb-2">
                      About {pro.name}
                    </h2>
                    {(pro.about || pro.bio) ? (
                      <p className="text-sm text-dark-700 leading-relaxed">
                        {pro.about || pro.bio}
                      </p>
                    ) : (
                      <p className="text-sm text-dark-500 italic">
                        This professional hasn't added a bio yet.
                      </p>
                    )}
                  </div>

                  {/* Highlights Grid — only show cards with real data */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pro.experienceYears > 0 && (
                      <div className="p-4 bg-dark-50 rounded-xl border border-border">
                        <span className="block text-xs text-dark-400 font-medium">Experience</span>
                        <span className="block text-base font-bold text-dark-900 mt-1">
                          {pro.experienceYears}+ Years Active
                        </span>
                      </div>
                    )}
                    <div className="p-4 bg-dark-50 rounded-xl border border-border">
                      <span className="block text-xs text-dark-400 font-medium">Verification</span>
                      <span className={`block text-sm font-bold mt-1 ${
                        pro.verificationStatus === "approved"
                          ? "text-emerald-700"
                          : pro.verificationStatus === "rejected"
                          ? "text-red-600"
                          : pro.verificationStatus === "pending" || pro.verificationStatus === "documents_requested"
                          ? "text-amber-600"
                          : "text-dark-500"
                      }`}>
                        {pro.verificationStatus === "approved"
                          ? "ID & Docs Verified"
                          : pro.verificationStatus === "rejected"
                          ? "Verification Rejected"
                          : pro.verificationStatus === "documents_requested"
                          ? "Docs Requested"
                          : pro.verificationStatus === "pending"
                          ? "Pending Review"
                          : "Not Submitted"}
                      </span>
                    </div>
                    <div className={`p-4 bg-dark-50 rounded-xl border border-border ${pro.experienceYears > 0 ? "col-span-2 sm:col-span-1" : "col-span-2 sm:col-span-1"}`}>
                      <span className="block text-xs text-dark-400 font-medium">Satisfaction</span>
                      <span className="block text-base font-bold text-dark-900 mt-1">
                        {pro.reviewCount > 0 ? `${pro.rating} / 5.0 Star Rating` : "No ratings yet"}
                      </span>
                    </div>
                  </div>

                  {/* Guarantee banner */}
                  <div className="p-5 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-heading text-xs sm:text-sm font-bold text-emerald-900">
                        BookMyProfessional Escrow & Rematching Protection
                      </h4>
                      <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">
                        Your payment is held safely in escrow and only released once your service is fulfilled. Free cancellation up to 24h prior to appointment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CREDENTIALS & LICENSES */}
              {activeTab === "credentials" && (
                <div className="bg-surface rounded-2xl border border-border p-6 shadow-card space-y-5">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-dark-900 mb-1">
                      {pro.verified && pro.verificationStatus === "approved"
                        ? "Verified Credentials, Degrees & Licenses"
                        : "Credentials, Degrees & Licenses"}
                    </h2>
                    <p className="text-xs text-dark-500">
                      {pro.verified && pro.verificationStatus === "approved"
                        ? "Documents reviewed and approved by compliance team."
                        : "Credentials declared by the professional."}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {(!pro.credentials || pro.credentials.length === 0) ? (
                      <div className="p-8 text-center bg-dark-50 rounded-2xl border border-dashed border-border">
                        <p className="text-sm font-semibold text-dark-900">No credentials listed yet</p>
                        <p className="text-xs text-dark-500 mt-1">
                          This professional hasn't uploaded credential documents yet.
                        </p>
                      </div>
                    ) : (
                      pro.credentials.map((cred, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-4 bg-dark-50 rounded-xl border border-border"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <FileCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-dark-900">
                                {cred.title}
                              </h4>
                              <p className="text-xs text-dark-500 mt-0.5">
                                {cred.issuer ? `Issued by ${cred.issuer}` : ""}
                                {cred.issuer && cred.year ? " • " : ""}
                                {cred.year || ""}
                              </p>
                            </div>
                          </div>

                          <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${
                            pro.verified
                              ? "text-emerald-700 bg-emerald-100"
                              : "text-amber-700 bg-amber-50"
                          }`}>
                            {pro.verified ? "Verified" : "Under Review"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: REVIEWS */}
              {activeTab === "reviews" && (
                <div className="bg-surface rounded-2xl border border-border p-6 shadow-card space-y-6">
                  {/* Rating Header Breakdown */}
                  <div className="flex flex-col sm:flex-row items-center gap-6 p-5 bg-dark-50 rounded-xl border border-border">
                    <div className="text-center sm:text-left shrink-0">
                      <div className="font-heading text-4xl font-extrabold text-dark-900">
                        {pro.reviewCount > 0 ? pro.rating : "—"}
                      </div>
                      <div className="flex items-center justify-center sm:justify-start gap-1 my-1.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < Math.floor(pro.rating)
                                ? "fill-amber-400 text-amber-400"
                                : "text-dark-300"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-dark-500 font-medium">
                        Based on {pro.reviews?.length || 0} verified client reviews
                      </span>
                    </div>

                    {/* Sub-scores averaged from real review breakdown data (hidden until any exists) */}
                    {(() => {
                      const rows = (pro.reviews || []).filter(
                        (r) => r.breakdown && Object.keys(r.breakdown).length
                      );
                      if (!rows.length) return null;
                      const keys = [...new Set(rows.flatMap((r) => Object.keys(r.breakdown)))];
                      return (
                        <div className="border-t sm:border-t-0 sm:border-l border-border pt-4 sm:pt-0 sm:pl-6 flex-1 w-full space-y-2 text-xs">
                          {keys.map((k) => {
                            const vals = rows
                              .map((r) => Number(r.breakdown[k]))
                              .filter((n) => Number.isFinite(n));
                            if (!vals.length) return null;
                            const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
                            return (
                              <div key={k} className="flex items-center justify-between">
                                <span className="text-dark-600 font-medium capitalize">{k}</span>
                                <span className="font-bold text-dark-900">{avg} / 5.0</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Reviews List */}
                  <div className="space-y-3.5">
                    {(!pro.reviews || pro.reviews.length === 0) && (
                      <div className="p-8 text-center bg-dark-50 rounded-2xl border border-dashed border-border">
                        <p className="text-sm font-semibold text-dark-900">No reviews yet</p>
                        <p className="text-xs text-dark-500 mt-1">
                          Be the first to book {pro.name} and share your experience.
                        </p>
                      </div>
                    )}
                    {pro.reviews?.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-5 rounded-xl border border-border bg-surface space-y-2.5 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {rev.userAvatar?.trim() ? (
                              <img
                                src={rev.userAvatar}
                                alt={rev.userName}
                                className="w-9 h-9 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs shrink-0 border border-border">
                                {rev.userName?.charAt(0) || "U"}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-dark-900">
                                  {rev.userName}
                                </span>
                                {rev.verifiedBooking && (
                                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    Verified Booking
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-dark-400">{rev.date}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              {[...Array(rev.rating)].map((_, idx) => (
                                <Star
                                  key={idx}
                                  className="w-3.5 h-3.5 fill-amber-400 text-amber-400"
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              disabled={reported[rev.id]}
                              onClick={() => handleReport(rev)}
                              title="Report this review"
                              aria-label="Report this review"
                              className="inline-flex items-center gap-1 rounded text-[10px] font-semibold text-dark-400 transition-colors hover:text-red-600 disabled:cursor-default disabled:text-dark-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <Flag className="w-3 h-3" />
                              {reported[rev.id] ? "Reported" : "Report"}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-dark-700 leading-relaxed">
                          {rev.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: SCHEDULE */}
              {activeTab === "schedule" && (
                <div className="bg-surface rounded-2xl border border-border p-6 shadow-card space-y-5">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-dark-900 mb-1">
                      Operating Hours & Availability
                    </h2>
                    <p className="text-xs text-dark-500">
                      Standard operating schedule for in-person or remote consultations.
                    </p>
                  </div>

                  {(() => {
                    const avail = liveAvailability || pro.availability;
                    const hasDaily = avail?.daily && typeof avail.daily === "object";
                    const hasConfiguredDays = Array.isArray(avail?.days) && avail.days.length > 0;
                    const hasHours = !!avail?.hours;

                    if (!hasDaily && !hasConfiguredDays && !hasHours && (!avail?.slots || avail.slots.length === 0)) {
                      return (
                        <div className="p-8 text-center bg-dark-50 rounded-2xl border border-dashed border-border">
                          <p className="text-sm font-semibold text-dark-900">No schedule set yet</p>
                          <p className="text-xs text-dark-500 mt-1">
                            This professional hasn't configured their weekly operating hours yet.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                            "Sunday",
                          ].map((day) => {
                            let isAvailable = false;
                            let hoursText = "";
                            let breakText = "";

                            if (hasDaily && avail.daily[day]) {
                              const d = avail.daily[day];
                              isAvailable = Boolean(d.enabled);
                              if (isAvailable) {
                                hoursText = `${formatTime24to12(d.startTime)} - ${formatTime24to12(d.endTime)}`;
                                if (d.break?.enabled && d.break.start && d.break.end) {
                                  breakText = `(Break: ${formatTime24to12(d.break.start)} - ${formatTime24to12(d.break.end)})`;
                                }
                              }
                            } else {
                              isAvailable = (avail?.days || []).some(
                                (d) => String(d).toLowerCase() === day.toLowerCase()
                              );
                              hoursText = avail?.hours || "Open";
                            }

                            return (
                              <div
                                key={day}
                                className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                                  isAvailable
                                    ? "bg-surface border-border text-dark-900 font-medium"
                                    : "bg-dark-50/70 border-dashed border-border text-dark-400 opacity-75"
                                }`}
                              >
                                <div>
                                  <span className="font-bold block">{day}</span>
                                  {breakText && (
                                    <span className="text-[10px] text-dark-400 block mt-0.5">{breakText}</span>
                                  )}
                                </div>
                                <span
                                  className={
                                    isAvailable
                                      ? "text-primary-600 font-semibold"
                                      : "text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100"
                                  }
                                >
                                  {isAvailable ? hoursText : "Closed"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="p-3 bg-dark-50 rounded-xl border border-border text-xs text-dark-500">
                          ℹ️ Note: Last bookable slot is 2 hours before closing to ensure sufficient appointment duration.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Right Column (1 Col) - Sticky Booking Sidebar */}
            <div className="lg:col-span-1 space-y-5">
              <div className="bg-surface rounded-2xl border border-border p-6 shadow-card sticky top-24 space-y-5">
                <div>
                  <span className="text-[11px] font-semibold text-primary-600 uppercase tracking-wider block mb-1">
                    Instant Online Booking
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="font-heading text-2xl font-bold text-dark-900">
                      {formatMoney(pro.price)}
                    </span>
                    <span className="text-xs text-dark-500 font-medium">/{pro.unit}</span>
                  </div>
                </div>

                <div className="p-3.5 bg-dark-50 rounded-xl space-y-2 text-xs border border-border">
                  {/* Response Time — only shown when real data exists */}
                  {pro.responseTime ? (
                    <div className="flex items-center justify-between">
                      <span className="text-dark-600">Response Time:</span>
                      <span className="font-bold text-dark-900">{pro.responseTime}</span>
                    </div>
                  ) : null}

                  {/* Next Available — computed from real weekly hours + existing bookings */}
                  <div className="flex items-center justify-between">
                    <span className="text-dark-600">Next Available:</span>
                    {nextAvailableLabel === undefined ? (
                      // Still computing
                      <span className="font-medium text-dark-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 animate-pulse" />
                        Checking…
                      </span>
                    ) : nextAvailableLabel ? (
                      <span className="font-bold text-emerald-700">{nextAvailableLabel}</span>
                    ) : (
                      <span className="font-semibold text-dark-400">No slots yet</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-dark-600">Escrow Protected:</span>
                    <span className="font-bold text-emerald-700">100% Guaranteed</span>
                  </div>
                </div>

                {isOwnProfile ? (
                  <div className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-dark-100 text-dark-500 font-semibold text-sm cursor-not-allowed">
                    <Calendar className="w-4 h-4" />
                    <span>You cannot book your own profile</span>
                  </div>
                ) : (
                  <Link
                    href={`/book/${pro.id}`}
                    className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm shadow-button transition-colors"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Book Appointment Now</span>
                  </Link>
                )}

                <p className="text-[11px] text-center text-dark-500">
                  No payment charged until service milestones are confirmed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
                    }
