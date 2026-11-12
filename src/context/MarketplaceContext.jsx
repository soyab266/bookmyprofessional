"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import { listProfessionals, DEFAULT_PAGE_SIZE } from "@/lib/data/professionals";
import { listLocations, DEFAULT_LOCATIONS } from "@/lib/data/locations";
import {
  listMyBookings,
  createBooking as createBookingRow,
  cancelBooking as cancelBookingRow,
  updateBookingStatus as updateBookingStatusRow,
} from "@/lib/data/bookings";
import {
  requestPayout as requestPayoutRow,
  releasePayment,
  refundPayment,
  getEarningsSummary,
} from "@/lib/data/payments";
import { submitReview as submitReviewRow } from "@/lib/data/reviews";
import { formatMoney } from "@/lib/money";

// ponytail: in-memory booking used by legacy sync callers (/book/[id]) and as the supabase-down fallback.
function buildMockBooking(bookingData, customerProfile) {
  return {
    id: `BMP-${Math.floor(10000 + Math.random() * 90000)}`,
    proId: bookingData.pro.id,
    proName: bookingData.pro.name,
    proRole: bookingData.pro.role,
    proAvatar: bookingData.pro.image,
    serviceTitle: bookingData.service.title,
    servicePrice: bookingData.service.price,
    platformFee: 3.5,
    totalPaid: bookingData.service.price,
    date: bookingData.date,
    timeSlot: bookingData.timeSlot,
    address: bookingData.address,
    customerNotes: bookingData.notes || "None provided",
    customerName: bookingData.customerName || customerProfile.name,
    customerEmail: bookingData.customerEmail || customerProfile.email,
    customerPhone: bookingData.customerPhone || customerProfile.phone,
    status: "upcoming",
    paymentStatus: bookingData.paymentStatus || "paid",
    paymentMethod: bookingData.paymentMethod || "Visa ending in •••• 4242",
    createdAt: new Date().toISOString(),
    hasReview: false,
  };
}

const MarketplaceContext = createContext(null);

// Initial Verified Professionals Dataset with comprehensive services, schedules, credentials, and reviews
export const INITIAL_PROFESSIONALS = [];

// Initial demo bookings
export const INITIAL_BOOKINGS = [];

export function MarketplaceProvider({ children }) {
  const { user, showToast } = useAuth();
  const pathname = usePathname();

  // Master State
  const [professionals, setProfessionals] = useState([]);
  // Server-filtered, paginated page of the directory. Detail/booking pages keep using the full `professionals` list.
  const [filteredProfessionals, setFilteredProfessionals] = useState([]);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [directoryReadVersion, setDirectoryReadVersion] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Directory Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [pincode, setPincode] = useState("");
  const [pincodeRelaxed, setPincodeRelaxed] = useState(false);
  const [nearCoords, setNearCoords] = useState(null);
  const [minRating, setMinRating] = useState(0);
  const [minExperience, setMinExperience] = useState(0);
  const [priceRange, setPriceRange] = useState("all"); // "all" | "under-40" | "40-70" | "above-70"
  const [availabilityDay, setAvailabilityDay] = useState("all"); // "all" | weekday name
  const [availabilitySlot, setAvailabilitySlot] = useState("all"); // "all" | slot label
  const [sortBy, setSortBy] = useState("featured"); // "featured" | "rating" | "price-asc" | "price-desc" | "reviews"

  // Active Modals & Flow States
  const [selectedPro, setSelectedPro] = useState(null); // Pro profile modal
  const [bookingPro, setBookingPro] = useState(null); // Booking wizard modal
  const [bookingPreselectedService, setBookingPreselectedService] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null); // Review write modal
  const [isCustomerDashboardOpen, setIsCustomerDashboardOpen] = useState(false);
  const [isProDashboardOpen, setIsProDashboardOpen] = useState(false);

  // Customer Profile State
  const [customerProfile, setCustomerProfile] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    pincode: "",
    postalCode: "",
  });

  // Professional Vendor State (Simulated for active pro user)
  const [proVendorState, setProVendorState] = useState({
    id: "pro-1",
    name: "Dr. Ayesha Khan",
    verificationStatus: "verified", // "verified" | "pending_verification"
    totalGrossEarnings: 0,
    commissionRate: 0.1, // 10%
    paidOutAmount: 0,
    availablePayout: 0,
    payoutHistory: [],
    uploadedDocuments: [
      { name: "Government_ID_Passport.pdf", type: "ID Proof", date: "10 Jan 2024", verified: true },
      { name: "Medical_Board_License_2024.pdf", type: "Professional License", date: "12 Jan 2024", verified: true },
    ],
  });

  // Sync logged in user info with customer profile if available
  useEffect(() => {
    if (user) {
      setCustomerProfile((prev) => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== "professional" || !user?.id) return;
    let active = true;
    getEarningsSummary(user.id).then((summary) => {
      if (!active || !summary) return;
      setProVendorState((prev) => ({
        ...prev,
        totalGrossEarnings: summary.gross,
        paidOutAmount: summary.paidOut,
        availablePayout: summary.available,
        commissionRate: summary.commissionRate,
      }));
    });
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  // Load the full catalog once for the detail/booking pages and the slot picker. Only those
  // routes (plus dashboard's wishlist lookups) need it — other pages skip the heavy query.
  useEffect(() => {
    let active = true;
    const needsCatalog =
      pathname === "/dashboard" ||
      pathname.startsWith("/professionals/") ||
      pathname.startsWith("/book/");

    (async () => {
      try {
        const locs = await listLocations();
        if (!active) return;
        setLocations(locs);
        if (!needsCatalog) return;
        // ponytail: 500-row cap keeps /professionals/[id] + /book/[id] working off the context list.
        // Move those to a by-id fetch if the catalog can exceed it.
        const { rows } = await listProfessionals({
          page: 1,
          pageSize: 500,
          locations: locs,
        });
        if (active && rows.length > 0) setProfessionals(rows);
      } finally {
        if (active) setIsLoadingProfessionals(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname]);

  // Debounce the search box before it hits the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Server-side filtered + paginated directory rows (falls back to the seed inside listProfessionals).
  useEffect(() => {
    let active = true;

    (async () => {
      setIsLoadingProfessionals(true);
      const { rows, total: count, relaxedPincode } = await listProfessionals({
        search: debouncedSearch,
        category: selectedCategory,
        location: selectedLocation,
        pincode,
        minRating,
        minExperience,
        priceRange,
        sortBy,
        availabilityDay,
        availabilitySlot,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        locations,
        near: nearCoords,
      });
      if (!active) return;
      setDirectoryReadVersion((version) => version + 1);
      setFilteredProfessionals(rows);
      setTotal(count);
      setPincodeRelaxed(Boolean(relaxedPincode));
      setIsLoadingProfessionals(false);
    })();

    return () => {
      active = false;
    };
  }, [
    debouncedSearch,
    selectedCategory,
    selectedLocation,
    pincode,
    minRating,
    minExperience,
    priceRange,
    sortBy,
    availabilityDay,
    availabilitySlot,
    page,
    locations,
    nearCoords,
  ]);

  // Any filter change returns to page 1.
  const setSearch = (value) => {
    setSearchQuery(value);
    setPage(1);
  };
  const setCategory = (value) => {
    setSelectedCategory(value);
    setPage(1);
  };
  const setLocation = (value) => {
    setSelectedLocation(value);
    setPage(1);
  };
  const setPincodeFilter = (value) => {
    setPincode(String(value || "").trim());
    setPage(1);
  };
  const setNear = (coords) => {
    setNearCoords(coords && coords.latitude != null ? coords : null);
    setPage(1);
  };
  const setRating = (value) => {
    setMinRating(value);
    setPage(1);
  };
  const setExperience = (value) => {
    setMinExperience(value);
    setPage(1);
  };
  const setPrice = (value) => {
    setPriceRange(value);
    setPage(1);
  };
  const setDay = (value) => {
    setAvailabilityDay(value);
    setPage(1);
  };
  const setSlot = (value) => {
    setAvailabilitySlot(value);
    setPage(1);
  };
  const setSort = (value) => {
    setSortBy(value);
    setPage(1);
  };

  // Load real bookings for the signed-in user; keep the demo seed when there is no session / supabase is down.
  useEffect(() => {
    let active = true;

    (async () => {
      const rows = await listMyBookings();
      if (active && rows) setBookings(rows);
    })();

    return () => {
      active = false;
    };
  }, [user?.id]);

  // Actions
  const openProDetail = (pro) => {
    setSelectedPro(pro);
  };

  const closeProDetail = () => {
    setSelectedPro(null);
  };

  const startBooking = (pro, preselectedService = null) => {
    setBookingPro(pro);
    setBookingPreselectedService(preselectedService || (pro.services && pro.services[0]) || null);
    if (selectedPro) setSelectedPro(null);
  };

  const closeBooking = () => {
    setBookingPro(null);
    setBookingPreselectedService(null);
  };

  const addBooking = (booking) => {
    if (!booking) return;
    setBookings((prev) => [booking, ...prev.filter((b) => b.id !== booking.id)]);
  };

  const bumpVendorEarnings = (gross) => {
    setProVendorState((prev) => {
      const commission = gross * prev.commissionRate;
      return {
        ...prev,
        totalGrossEarnings: prev.totalGrossEarnings + gross,
        availablePayout: prev.availablePayout + (gross - commission),
      };
    });
  };

  const createBooking = async (bookingData) => {
    const realBooking = await createBookingRow(bookingData);
    addBooking(realBooking);
    bumpVendorEarnings(bookingData.service?.price || 0);
    showToast(`Booking ${realBooking.id} confirmed! Check 'My Bookings' for details.`, "success");
    return realBooking;
  };

  // Cancel Booking. Policy/validation errors (e.g. cancellation window) are rethrown for the caller to show.
  const cancelBooking = async (bookingId) => {
    try {
      await cancelBookingRow(bookingId);
    } catch (err) {
      if (err?.isUserFacing) throw err;
      // ponytail: mock fallback while schema/session is unavailable — still reflect the cancel locally.
    }
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b))
    );

    let refunded = true;
    try {
      await refundPayment(bookingId);
    } catch (err) {
      refunded = false;
      showToast(err?.message || "Booking cancelled. Refund is pending gateway confirmation.", "error");
    }
    // Trigger WhatsApp cancellation notifications
    try {
      fetch('/api/notifications/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'booking_cancelled', bookingId }),
      }).catch(() => {});
    } catch {
      // non-blocking
    }

    if (refunded) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, paymentStatus: "refunded" } : b))
      );
      showToast(`Booking ${bookingId} has been cancelled and refunded to your original payment method.`, "info");
    } else {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, paymentStatus: "refund_pending" } : b))
      );
    }
  };

  // Pro marks status (e.g. In-progress or Completed). Invalid-transition errors are rethrown for the caller.
  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      await updateBookingStatusRow(bookingId, newStatus);
      if (newStatus === "completed") {
        try {
          await releasePayment(bookingId);
        } catch {
          // ponytail: escrow release is best-effort; reconcile when the payments table exists.
        }
      }
    } catch (err) {
      if (err?.isUserFacing) throw err;
      // ponytail: mock fallback while schema/session is unavailable — still reflect the status locally.
    }
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    );
    showToast(`Booking status updated to ${newStatus.replace("_", " ")}.`, "success");
  };

  // Submit Rating & Review — persists a pending review via the data layer, falling back
  // to the in-memory mock when supabase/schema is unavailable. Callers close the modal.
  const submitReview = async (bookingId, proId, rating, comment, breakdown = {}) => {
    let persisted = false;
    await submitReviewRow({ bookingId, professionalId: proId, rating, comment, breakdown });
    persisted = true;

    // 1. Mark booking as reviewed
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              hasReview: true,
              reviewRating: rating,
              reviewText: comment,
            }
          : b
      )
    );

    // 2. Reflect on the profile locally only when the review was NOT persisted (demo mode).
    //    A persisted review is "pending" and must wait for admin approval, so don't bypass moderation.
    if (!persisted) {
      const newRev = {
        id: `rev-${Date.now()}`,
        userName: customerProfile.name,
        userAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80",
        rating,
        date: "Just now",
        comment,
        breakdown,
        verifiedBooking: true,
      };

      setProfessionals((prev) =>
        prev.map((p) => {
          if (p.id === proId) {
            const newReviews = [newRev, ...p.reviews];
            const avg = (
              newReviews.reduce((sum, r) => sum + r.rating, 0) / newReviews.length
            ).toFixed(1);
            return {
              ...p,
              rating: parseFloat(avg),
              reviewCount: newReviews.length,
              reviews: newReviews,
            };
          }
          return p;
        })
      );
    }

    showToast(
      persisted
        ? "Review submitted — it will appear once approved by an admin."
        : "Thank you! Your review has been published.",
      "success"
    );
  };

  // Request Payout
  const requestPayout = async (amount, payoutDetails) => {
    const amt = parseFloat(amount);
    if (!user?.id) {
      showToast("You must be logged in to request a payout.", "error");
      return false;
    }
    
    try {
      await requestPayoutRow(user.id, amt, payoutDetails);
      showToast(`Payout request of ${formatMoney(amt)} submitted successfully!`, "success");
      return true;
    } catch (error) {
      console.error(error);
      const msg = error?.isUserFacing ? error.message : "Failed to submit payout request. Check your balance or bank details.";
      showToast(msg, "error");
      return false;
    }
  };

  // Upload verification document
  const uploadDocument = (docType, fileName) => {
    const newDoc = {
      name: fileName || "Document_Upload.pdf",
      type: docType,
      date: "Just now",
      verified: true, // auto mock verify
    };
    setProVendorState((prev) => ({
      ...prev,
      uploadedDocuments: [...prev.uploadedDocuments, newDoc],
      verificationStatus: "verified",
    }));
    showToast(`${docType} uploaded and verified successfully!`, "success");
  };

  return (
    <MarketplaceContext.Provider
      value={{
        directoryReadVersion,
        // Data
        professionals,
        filteredProfessionals,
        locations,
        isLoadingProfessionals,
        bookings,
        customerProfile,
        proVendorState,
        // Directory Filters (setters reset to page 1)
        searchQuery,
        setSearchQuery: setSearch,
        selectedCategory,
        setSelectedCategory: setCategory,
        selectedLocation,
        setSelectedLocation: setLocation,
        pincode,
        setPincode: setPincodeFilter,
        pincodeRelaxed,
        nearCoords,
        setNearCoords: setNear,
        minRating,
        setMinRating: setRating,
        minExperience,
        setMinExperience: setExperience,
        priceRange,
        setPriceRange: setPrice,
        availabilityDay,
        setAvailabilityDay: setDay,
        availabilitySlot,
        setAvailabilitySlot: setSlot,
        sortBy,
        setSortBy: setSort,
        // Pagination
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        total,
        setPage,
        // Modal Controls
        selectedPro,
        openProDetail,
        closeProDetail,
        bookingPro,
        bookingPreselectedService,
        startBooking,
        closeBooking,
        reviewBooking,
        setReviewBooking,
        isCustomerDashboardOpen,
        setIsCustomerDashboardOpen,
        isProDashboardOpen,
        setIsProDashboardOpen,
        // Actions
        createBooking,
        addBooking,
        cancelBooking,
        updateBookingStatus,
        submitReview,
        setCustomerProfile,
        requestPayout,
        uploadDocument,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error("useMarketplace must be used within a MarketplaceProvider");
  }
  return context;
}
