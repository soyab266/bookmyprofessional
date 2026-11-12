"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAuth } from "@/context/AuthContext";
import { distanceKm } from "@/lib/geo";
import { listCategories, DEFAULT_CATEGORIES } from "@/lib/data/categories";
import { ikImage } from "@/lib/imagekit";
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Filter,
  SlidersHorizontal,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Calendar,
  X,
  ChevronDown,
  Tag,
  Award,
  LocateFixed,
  AlertCircle,
  XCircle,
} from "lucide-react";
import Button from "./Button";
import { formatMoney } from "@/lib/money";
import { verifyPincode, cleanPincode, isValidPincodeFormat } from "@/lib/pincode";

const CATEGORY_LABELS = {
  Doctors: "Doctors & Health",
  Tutors: "Tutors & Academics",
  Electricians: "Electricians",
  Plumbers: "Plumbers",
  Beauticians: "Beauticians & Salon",
  Cleaners: "Cleaners & Maid",
  "IT Professionals": "IT & Tech Support",
  Consultants: "Consultants & Tax",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function MarketplaceDirectory({ preview = false, initialDirectory = null }) {
  const {
    professionals,
    filteredProfessionals: liveFilteredProfessionals,
    directoryReadVersion,
    locations,
    isLoadingProfessionals: liveIsLoadingProfessionals,
    searchQuery,
    setSearchQuery,
    selectedCategory: liveSelectedCategory,
    setSelectedCategory,
    selectedLocation,
    setSelectedLocation,
    pincode,
    setPincode,
    pincodeRelaxed,
    nearCoords,
    setNearCoords,
    minRating,
    setMinRating,
    minExperience,
    setMinExperience,
    priceRange,
    setPriceRange,
    availabilityDay,
    setAvailabilityDay,
    availabilitySlot,
    setAvailabilitySlot,
    sortBy,
    setSortBy,
    page,
    pageSize,
    total: liveTotal,
    setPage,
    openProDetail,
    startBooking,
  } = useMarketplace();

  // Initial cards are the actual visible directory, not a duplicate SEO-only list.
  // Retire the snapshot permanently after the first live query, including zero results.
  const [initialSnapshotRetired, setInitialSnapshotRetired] = useState(false);
  const useInitialDirectory = initialDirectory && directoryReadVersion === 0 && !initialSnapshotRetired;
  const selectedCategory = useInitialDirectory ? initialDirectory.category : liveSelectedCategory;
  const initialUnavailable = useInitialDirectory && initialDirectory.status !== "ready";
  const filteredProfessionals = useInitialDirectory ? initialDirectory.rows : liveFilteredProfessionals;
  const total = useInitialDirectory ? initialDirectory.total || 0 : liveTotal;
  const isLoadingProfessionals = useInitialDirectory ? initialUnavailable : liveIsLoadingProfessionals;

  const { showToast } = useAuth();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categoryIds, setCategoryIds] = useState(DEFAULT_CATEGORIES);
  const [pincodeLocation, setPincodeLocation] = useState(null);
  const [pincodeError, setPincodeError] = useState("");
  const [isValidatingPin, setIsValidatingPin] = useState(false);

  useEffect(() => {
    const clean = cleanPincode(pincode);
    if (clean.length < 6) {
      setPincodeLocation(null);
      setPincodeError("");
      return;
    }
    if (!isValidPincodeFormat(clean)) {
      setPincodeError("Pincode must be 6 digits and cannot start with 0.");
      setPincodeLocation(null);
      return;
    }
    let active = true;
    setIsValidatingPin(true);
    verifyPincode(clean).then((res) => {
      if (!active) return;
      setIsValidatingPin(false);
      if (res?.valid) {
        setPincodeLocation(res);
        setPincodeError("");
      } else {
        setPincodeError(res?.error || "Invalid Indian postal code.");
        setPincodeLocation(null);
      }
    });
    return () => {
      active = false;
    };
  }, [pincode]);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    let active = true;
    listCategories().then((cats) => {
      if (active) setCategoryIds(cats);
    });
    return () => {
      active = false;
    };
  }, []);

  // Deep link from the home category tiles: /professionals?category=Tutors preselects the chip.
  // ponytail: mount-only — rerunning on context updates would override the user's later chip clicks.
  useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get("category");
    if (cat) setSelectedCategory(cat);
  }, []);

  const categories = useMemo(
    () => [
      { id: "all", label: "All Categories" },
      ...categoryIds.map((id) => ({ id, label: CATEGORY_LABELS[id] || id })),
    ],
    [categoryIds]
  );

  // Collapsed: "All" + first 7 categories (keep the active chip visible); expanded: every category.
  const visibleCategories = showAllCategories
    ? categories
    : categories.slice(0, 8).concat(categories.slice(8).filter((c) => c.id === selectedCategory));
  const hiddenCategoryCount = categories.length - 8;

  // Cities come from the loaded catalog (plus the seeded locations table) so every city a
  // professional actually serves is selectable — the static seed list alone hid real cities.
  const locationOptions = useMemo(() => {
    const byCity = new Map();
    professionals.forEach((pro) => {
      if (pro.city) byCity.set(pro.city, pro.location || pro.city);
    });
    locations.forEach((loc) => {
      if (loc.city && !byCity.has(loc.city)) byCity.set(loc.city, loc.label || loc.city);
    });
    return [
      { id: "all", label: "All Locations" },
      ...[...byCity.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, label]) => ({ id, label })),
    ];
  }, [professionals, locations]);

  const slotOptions = useMemo(() => {
    const slots = new Set();
    professionals.forEach((pro) => {
      (pro.availability?.slots || []).forEach((slot) => slots.add(slot));
    });
    return [...slots];
  }, [professionals]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedLocation("all");
    setPincode("");
    setNearCoords(null);
    setMinRating(0);
    setMinExperience(0);
    setPriceRange("all");
    setAvailabilityDay("all");
    setAvailabilitySlot("all");
    setSortBy("featured");
  };

  const handleNearMe = () => {
    if (nearCoords) {
      setNearCoords(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast("Location is not supported in this browser.", "error");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setPincode("");
        setNearCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        showToast("Showing professionals closest to you.", "success");
      },
      () => {
        setIsLocating(false);
        showToast("Couldn't get your location. Allow location access and try again.", "error");
      },
      { timeout: 10000 }
    );
  };

  const hasActiveFilters =
    searchQuery ||
    selectedCategory !== "all" ||
    selectedLocation !== "all" ||
    pincode ||
    nearCoords ||
    minRating > 0 ||
    minExperience > 0 ||
    priceRange !== "all" ||
    availabilityDay !== "all" ||
    availabilitySlot !== "all";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <section id="find" onInputCapture={() => setInitialSnapshotRetired(true)} onClickCapture={(event) => {
      if (event.target.closest("button, select, input")) setInitialSnapshotRetired(true);
    }} className="py-14 sm:py-18 bg-background border-b border-border scroll-mt-14">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50/80 px-3 py-1 mb-2.5">
              <Sparkles className="h-3.5 w-3.5 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700">
                Verified Expert Marketplace
              </span>
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-dark-900">
              Browse & Book <span className="text-primary-500">Verified Professionals</span>
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-dark-600 font-normal max-w-2xl">
              Compare certified service providers, transparent pricing, verified client reviews, and instant appointment scheduling.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="hidden lg:flex items-center gap-4 bg-surface py-2.5 px-4 rounded-xl border border-border shadow-xs">
            <div className="text-right">
              <span className="block text-xs font-semibold text-dark-900">
                {initialUnavailable ? "Directory temporarily unavailable" : isLoadingProfessionals ? "Loading experts…" : `${total} Experts Available`}
              </span>
              <span className="block text-[11px] text-emerald-600 font-medium">
                ● 100% Background Verified
              </span>
            </div>
          </div>
        </div>

        {/* SEARCH & PRIMARY FILTER BAR */}
        <div className="bg-surface p-3 sm:p-4 rounded-2xl border border-border shadow-soft mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by skill, service or expert name..."
                className="w-full pl-10 pr-3.5 py-2.5 bg-dark-50/70 border border-border rounded-xl text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Location Selector */}
            <div className="md:col-span-3 relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-500" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-dark-50/70 border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer appearance-none"
              >
                {locationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label}
                  </option>
                ))}
                {selectedLocation !== "all" &&
                  !locationOptions.some((loc) => loc.id === selectedLocation) && (
                    <option value={selectedLocation}>{selectedLocation}</option>
                  )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400 pointer-events-none" />
            </div>

            {/* Sort Selector */}
            <div className="md:col-span-2 relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2.5 bg-dark-50/70 border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
              >
                <option value="featured">✨ Featured</option>
                <option value="rating">★ Highest Rated</option>
                <option value="reviews">💬 Most Reviews</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>

            {/* Mobile Filter Drawer Button / Clear Button */}
            <div className="md:col-span-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all shadow-xs ${
                  isFilterDrawerOpen || hasActiveFilters
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : "bg-surface border-border text-dark-700 hover:bg-dark-50"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Filters {hasActiveFilters && "(Active)"}</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="p-2.5 text-xs text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition-colors"
                  title="Reset all filters"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* CATEGORY FILTER CHIPS */}
          <div className={`flex items-center gap-2 pb-1 pt-1 no-scrollbar ${showAllCategories ? "flex-wrap" : "overflow-x-auto"}`}>
            {visibleCategories.map((cat) => {
              const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-primary-500 text-white shadow-button ring-2 ring-primary-300"
                      : "bg-dark-50 hover:bg-primary-50 text-dark-700 hover:text-primary-600 border border-border"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
            {hiddenCategoryCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCategories((v) => !v)}
                className="shrink-0 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
              >
                {showAllCategories ? "Show Less" : `View All (+${hiddenCategoryCount})`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllCategories ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

          {/* EXPANDABLE SECONDARY FILTERS DRAWER */}
          {isFilterDrawerOpen && (
            <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in slide-in-from-top-2 duration-150">
              {/* Near Me Toggle */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Nearby Professionals
                </label>
                <button
                  type="button"
                  onClick={handleNearMe}
                  disabled={isLocating}
                  className={`w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-60 ${
                    nearCoords
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold"
                      : "bg-white border-border text-dark-700 hover:bg-dark-50"
                  }`}
                >
                  <LocateFixed className="h-3.5 w-3.5 shrink-0" />
                  {isLocating
                    ? "Locating…"
                    : nearCoords
                      ? "Nearest First — Tap to Clear"
                      : "Show Pros Near Me"}
                </button>
              </div>

              {/* Rating Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Minimum Rating
                </label>
                <div className="flex items-center gap-1.5">
                  {[
                    { val: 0, label: "All" },
                    { val: 4.5, label: "4.5+ ★" },
                    { val: 4.8, label: "4.8+ ★" },
                  ].map((r) => (
                    <button
                      key={r.val}
                      type="button"
                      onClick={() => setMinRating(r.val)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border text-center transition-all ${
                        minRating === r.val
                          ? "bg-amber-50 border-amber-300 text-amber-700 font-semibold"
                          : "bg-white border-border text-dark-700 hover:bg-dark-50"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Minimum Experience
                </label>
                <div className="flex items-center gap-1.5">
                  {[
                    { val: 0, label: "All" },
                    { val: 5, label: "5+ yrs" },
                    { val: 10, label: "10+ yrs" },
                  ].map((e) => (
                    <button
                      key={e.val}
                      type="button"
                      onClick={() => setMinExperience(e.val)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border text-center transition-all ${
                        minExperience === e.val
                          ? "bg-primary-50 border-primary-300 text-primary-700 font-semibold"
                          : "bg-white border-border text-dark-700 hover:bg-dark-50"
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Budget / Price Tier
                </label>
                <div className="flex items-center gap-1.5">
                  {[
                    { val: "all", label: "Any" },
                    { val: "under-40", label: `< ${formatMoney(40, 0)}` },
                    { val: "40-70", label: `${formatMoney(40, 0)}-${formatMoney(70, 0)}` },
                    { val: "above-70", label: `> ${formatMoney(70, 0)}` },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setPriceRange(p.val)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border text-center transition-all ${
                        priceRange === p.val
                          ? "bg-primary-50 border-primary-300 text-primary-700 font-semibold"
                          : "bg-white border-border text-dark-700 hover:bg-dark-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pincode Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Service Pincode
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="e.g. 110001"
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-border rounded-lg text-xs text-dark-900 placeholder:text-dark-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  />
                </div>
                {isValidatingPin && (
                  <p className="text-[10px] text-primary-600 font-medium mt-1 animate-pulse">
                    Verifying Indian postal code...
                  </p>
                )}
                {pincodeLocation && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                    {pincodeLocation.district}, {pincodeLocation.state}
                  </p>
                )}
                {pincodeError && (
                  <p className="text-[10px] text-red-600 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-red-500 inline shrink-0" />
                    {pincodeError}
                  </p>
                )}
              </div>

              {/* Availability Day Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Available Day
                </label>
                <select
                  value={availabilityDay}
                  onChange={(e) => setAvailabilityDay(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-border rounded-lg text-xs text-dark-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
                >
                  <option value="all">Any day</option>
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              {/* Availability Time-slot Filter */}
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Time Slot
                </label>
                <select
                  value={availabilitySlot}
                  onChange={(e) => setAvailabilitySlot(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-border rounded-lg text-xs text-dark-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
                >
                  <option value="all">Any time</option>
                  {slotOptions.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset shortcut */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="w-full justify-center text-dark-600 border-border hover:bg-dark-50 text-xs py-2"
                >
                  Clear All Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* PINCODE VERIFIED OR ERROR NOTICE */}
        {pincodeError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
            <p className="text-xs text-red-700">
              <span className="font-semibold">Invalid Pincode: </span>
              {pincodeError}
            </p>
          </div>
        )}

        {pincodeLocation && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-xs text-dark-800">
              <span className="font-bold text-emerald-800">Exact Location: </span>
              <span className="font-semibold text-dark-900">
                {pincodeLocation.formattedLocation || `${pincodeLocation.district}, ${pincodeLocation.state}`}
              </span>
              <span className="text-dark-500 ml-1">(PIN: {pincode}).</span>
              <span className="text-emerald-700 ml-1 font-medium">
                {pincodeRelaxed
                  ? " No direct match inside this pincode — showing closest available professionals."
                  : " Showing verified professionals servicing this area."}
              </span>
            </p>
          </div>
        )}

        {/* RELAXED PINCODE NOTICE (Fallback when location not yet parsed) */}
        {!pincodeLocation && !pincodeError && pincodeRelaxed && pincode && filteredProfessionals.length > 0 && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-dark-700">
              No professionals inside pincode{" "}
              <span className="font-semibold">{pincode}</span>. Showing the closest
              available experts instead.
            </p>
          </div>
        )}

        {/* NEAR ME NOTICE */}
        {nearCoords && filteredProfessionals.length > 0 && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
            <LocateFixed className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-xs text-dark-700">
              Showing professionals closest to your location first. Distances are
              straight-line estimates.
            </p>
          </div>
        )}

        {/* RESULTS GRID OR EMPTY STATE */}
        {initialUnavailable ? (
          <p role="status" className="py-12 text-center text-sm text-dark-600">The directory is temporarily unavailable. Please try again shortly.</p>
        ) : filteredProfessionals.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-dashed border-border p-12 text-center my-6">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary-50 text-primary-500 flex items-center justify-center mb-3">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-lg font-bold text-dark-900 mb-1">
              No Professionals Found
            </h3>
            <p className="text-xs sm:text-sm text-dark-600 max-w-md mx-auto mb-4">
              We couldn't find any verified professionals matching your current filters. Try adjusting your search keyword or clearing the filters.
            </p>
            <Button variant="primary" size="sm" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {(preview ? filteredProfessionals.slice(0, 8) : filteredProfessionals).map((pro) => {
              const distanceToUserKm = nearCoords ? distanceKm(nearCoords, pro) : null;
              return (
              <div
                key={pro.id}
                className="group relative flex flex-col justify-between bg-surface rounded-2xl border border-border/90 hover:border-primary-300 shadow-card hover:shadow-soft transition-all duration-200 overflow-hidden hover:-translate-y-1"
              >
                {/* Top Image + Badges */}
                <div className="relative">
                  <div className="w-full h-44 sm:h-48 overflow-hidden bg-dark-100">
                    {pro.image ? (
                      <img
                        src={ikImage(pro.image)}
                        alt={pro.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-heading font-bold text-4xl text-dark-400">
                        {pro.name?.charAt(0) || "P"}
                      </div>
                    )}
                  </div>

                  {/* Gradient bottom shadow over image */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                  {/* Verification Status Badge */}
                  {(() => {
                    const s = pro.verificationStatus;
                    if (s === "approved") {
                      return (
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-surface/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700 shadow-sm border border-emerald-200/80">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Verified Pro</span>
                        </div>
                      );
                    }
                    if (s === "pending" || s === "documents_requested") {
                      return (
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-amber-50/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-700 shadow-sm border border-amber-200/80">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Pending Review</span>
                        </div>
                      );
                    }
                    if (s === "rejected") {
                      return (
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-red-50/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-red-700 shadow-sm border border-red-200/80">
                          <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>Not Approved</span>
                        </div>
                      );
                    }
                    // not_submitted or any other state
                    return (
                      <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-dark-50/95 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-dark-500 shadow-sm border border-dark-200/80">
                        <AlertCircle className="w-3.5 h-3.5 text-dark-400 shrink-0" />
                        <span>Not Verified</span>
                      </div>
                    );
                  })()}

                  {/* Category Pill on Image Bottom */}
                  <div className="absolute bottom-3 left-3">
                    <span className="inline-block bg-dark-900/85 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {pro.subcategory ? `${pro.category} · ${pro.subcategory}` : pro.category}
                    </span>
                  </div>

                  {/* Response Time Badge */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-white/95 font-medium bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-md">
                    <Clock className="w-3 h-3 text-sky-400" />
                    <span>{pro.responseTime}</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {/* Rating & Experience */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                      <div className="flex items-center gap-1">
                        {pro.reviewCount > 0 ? (
                          <>
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-dark-900">{pro.rating}</span>
                            <span className="text-dark-500 font-normal">({pro.reviewCount})</span>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                            New
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-dark-600 bg-dark-50 px-2 py-0.5 rounded-full">
                        {pro.experienceYears}+ yrs exp
                      </span>
                    </div>

                    {/* Name & Specialty */}
                    <h3 className="font-heading text-base font-bold text-dark-900 line-clamp-1 group-hover:text-primary-600 transition-colors">
                      {pro.name}
                    </h3>
                    <p className="text-xs text-primary-700 font-medium line-clamp-1 mt-0.5">
                      {pro.role}
                    </p>

                    {/* Location */}
                    <div className="flex items-center gap-1 text-xs text-dark-500 mt-1.5">
                      <MapPin className="h-3.5 w-3.5 text-dark-400 shrink-0" />
                      <span className="truncate">{pro.location}</span>
                      {distanceToUserKm != null && (
                        <span className="shrink-0 font-semibold text-emerald-600">
                          · {distanceToUserKm < 1 ? "<1" : Math.round(distanceToUserKm)} km away
                        </span>
                      )}
                    </div>

                    {/* Bio snippet */}
                    <p className="text-xs text-dark-600 line-clamp-2 mt-2 leading-relaxed">
                      {pro.bio}
                    </p>
                  </div>

                  {/* Pricing and Action Buttons */}
                  <div className="pt-3 border-t border-border/80">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <span className="text-[10px] text-dark-400 uppercase font-semibold block">
                          Starting at
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-heading text-lg font-bold text-dark-900">
                            {formatMoney(pro.price, 0)}
                          </span>
                          {pro.originalPrice && (
                            <span className="text-xs text-dark-400 line-through">
                              {formatMoney(pro.originalPrice, 0)}
                            </span>
                          )}
                          <span className="text-[11px] text-dark-500">/{pro.unit}</span>
                        </div>
                      </div>

                      {/* Services count */}
                      <span className="text-[11px] font-medium text-dark-500 bg-primary-50 px-2 py-1 rounded-md text-primary-700">
                        {pro.services?.length ?? 0} {pro.services?.length === 1 ? "Service" : "Services"}
                      </span>
                    </div>

                    {/* Buttons: View Profile & Book Now */}
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/professionals/${pro.id}`}
                        className="py-2 px-2.5 rounded-lg border border-border bg-surface hover:bg-dark-50 text-xs font-semibold text-dark-800 transition-colors text-center inline-flex items-center justify-center"
                      >
                        View Profile
                      </Link>
                      <Link
                        href={`/book/${pro.id}`}
                        className="py-2 px-2.5 rounded-lg text-xs font-semibold justify-center shadow-button bg-primary-500 hover:bg-primary-600 text-white transition-colors inline-flex items-center"
                      >
                        <Calendar className="h-3.5 w-3.5 mr-1 shrink-0" />
                        Book Now
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* VIEW ALL (home preview only) */}
        {preview && filteredProfessionals.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Link
              href="/professionals"
              className="inline-flex items-center gap-2 rounded-button bg-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-button transition-colors hover:bg-primary-600"
            >
              <span>View All Professionals</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* PAGINATION */}
        {!preview && total > 0 && (
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-dark-500">
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoadingProfessionals}
                  onClick={() => setPage(page - 1)}
                >
                  Prev
                </Button>
                <span className="text-xs font-semibold text-dark-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoadingProfessionals}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
