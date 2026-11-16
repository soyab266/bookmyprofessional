"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAuth } from "@/context/AuthContext";
import { listMyDocuments, uploadDocument } from "@/lib/data/documents";
import {
  getVendorProfile,
  updateVendorBasics,
  updateVendorSchedule,
  saveService,
  deleteService,
  saveCredential,
  deleteCredential,
  updateVendorPayoutDetails,
} from "@/lib/data/vendor-profile";
import {
  validatePayoutDetails,
  hasValidPayoutDetails,
  getBankNameFromIFSC,
  maskAccountNumber,
} from "@/lib/payout-validation";
import { getEarningsSummary, listMyPayouts } from "@/lib/data/payments";
import { getNotificationPrefs, updateNotificationPrefs } from "@/lib/data/notifications";
import { listAllCategories, listCategories, listSubcategories } from "@/lib/data/categories";
import { formatInclusions } from "@/lib/inclusions";
import { SERVICE_AREA_CITIES } from "@/lib/service-areas";
import { uploadImage, ikImage } from "@/lib/imagekit";
import { cleanPincode, isValidPincodeFormat } from "@/lib/pincode";
import PincodeInput from "@/components/PincodeInput";
import ErrorBoundary from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { generateSlotsForDay, formatTime24to12 } from "@/lib/data/bookings";
import { getDerivedBookingStatus, isBookingExpired } from "@/lib/datetime";
import {
  DollarSign,
  Building2,
  CreditCard,
  QrCode,
  X,
  TrendingUp,
  Calendar,
  Clock,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Info,
  Upload,
  ArrowUpRight,
  User,
  MapPin,
  Check,
  Play,
  RotateCcw,
  ChevronRight,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Camera,
  Briefcase,
  Plus,
  Trash2,
  Pencil,
  Lock,
  Bell,
} from "lucide-react";
import { formatMoney } from "@/lib/money";

const documentTypes = [
  "Government ID",
  "Professional License",
  "Liability Insurance",
  "Tax Certificate",
  "Trade Degree",
];

const docStatusStyles = {
  pending: "text-amber-800 bg-amber-50 border border-amber-200",
  approved: "text-emerald-800 bg-emerald-50 border border-emerald-200",
  rejected: "text-red-800 bg-red-50 border border-red-200",
};

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_SCHEDULE = {
  Monday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Tuesday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Wednesday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Thursday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Friday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Saturday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
  Sunday: { enabled: true, startTime: "09:00", endTime: "18:00", breakEnabled: false, breakStart: "13:00", breakEnd: "14:00" },
};

function parseAvailabilityToSchedule(availability) {
  if (!availability || typeof availability !== "object") return null;

  if (availability.daily && typeof availability.daily === "object" && Object.keys(availability.daily).length > 0) {
    const res = {};
    DAYS_OF_WEEK.forEach((day) => {
      const d = availability.daily[day];
      if (d) {
        res[day] = {
          enabled: Boolean(d.enabled),
          startTime: d.startTime || "09:00",
          endTime: d.endTime || "18:00",
          breakEnabled: Boolean(d.break?.enabled),
          breakStart: d.break?.start || "13:00",
          breakEnd: d.break?.end || "14:00",
        };
      } else {
        res[day] = {
          enabled: false,
          startTime: "09:00",
          endTime: "18:00",
          breakEnabled: false,
          breakStart: "13:00",
          breakEnd: "14:00",
        };
      }
    });
    return res;
  }

  if (Array.isArray(availability.days) && availability.days.length > 0) {
    const res = {};
    DAYS_OF_WEEK.forEach((day) => {
      const isDayOn = availability.days.some((d) => String(d).toLowerCase() === day.toLowerCase());
      res[day] = {
        enabled: isDayOn,
        startTime: "09:00",
        endTime: "18:00",
        breakEnabled: false,
        breakStart: "13:00",
        breakEnd: "14:00",
      };
    });
    return res;
  }

  return null;
}

export default function VendorPortalPage() {
  const { proVendorState, bookings, updateBookingStatus, requestPayout } = useMarketplace();
  const { user, showToast, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login?next=/vendor&role=professional");
      } else if (user.role !== "professional") {
        router.push("/register?role=professional");
      }
    }
  }, [isLoading, user, router]);

  const [activeTab, setActiveTab] = useState("earnings"); // "earnings" | "bookings" | "schedule" | "verification"
  const [notifPrefs, setNotifPrefs] = useState({
    whatsapp: false,
    email: true,
    bookings: true,
    announcements: true,
  });

  useEffect(() => {
    getNotificationPrefs().then((p) => {
      if (p) setNotifPrefs(p);
    });
  }, []);

  const handleVendorPrefToggle = async (key) => {
    if (!notifPrefs) return;
    const nextVal = !notifPrefs[key];
    const next = { ...notifPrefs, [key]: nextVal };
    setNotifPrefs(next);
    const saved = await updateNotificationPrefs({ [key]: nextVal });
    if (saved) {
      setNotifPrefs(saved);
      showToast("Notification preferences updated.", "success");
    } else {
      showToast("Unable to save preferences right now.", "error");
    }
  };

  const [payoutAmountInput, setPayoutAmountInput] = useState(
    proVendorState.availablePayout.toString()
  );
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);
  const [earnings, setEarnings] = useState(null);
  const [payouts, setPayouts] = useState(null);

  // Bank & UPI payout details state
  const [payoutDetails, setPayoutDetails] = useState(null);
  const [isEditingPayoutDetails, setIsEditingPayoutDetails] = useState(false);
  const [isSavingPayoutDetails, setIsSavingPayoutDetails] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    type: "bank",
    account_holder: "",
    account_number: "",
    confirm_account_number: "",
    ifsc_code: "",
    bank_name: "",
    upi_id: "",
  });

  // Weekly schedule state
  const [scheduleState, setScheduleState] = useState(() => ({ ...DEFAULT_SCHEDULE }));
  const [savedScheduleState, setSavedScheduleState] = useState(null); // null if unsaved draft
  const [isScheduleSaved, setIsScheduleSaved] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!isScheduleSaved) return true;
    return JSON.stringify(scheduleState) !== JSON.stringify(savedScheduleState);
  }, [scheduleState, savedScheduleState, isScheduleSaved]);

  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [docType, setDocType] = useState("Government ID");

  // Services, qualifications & experience
  const [vendorProfile, setVendorProfile] = useState({
    experienceYears: 0,
    specialty: "",
    city: "",
    pincode: "",
    category: "",
    subcategory: "",
    role_title: "",
    services: [],
    credentials: [],
    serviceAreas: [],
  });
  const [categoriesList, setCategoriesList] = useState([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState({});

  useEffect(() => {
    let active = true;
    listCategories().then((cats) => {
      if (active && cats) setCategoriesList(cats);
    });
    listSubcategories().then((map) => {
      if (active && map) setSubcategoriesMap(map);
    });
    return () => {
      active = false;
    };
  }, []);
  const categoryDefaults = useRef({ inclusions: "", exclusions: "" });
  const blankServiceForm = () => ({
    id: null,
    title: "",
    description: "",
    price: "",
    duration: "",
    inclusions: categoryDefaults.current.inclusions,
    exclusions: categoryDefaults.current.exclusions,
  });
  const [serviceForm, setServiceForm] = useState({
    id: null,
    title: "",
    description: "",
    price: "",
    duration: "",
    inclusions: "",
    exclusions: "",
  });
  const [credForm, setCredForm] = useState({ title: "", issuer: "", year: "" });

  useEffect(() => {
    if (!user?.id) {
      setIsLoadingDocs(false);
      return;
    }
    let active = true;
    setIsLoadingDocs(true);
    listMyDocuments(user.id)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .finally(() => {
        if (active) setIsLoadingDocs(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getVendorProfile(user.id).then((profile) => {
      if (!active || !profile) return;
      setVendorProfile(profile);
      if (profile.payout_details && typeof profile.payout_details === "object") {
        setPayoutDetails(profile.payout_details);
      }
      const parsed = parseAvailabilityToSchedule(profile.availability);
      if (parsed) {
        setScheduleState(parsed);
        setSavedScheduleState(JSON.parse(JSON.stringify(parsed)));
        setIsScheduleSaved(true);
      } else {
        // Unsaved default: NOT active!
        setScheduleState({ ...DEFAULT_SCHEDULE });
        setSavedScheduleState(null);
        setIsScheduleSaved(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Prefill new-service inclusions from the admin's category template (if the form is untouched).
  useEffect(() => {
    if (!vendorProfile.category) return;
    let active = true;
    listAllCategories().then((rows) => {
      if (!active) return;
      const cat = rows.find((c) => !c.parent_id && c.name === vendorProfile.category);
      if (!cat) return;
      categoryDefaults.current = {
        inclusions: formatInclusions(cat.inclusions),
        exclusions: formatInclusions(cat.exclusions),
      };
      setServiceForm((f) =>
        f.id || f.title || f.inclusions || f.exclusions ? f : { ...f, ...categoryDefaults.current }
      );
    });
    return () => {
      active = false;
    };
  }, [vendorProfile.category]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getEarningsSummary(user.id).then((summary) => {
      if (active && summary) setEarnings(summary);
    });
    listMyPayouts(user.id).then((rows) => {
      if (active && rows) setPayouts(rows);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // ponytail: fall back to the proVendorState mock when there is no real professional session.
  const stats = earnings || {
    gross: proVendorState.totalGrossEarnings,
    commission: proVendorState.totalGrossEarnings * proVendorState.commissionRate,
    available: proVendorState.availablePayout,
    paidOut: proVendorState.paidOutAmount,
    commissionRate: proVendorState.commissionRate,
  };

  const payoutRows =
    payouts !== null
      ? payouts.map((p) => {
          const pd = p.payout_details && typeof p.payout_details === "object" ? p.payout_details : {};
          return {
            id: p.id,
            date: p.requested_at ? new Date(p.requested_at).toLocaleDateString() : "",
            amount: Number(p.amount) || 0,
            status: p.status,
            method: p.method || "Bank Transfer",
            transactionRef: pd.transaction_ref || null,
            failureReason: pd.failure_reason || null,
            rejectionReason: pd.rejection_reason || null,
          };
        })
      : proVendorState.payoutHistory;

  const pendingPayout = payoutRows.find(
    (p) => p.status === "requested" || p.status === "processing" || (p.status === "paid" && !p.transactionRef)
  );

  useEffect(() => {
    setPayoutAmountInput(String(stats.available));
  }, [stats.available]);

  // Real-time synchronization when admin approves/rejects documents or updates verification status
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`vendor-verification-sync-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `professional_id=eq.${user.id}`,
        },
        () => {
          listMyDocuments(user.id).then((rows) => {
            if (rows) setDocuments(rows);
          });
          getVendorProfile(user.id).then((profile) => {
            if (profile) setVendorProfile(profile);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "professionals",
          filter: `id=eq.${user.id}`,
        },
        () => {
          getVendorProfile(user.id).then((profile) => {
            if (profile) setVendorProfile(profile);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Group by document type to find the latest document status per type
  const latestDocsMap = new Map();
  for (const doc of documents) {
    if (!latestDocsMap.has(doc.type)) {
      latestDocsMap.set(doc.type, doc);
    }
  }
  const latestDocs = Array.from(latestDocsMap.values());

  const hasRejectedDocs = latestDocs.some((d) => d.status === "rejected");
  const hasPendingDocs = latestDocs.some((d) => d.status === "pending");
  const hasApprovedDocs = latestDocs.length > 0 && latestDocs.every((d) => d.status === "approved");

  // Determine overall verification status:
  // 1. 'approved' if all latest uploaded documents are approved OR vendorProfile.verification_status is 'approved'
  // 2. 'rejected' if any latest document is rejected OR vendorProfile.verification_status is 'rejected'
  // 3. 'pending' if any document is pending review
  // 4. 'unverified' if no documents uploaded yet
  let verificationStatus = "not_submitted";
  if (latestDocs.length > 0) {
    // Documents are the single source of truth
    if (hasRejectedDocs) {
      verificationStatus = "rejected";
    } else if (hasPendingDocs) {
      verificationStatus = "pending";
    } else if (hasApprovedDocs) {
      verificationStatus = "approved";
    }
  } else {
    // No documents uploaded at all — can never be approved
    if (vendorProfile?.verification_status === "documents_requested") {
      verificationStatus = "documents_requested";
    } else {
      verificationStatus = "not_submitted";
    }
  }

  const allApproved = verificationStatus === "approved";

  const hasValidPayout = hasValidPayoutDetails(payoutDetails);

  const openPayoutDetailsEditor = () => {
    if (payoutDetails && typeof payoutDetails === "object") {
      setPayoutForm({
        type: payoutDetails.type || (payoutDetails.upi_id ? "upi" : "bank"),
        account_holder: payoutDetails.account_holder || "",
        account_number: payoutDetails.account_number || "",
        confirm_account_number: payoutDetails.account_number || "",
        ifsc_code: payoutDetails.ifsc_code || "",
        bank_name: payoutDetails.bank_name || "",
        upi_id: payoutDetails.upi_id || "",
      });
    } else {
      setPayoutForm({
        type: "bank",
        account_holder: vendorProfile?.name || user?.user_metadata?.full_name || "",
        account_number: "",
        confirm_account_number: "",
        ifsc_code: "",
        bank_name: "",
        upi_id: "",
      });
    }
    setIsEditingPayoutDetails(true);
  };

  const handleSavePayoutDetails = async (e) => {
    e.preventDefault();
    if (payoutForm.type === "bank") {
      if (payoutForm.account_number !== payoutForm.confirm_account_number) {
        showToast("Bank account numbers do not match.", "error");
        return;
      }
    }
    const validation = validatePayoutDetails(payoutForm);
    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0] || "Please check payout details.";
      showToast(firstErr, "error");
      return;
    }

    if (!user?.id) {
      showToast("Please sign in to update payout details.", "error");
      return;
    }

    setIsSavingPayoutDetails(true);
    try {
      const saved = await updateVendorPayoutDetails(user.id, payoutForm);
      setPayoutDetails(saved);
      setVendorProfile((prev) => ({ ...prev, payout_details: saved }));
      setIsEditingPayoutDetails(false);
      showToast("Payout details saved and verified successfully!", "success");
    } catch (err) {
      showToast(err?.message || "Failed to save payout details.", "error");
    } finally {
      setIsSavingPayoutDetails(false);
    }
  };

  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    if (!hasValidPayout) {
      showToast("Add bank details to request a payout.", "error");
      openPayoutDetailsEditor();
      return;
    }
    const amt = parseFloat(payoutAmountInput);
    if (!amt || amt <= 0) {
      showToast("Please enter a valid payout amount.", "error");
      return;
    }
    if (amt > stats.available) {
      showToast("Requested amount exceeds available balance.", "error");
      return;
    }
    const success = await requestPayout(amt, payoutDetails);
    if (success) {
      setIsRequestingPayout(false);
      if (user?.id) {
        const rows = await listMyPayouts(user.id);
        if (rows) setPayouts(rows);
        const summary = await getEarningsSummary(user.id);
        if (summary) setEarnings(summary);
      }
    }
  };

  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      showToast("Please sign in to upload verification documents.", "error");
      return;
    }

    setIsUploading(true);
    try {
      await uploadDocument(user.id, file, docType);
      const rows = await listMyDocuments(user.id);
      if (rows) setDocuments(rows);
      const profile = await getVendorProfile(user.id);
      if (profile) setVendorProfile(profile);
      showToast(`${docType} uploaded. Pending admin review.`, "success");
    } catch (error) {
      showToast(error?.message || "Upload failed. Please try again.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!requireSignIn()) return;
    setIsSavingSchedule(true);
    try {
      // Validate per-day times
      for (const day of DAYS_OF_WEEK) {
        const d = scheduleState[day];
        if (d.enabled) {
          if (!d.startTime || !d.endTime) {
            throw new Error(`Please specify both start and closing times for ${day}.`);
          }
          if (d.startTime >= d.endTime) {
            throw new Error(`On ${day}, closing time (${formatTime24to12(d.endTime)}) must be after start time (${formatTime24to12(d.startTime)}).`);
          }
          if (d.breakEnabled) {
            if (!d.breakStart || !d.breakEnd) {
              throw new Error(`Please specify both break start and end times for ${day}.`);
            }
            if (d.breakStart >= d.breakEnd) {
              throw new Error(`On ${day}, break end time must be after break start time.`);
            }
            if (d.breakStart < d.startTime || d.breakEnd > d.endTime) {
              throw new Error(`On ${day}, break must be within working hours (${formatTime24to12(d.startTime)} - ${formatTime24to12(d.endTime)}).`);
            }
          }
        }
      }

      const daily = {};
      const activeDays = [];
      const allSlotsSet = new Set();
      const hoursParts = [];

      DAYS_OF_WEEK.forEach((day) => {
        const d = scheduleState[day];
        const dayConfig = {
          enabled: Boolean(d.enabled),
          startTime: d.startTime,
          endTime: d.endTime,
          break: {
            enabled: Boolean(d.breakEnabled),
            start: d.breakStart,
            end: d.breakEnd,
          },
        };
        daily[day] = dayConfig;
        if (d.enabled) {
          activeDays.push(day);
          const slots = generateSlotsForDay(dayConfig);
          slots.forEach((s) => allSlotsSet.add(s));
          hoursParts.push(`${day.substring(0, 3)} ${formatTime24to12(d.startTime)} - ${formatTime24to12(d.endTime)}`);
        }
      });

      const availability = {
        daily,
        days: activeDays,
        hours: hoursParts.join(", ") || "Closed",
        slots: Array.from(allSlotsSet),
      };

      await updateVendorSchedule(user.id, availability);
      setVendorProfile((prev) => ({ ...prev, availability }));
      setSavedScheduleState(JSON.parse(JSON.stringify(scheduleState)));
      setIsScheduleSaved(true);
      showToast("Operating schedule saved and published successfully!", "success");
    } catch (err) {
      showToast(err?.message || "Could not save your schedule.", "error");
    } finally {
      setIsSavingSchedule(false);
    }
  };

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
      const supabase = createClient();
      const { error } = await supabase
        .from("professionals")
        .update({ image_url: url })
        .eq("id", user.id);
      
      // Update local state even if supabase fails
      setVendorProfile(prev => ({ ...prev, image_url: url }));
      
      if (error) throw error;
      showToast("Profile photo updated.", "success");
    } catch (err) {
      showToast(err?.message || "Photo upload failed. Please try again.", "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleStatusChange = async (bookingId, newStatus) => {
    try {
      await updateBookingStatus(bookingId, newStatus);
    } catch (err) {
      showToast(err?.message || "Could not update the booking status.", "error");
    }
  };

  const requireSignIn = () => {
    if (!user?.id) {
      showToast("Please sign in to manage your professional profile.", "error");
      return false;
    }
    return true;
  };

  const handleBasicsSave = async (e) => {
    e.preventDefault();
    if (vendorProfile.pincode) {
      const cleanPin = cleanPincode(vendorProfile.pincode);
      if (!isValidPincodeFormat(cleanPin)) {
        showToast("Please enter a valid 6-digit Indian pincode (cannot start with 0).", "error");
        return;
      }
    }
    try {
      const result = await updateVendorBasics(user.id, {
        experienceYears: Number(vendorProfile.experienceYears) || 0,
        specialty: vendorProfile.specialty,
        city: vendorProfile.city,
        pincode: cleanPincode(vendorProfile.pincode),
        hourlyRate: Number(vendorProfile.hourlyRate) || 0,
        category: vendorProfile.category,
        subcategory: vendorProfile.subcategory,
        role_title: vendorProfile.role_title,
        serviceAreas: vendorProfile.serviceAreas,
      });
      if (result?.serviceAreasPersisted === false) {
        // The base profile saved but the area selection did not (column not
        // yet applied) - restore the picker to the persisted truth and say so.
        const profile = await getVendorProfile(user.id).catch(() => null);
        if (profile) setVendorProfile((prev) => ({ ...prev, serviceAreas: profile.serviceAreas || [] }));
        showToast(
          "Profile saved, but your Areas served selection was NOT stored yet (directory upgrade pending). Please leave it unset for now.",
          "error"
        );
      } else {
        showToast("Profile, title & experience saved.", "success");
      }
    } catch (err) {
      // Genuine save failure: restore the picker to the persisted truth so it
      // never shows a selection that was not stored.
      const profile = await getVendorProfile(user.id).catch(() => null);
      if (profile) setVendorProfile((prev) => ({ ...prev, serviceAreas: profile.serviceAreas || [] }));
      showToast(err?.message || "Could not save your profile.", "error");
    }
  };

  const handleServiceSubmit = async (e) => {
    e.preventDefault();
    if (!requireSignIn()) return;
    const isEdit = Boolean(serviceForm.id);
    try {
      const services = await saveService(user.id, serviceForm);
      setVendorProfile((prev) => ({ ...prev, services }));
      setServiceForm(blankServiceForm());
      showToast(isEdit ? "Service updated." : "Service added.", "success");
    } catch (err) {
      showToast(err?.message || "Could not save the service.", "error");
    }
  };

  const handleServiceDelete = async (id) => {
    if (!requireSignIn()) return;
    try {
      const services = await deleteService(user.id, id);
      setVendorProfile((prev) => ({ ...prev, services }));
      showToast("Service removed.", "info");
    } catch (err) {
      showToast(err?.message || "Could not remove the service.", "error");
    }
  };

  const handleCredSubmit = async (e) => {
    e.preventDefault();
    if (!requireSignIn()) return;
    try {
      const credentials = await saveCredential(user.id, credForm);
      setVendorProfile((prev) => ({ ...prev, credentials }));
      setCredForm({ title: "", issuer: "", year: "" });
      showToast("Qualification added.", "success");
    } catch (err) {
      showToast(err?.message || "Could not add the qualification.", "error");
    }
  };

  const handleCredDelete = async (id) => {
    if (!requireSignIn()) return;
    try {
      const credentials = await deleteCredential(user.id, id);
      setVendorProfile((prev) => ({ ...prev, credentials }));
      showToast("Qualification removed.", "info");
    } catch (err) {
      showToast(err?.message || "Could not remove the qualification.", "error");
    }
  };

  const proBookings = bookings;

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
            <span className="text-dark-900 font-semibold">Professional Vendor Portal</span>
          </div>
        </div>
      </div>

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          {/* TOP VENDOR HERO BANNER */}
          <div className="bg-surface rounded-2xl border border-border p-6 sm:p-8 shadow-card mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold font-heading text-2xl shadow-soft overflow-hidden shrink-0 border border-border">
                  {vendorProfile?.image_url ? (
                    <img src={ikImage(vendorProfile.image_url)} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <ShieldCheck className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-heading text-xl sm:text-2xl font-bold text-dark-900">
                      {user?.name || vendorProfile?.name || "Professional"}
                    </h1>
                  </div>
                  <p className="text-xs font-semibold text-primary-600 mt-0.5">
                    {vendorProfile?.role_title || vendorProfile?.subcategory || vendorProfile?.category || "Professional"}
                    {vendorProfile?.category && (vendorProfile?.role_title || vendorProfile?.subcategory) && (
                      <span className="text-dark-400 font-normal"> • {vendorProfile.category}</span>
                    )}
                  </p>
                  <div>
                    {verificationStatus === "approved" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <Check className="w-3.5 h-3.5 stroke-[3]" /> Verified Pro
                      </span>
                    ) : verificationStatus === "rejected" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                        <AlertCircle className="w-3.5 h-3.5" /> Verification Rejected
                      </span>
                    ) : verificationStatus === "pending" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                        <Clock className="w-3.5 h-3.5" /> Pending Verification
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-dark-600 bg-dark-100 px-2.5 py-0.5 rounded-full border border-border">
                        <AlertCircle className="w-3.5 h-3.5" /> Unverified
                      </span>
                    )}
                    {!isScheduleSaved ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                        <Clock className="w-3.5 h-3.5" /> Not bookable yet
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <Calendar className="w-3.5 h-3.5" /> Bookable
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-dark-500 mt-0.5">
                    Vendor ID: {user?.id?.substring(0, 8) || "..."} • {Math.round((stats.commissionRate ?? 0.1) * 100)}% Platform Commission Tier
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    isUploadingPhoto
                      ? "bg-dark-100 text-dark-400 cursor-wait"
                      : "border border-border hover:bg-dark-50 text-dark-700 cursor-pointer"
                  }`}
                >
                  {isUploadingPhoto ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-dark-400 border-t-transparent rounded-full animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      Change profile photo
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={isUploadingPhoto}
                  />
                </label>
                <Link
                  href={`/professionals/${user?.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border hover:bg-dark-50 text-dark-700 text-xs font-semibold transition-colors"
                >
                  <span>View Public Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* DYNAMIC VERIFICATION BANNER */}
          {verificationStatus === "approved" ? (
            <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-xs">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Verification Completed</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  All of your verification documents have been reviewed and approved by the admin team. Your profile is verified and publicly active.
                </p>
              </div>
            </div>
          ) : verificationStatus === "rejected" ? (
            <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl border border-red-200 bg-red-50 shadow-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-800">Verification Needs Attention</p>
                <p className="text-xs text-red-700 mt-0.5">
                  One or more of your documents was rejected by the admin team. Please open the <strong>Documents &amp; Verification</strong> tab to review the feedback and re-upload valid documents.
                </p>
              </div>
            </div>
          ) : verificationStatus === "pending" ? (
            <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 shadow-xs">
              <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Pending Verification</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your verification documents have been uploaded and are currently being reviewed by our compliance team. Your profile will be active in the public directory once approved.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl border border-blue-200 bg-blue-50 shadow-xs">
              <FileCheck className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Documents Required for Verification</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Your profile is hidden from the public directory until an admin approves all of your verification documents. Please upload them in the <strong>Documents &amp; Verification</strong> tab.
                </p>
              </div>
            </div>
          )}

          {/* DASHBOARD TABS AND CONTENT */}
          <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex border-b border-border px-6 bg-dark-50/50 gap-6 overflow-x-auto no-scrollbar">
              {[
                { id: "earnings", label: "Earnings & Payouts", icon: DollarSign },
                { id: "bookings", label: `Client Bookings (${proBookings.length})`, icon: Calendar },
                { id: "schedule", label: "Working Hours & Schedule", icon: Clock },
                { id: "services", label: "Services & Experience", icon: Briefcase },
                { id: "verification", label: "Documents & Verification", icon: FileCheck },
                { id: "settings", label: "Notification Settings", icon: Bell },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
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
              <ErrorBoundary key={activeTab}>
              {/* TAB 1: EARNINGS & PAYOUTS */}
              {activeTab === "earnings" && (
                <div className="space-y-8">
                  {/* Financial Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 bg-surface rounded-2xl border border-border shadow-xs">
                      <span className="text-xs font-medium text-dark-500 block">
                        Total Gross Bookings
                      </span>
                      <span className="text-2xl font-bold font-heading text-dark-900 block mt-1.5">
                        {formatMoney(stats.gross)}
                      </span>
                      <span className="text-xs text-emerald-600 mt-1 block font-medium">
                        From completed client sessions
                      </span>
                    </div>

                    <div className="p-5 bg-surface rounded-2xl border border-border shadow-xs">
                      <span className="text-xs font-medium text-dark-500 block">
                        Platform Fee ({Math.round(stats.commissionRate * 100)}%)
                      </span>
                      <span className="text-2xl font-bold font-heading text-dark-600 block mt-1.5">
                        {formatMoney(stats.commission)}
                      </span>
                      <span className="text-xs text-dark-400 mt-1 block">
                        Standard escrow commission
                      </span>
                    </div>

                    <div className="p-5 bg-emerald-50/60 rounded-2xl border border-emerald-200 shadow-xs">
                      <span className="text-xs font-medium text-emerald-800 block">
                        Available for Payout
                      </span>
                      <span className="text-2xl font-bold font-heading text-emerald-700 block mt-1.5">
                        {formatMoney(stats.available)}
                      </span>
                      <span className="text-xs text-emerald-600 mt-1 block font-medium">
                        Ready for instant withdrawal
                      </span>
                    </div>

                    <div className="p-5 bg-surface rounded-2xl border border-border shadow-xs">
                      <span className="text-xs font-medium text-dark-500 block">
                        Paid Out (Credited to Bank)
                      </span>
                      <span className="text-2xl font-bold font-heading text-dark-900 block mt-1.5">
                        {formatMoney(stats.paidOut)}
                      </span>
                      <span className="text-xs text-dark-400 mt-1 block">
                        Direct to verified bank account with UTR
                      </span>
                    </div>
                  </div>

                  {/* PENDING WITHDRAWALS NOTICE */}
                  {stats.pendingWithdrawals > 0 && (
                    <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                          <Clock className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-950 text-sm">
                              Unpaid Payout in Transfer Queue: {formatMoney(stats.pendingWithdrawals)}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-amber-800 bg-amber-200/70 border border-amber-300 px-2 py-0.5 rounded-full">
                              Unpaid
                            </span>
                          </div>
                          <span className="text-amber-800 text-[11px] mt-0.5 block">
                            Requested by you and awaiting manual bank transfer by our finance team. Money shows as &quot;Paid&quot; only once credited to your bank with a verified UTR number.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payout Destination Details Card */}
                  <div className={`p-5 rounded-2xl border transition-all ${hasValidPayout ? "bg-surface border-border shadow-xs" : "bg-amber-50/70 border-amber-200"}`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${hasValidPayout ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {hasValidPayout ? (
                            payoutDetails?.type === "upi" ? <QrCode className="w-5 h-5" /> : <Building2 className="w-5 h-5" />
                          ) : (
                            <AlertCircle className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-heading text-sm font-bold text-dark-900">
                              {hasValidPayout ? "Verified Payout Destination" : "Payout Details Required"}
                            </h4>
                            {hasValidPayout ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <Check className="w-3 h-3 stroke-[2.5]" /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                                Action Required
                              </span>
                            )}
                          </div>
                          {hasValidPayout ? (
                            <div className="text-xs text-dark-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              {payoutDetails?.type === "upi" ? (
                                <>
                                  <span className="font-semibold text-dark-800">UPI ID: {payoutDetails.upi_id}</span>
                                  {payoutDetails.account_holder && <span>• Name: {payoutDetails.account_holder}</span>}
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold text-dark-800">{payoutDetails?.bank_name || "Bank Account"}</span>
                                  <span>• A/C: {maskAccountNumber(payoutDetails?.account_number)}</span>
                                  <span>• IFSC: <span className="font-mono">{payoutDetails?.ifsc_code}</span></span>
                                  {payoutDetails?.account_holder && <span>• Holder: {payoutDetails.account_holder}</span>}
                                </>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-amber-900 mt-1 font-medium">
                              Add bank details to request a payout. Withdrawals cannot be requested without a verified bank account or UPI ID.
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={openPayoutDetailsEditor}
                        className={`py-2 px-4 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${hasValidPayout ? "border border-border text-dark-700 hover:bg-dark-50" : "bg-amber-600 hover:bg-amber-700 text-white shadow-button"}`}
                      >
                        {hasValidPayout ? (
                          <>
                            <Pencil className="w-3.5 h-3.5" /> Edit Bank / UPI
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" /> Add Bank Details
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Request Payout Action Box */}
                  <div className="p-6 bg-gradient-to-r from-primary-900 to-dark-900 rounded-2xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-soft">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-white">
                        Withdraw Your Earnings
                      </h3>
                      <p className="text-xs text-white/80 mt-1">
                        {hasValidPayout
                          ? `Direct transfer to your verified ${payoutDetails?.type === "upi" ? `UPI ID (${payoutDetails.upi_id})` : `bank account (ending in ${payoutDetails?.account_number?.slice(-4) || ""})`}.`
                          : "Add your bank account or UPI details above to unlock instant withdrawals."}
                      </p>
                    </div>

                    {isRequestingPayout ? (
                      <form
                        onSubmit={handlePayoutSubmit}
                        className="flex items-center gap-2.5 w-full md:w-auto"
                      >
                        <input
                          type="number"
                          step="0.01"
                          max={stats.available}
                          value={payoutAmountInput}
                          onChange={(e) => setPayoutAmountInput(e.target.value)}
                          className="px-3.5 py-2.5 bg-white text-dark-900 rounded-xl text-xs font-bold w-32 focus:outline-none"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          className="text-xs py-2.5 bg-emerald-500 hover:bg-emerald-600 shadow-button"
                        >
                          Confirm
                        </Button>
                        <button
                          type="button"
                          onClick={() => setIsRequestingPayout(false)}
                          className="text-xs text-white/80 hover:text-white px-2"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex flex-col items-start md:items-end gap-1.5 w-full md:w-auto">
                        <Button
                          variant="primary"
                          size="md"
                          disabled={stats.available <= 0 || !hasValidPayout || !!pendingPayout}
                          onClick={() => {
                            if (!hasValidPayout) {
                              showToast("Add bank details to request a payout.", "error");
                              openPayoutDetailsEditor();
                              return;
                            }
                            if (pendingPayout) {
                              showToast("You already have a payout transfer in progress. Please wait for it to complete.", "info");
                              return;
                            }
                            if (stats.available <= 0) {
                              showToast("You currently have ₹0.00 available to withdraw. Complete client bookings to earn balance.", "info");
                              return;
                            }
                            setIsRequestingPayout(true);
                          }}
                          className={`font-semibold text-xs py-3 px-6 shadow-button ${!hasValidPayout || stats.available <= 0 || !!pendingPayout ? "opacity-60 cursor-not-allowed bg-dark-700 hover:bg-dark-700" : "bg-primary-500 hover:bg-primary-600"}`}
                        >
                          <ArrowUpRight className="w-4 h-4 mr-1.5" />
                          {pendingPayout
                            ? `Payout In Progress (${formatMoney(pendingPayout.amount)})`
                            : `Request Instant Payout (${formatMoney(stats.available)})`}
                        </Button>
                        {!hasValidPayout ? (
                          <span className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Add bank details to request a payout.
                          </span>
                        ) : pendingPayout ? (
                          <span className="text-[11px] text-blue-200 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-300 animate-spin" /> Transfer of {formatMoney(pendingPayout.amount)} is {pendingPayout.status === 'processing' ? 'being processed by finance' : 'in queue for manual transfer'}.
                          </span>
                        ) : stats.available <= 0 ? (
                          <span className="text-[11px] text-white/75 font-medium flex items-center gap-1">
                            <Info className="w-3 h-3 text-white/70" /> Balance is {formatMoney(stats.available)}. Payouts unlock once client bookings are completed.
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-300" /> Ready to withdraw to verified destination.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payout History Table */}
                  <div className="space-y-4">
                    <h3 className="font-heading text-base font-bold text-dark-900">
                      Recent Payouts History
                    </h3>
                    <div className="border border-border rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-dark-50 text-dark-700 font-bold border-b border-border">
                          <tr>
                            <th className="p-4">Payout ID</th>
                            <th className="p-4">Date</th>
                            <th className="p-4">Destination</th>
                            <th className="p-4">Amount</th>
                            <th className="p-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {payoutRows.map((p) => (
                            <tr key={p.id} className="hover:bg-dark-50/50 transition-colors">
                              <td className="p-4 font-mono font-bold text-dark-900">{p.id}</td>
                              <td className="p-4 text-dark-600" suppressHydrationWarning>{p.date}</td>
                              <td className="p-4 text-dark-600">{p.method}</td>
                              <td className="p-4 font-bold text-emerald-700">{formatMoney(Number(p.amount))}</td>
                              <td className="p-4">
                                {p.status === "paid" && (
                                  <div className="space-y-0.5">
                                    {p.transactionRef ? (
                                      <>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Paid (Credited to Bank)
                                        </span>
                                        <div className="text-[10px] text-dark-500 font-mono">
                                          UTR: <span className="font-bold text-dark-800 select-all">{p.transactionRef}</span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                                          <Clock className="w-3 h-3 text-amber-600" /> Unpaid (Pending Bank Transfer)
                                        </span>
                                        <div className="text-[10px] text-amber-700 font-medium">Awaiting bank credit confirmation</div>
                                      </>
                                    )}
                                  </div>
                                )}
                                {p.status === "processing" && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                                      <Clock className="w-3 h-3 animate-spin text-blue-600" /> Unpaid (Processing Transfer)
                                    </span>
                                    <div className="text-[10px] text-blue-600 font-medium">Bank transfer in progress</div>
                                  </div>
                                )}
                                {p.status === "requested" && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                                      <Clock className="w-3 h-3 text-amber-600" /> Unpaid (Payout Requested)
                                    </span>
                                    <div className="text-[10px] text-amber-600 font-medium">In queue for admin transfer</div>
                                  </div>
                                )}
                                {p.status === "failed" && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
                                      <AlertCircle className="w-3 h-3 text-red-600" /> Unpaid (Transfer Failed)
                                    </span>
                                    <div className="text-[10px] text-red-600 font-medium">Funds refunded to available balance</div>
                                    {p.failureReason && (
                                      <div className="text-[10px] text-red-500 max-w-xs">{p.failureReason}</div>
                                    )}
                                  </div>
                                )}
                                {p.status === "rejected" && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                                      <X className="w-3 h-3 text-rose-600" /> Unpaid (Request Rejected)
                                    </span>
                                    <div className="text-[10px] text-rose-600 font-medium">Funds refunded to available balance</div>
                                    {p.rejectionReason && (
                                      <div className="text-[10px] text-rose-500 max-w-xs">{p.rejectionReason}</div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CLIENT BOOKINGS */}
              {activeTab === "bookings" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Client Appointments & Requests
                    </h3>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Update booking status in real-time as you start and complete services for clients.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {proBookings.map((b) => (
                      <div
                        key={b.id}
                        className="p-5 sm:p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-bold text-dark-900 bg-dark-50 px-2.5 py-0.5 rounded">
                              #{b.id}
                            </span>
                            <span className="text-dark-300">•</span>
                            <span className="text-xs text-dark-700 font-bold">{b.serviceTitle}</span>
                          </div>
                          <span className="text-xs font-bold text-primary-600 uppercase">
                            Status: {getDerivedBookingStatus(b).replace("_", " ")}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                          <div>
                            <span className="text-[11px] text-dark-400 block font-medium">Customer</span>
                            <span className="font-bold text-dark-900 block mt-0.5">{b.customerName}</span>
                            <span className="text-dark-500">{b.customerPhone}</span>
                          </div>

                          <div>
                            <span className="text-[11px] text-dark-400 block font-medium">Scheduled Time</span>
                            <span className="font-bold text-dark-900 block mt-0.5">
                              {b.date} at {b.timeSlot}
                            </span>
                            <span className="text-dark-500 truncate block">{b.address}</span>
                          </div>

                          <div>
                            <span className="text-[11px] text-dark-400 block font-medium">
                              Net Payout (After 10% Fee)
                            </span>
                            <span className="font-bold text-emerald-700 text-sm block mt-0.5">
                              {formatMoney((b.servicePrice * 0.9))}
                            </span>
                            <span className="text-dark-400 text-[10px]">Held securely in escrow</span>
                          </div>
                        </div>

                        {/* Status Changer Actions */}
                        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-dark-500 italic">
                            Customer Notes: {b.customerNotes}
                          </span>

                          <div className="flex items-center gap-2.5">
                            <Link
                              href={`/messages?booking=${b.id}`}
                              className="py-2 px-3.5 rounded-xl border border-border hover:bg-dark-50 text-dark-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Message
                            </Link>
                            {(() => {
                              const derivedStatus = getDerivedBookingStatus(b);
                              if (derivedStatus === "missed") return (
                                <span className="text-xs text-orange-700 font-semibold bg-orange-50 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5" /> Missed — Contact Customer
                                </span>
                              );
                              if (derivedStatus === "upcoming") return (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(b.id, "in_progress")}
                                  className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                                >
                                  <Play className="w-3.5 h-3.5" /> Start Service
                                </button>
                              );
                              return null;
                            })()}
                            {b.status === "in_progress" && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b.id, "completed")}
                                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" /> Mark Completed & Release Escrow
                              </button>
                            )}
                            {b.status === "completed" && (
                              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl">
                                ✓ Payout Credited to Balance
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: SCHEDULE */}
              {activeTab === "schedule" && (
                <div className="space-y-6 max-w-3xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-dark-900">
                        Weekly Operating Availability & Per-Day Schedule
                      </h3>
                      <p className="text-xs text-dark-500 mt-0.5">
                        Configure working hours and break periods independently for each day of the week.
                      </p>
                    </div>

                    {!isScheduleSaved ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 self-start sm:self-auto">
                        <Clock className="w-3.5 h-3.5" /> Not bookable yet
                      </span>
                    ) : hasUnsavedChanges ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 self-start sm:self-auto">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Unsaved changes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
                        <Check className="w-3.5 h-3.5 stroke-[3]" /> Schedule published
                      </span>
                    )}
                  </div>

                  {/* NOT BOOKABLE YET BANNER */}
                  {!isScheduleSaved && (
                    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 text-amber-900 flex items-start gap-3 shadow-xs">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[11px] uppercase tracking-wider bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                            Not Bookable Yet
                          </span>
                          <span className="text-xs font-bold text-amber-950">
                            Unsaved Schedule Draft (Inactive)
                          </span>
                        </div>
                        <p className="text-xs text-amber-800 mt-1">
                          Your operating schedule is currently not published. Customers cannot book slots until you customize your hours below and click <strong>Save Operating Schedule</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* UNSAVED CHANGES BANNER */}
                  {hasUnsavedChanges && isScheduleSaved && (
                    <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-900 flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="font-bold">You have unsaved schedule changes</span>
                        <span className="text-blue-700 hidden sm:inline">— Public booking form will only show previously saved hours until you click Save.</span>
                      </div>
                      <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
                        Draft
                      </span>
                    </div>
                  )}

                  {/* 2-HOUR CLOSING RULE NOTE */}
                  <div className="p-3.5 rounded-xl border border-border bg-dark-50 text-dark-700 flex items-start gap-2.5 text-xs">
                    <Info className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-dark-900">Last bookable slot is 2 hours before closing: </span>
                      <span>To allow sufficient appointment duration and service completion, the final customer slot of each day ends strictly 2 hours prior to your closing time.</span>
                    </div>
                  </div>

                  {/* PER-DAY SCHEDULE LIST */}
                  <div className="space-y-3">
                    {DAYS_OF_WEEK.map((day) => {
                      const dayState = scheduleState[day] || DEFAULT_SCHEDULE[day];
                      const isDayOpen = Boolean(dayState.enabled);

                      return (
                        <div
                          key={day}
                          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                            isDayOpen
                              ? "bg-surface border-border shadow-xs"
                              : "bg-dark-50/60 border-dashed border-border/80 opacity-75"
                          }`}
                        >
                          {/* Day Header Row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-heading text-sm font-bold text-dark-900">{day}</span>
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                  isDayOpen
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-dark-100 text-dark-500 border border-dark-200"
                                }`}
                              >
                                {isDayOpen ? "Open / Available" : "Closed / Off"}
                              </span>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isDayOpen}
                                onChange={(e) =>
                                  setScheduleState((prev) => ({
                                    ...prev,
                                    [day]: { ...prev[day], enabled: e.target.checked },
                                  }))
                                }
                                className="rounded text-primary-500 focus:ring-primary-500 h-4 w-4"
                              />
                              <span className="text-xs text-dark-700 font-medium">
                                {isDayOpen ? "Available" : "Closed"}
                              </span>
                            </label>
                          </div>

                          {/* When Day is Open */}
                          {isDayOpen ? (
                            <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-dark-700 mb-1">
                                    Start Time
                                  </label>
                                  <input
                                    type="time"
                                    value={dayState.startTime || "09:00"}
                                    onChange={(e) =>
                                      setScheduleState((prev) => ({
                                        ...prev,
                                        [day]: { ...prev[day], startTime: e.target.value },
                                      }))
                                    }
                                    className="w-full px-3 py-2 bg-dark-50 border border-border rounded-xl text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-dark-700 mb-1">
                                    Closing Time
                                  </label>
                                  <input
                                    type="time"
                                    value={dayState.endTime || "18:00"}
                                    onChange={(e) =>
                                      setScheduleState((prev) => ({
                                        ...prev,
                                        [day]: { ...prev[day], endTime: e.target.value },
                                      }))
                                    }
                                    className="w-full px-3 py-2 bg-dark-50 border border-border rounded-xl text-xs"
                                  />
                                </div>
                              </div>

                              {/* Break toggle & inputs */}
                              <div className="pt-2 border-t border-dashed border-border/60">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-dark-700 font-medium">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(dayState.breakEnabled)}
                                    onChange={(e) =>
                                      setScheduleState((prev) => ({
                                        ...prev,
                                        [day]: { ...prev[day], breakEnabled: e.target.checked },
                                      }))
                                    }
                                    className="rounded text-primary-500 focus:ring-primary-500 h-3.5 w-3.5"
                                  />
                                  <span>Optional break (e.g. lunch hour)</span>
                                </label>
                                {dayState.breakEnabled && (
                                  <div className="grid grid-cols-2 gap-3 mt-2.5 pl-5">
                                    <div>
                                      <label className="block text-[11px] font-semibold text-dark-600 mb-1">
                                        Break Start
                                      </label>
                                      <input
                                        type="time"
                                        value={dayState.breakStart || "13:00"}
                                        onChange={(e) =>
                                          setScheduleState((prev) => ({
                                            ...prev,
                                            [day]: { ...prev[day], breakStart: e.target.value },
                                          }))
                                        }
                                        className="w-full px-2.5 py-1.5 bg-dark-50 border border-border rounded-lg text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-semibold text-dark-600 mb-1">
                                        Break End
                                      </label>
                                      <input
                                        type="time"
                                        value={dayState.breakEnd || "14:00"}
                                        onChange={(e) =>
                                          setScheduleState((prev) => ({
                                            ...prev,
                                            [day]: { ...prev[day], breakEnd: e.target.value },
                                          }))
                                        }
                                        className="w-full px-2.5 py-1.5 bg-dark-50 border border-border rounded-lg text-xs"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Live Slots Calculation Preview */}
                              {(() => {
                                const slots = generateSlotsForDay({
                                  enabled: true,
                                  startTime: dayState.startTime,
                                  endTime: dayState.endTime,
                                  break: {
                                    enabled: dayState.breakEnabled,
                                    start: dayState.breakStart,
                                    end: dayState.breakEnd,
                                  },
                                });
                                const lastSlot = slots[slots.length - 1];
                                return (
                                  <div className="p-2.5 bg-primary-50/50 rounded-xl border border-primary-100 text-[11px] text-dark-600 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                    <div>
                                      <strong className="text-primary-800 font-semibold">
                                        {slots.length} bookable slot{slots.length === 1 ? "" : "s"}:
                                      </strong>{" "}
                                      <span>
                                        {slots.length
                                          ? slots.slice(0, 5).join(", ") +
                                            (slots.length > 5 ? ` +${slots.length - 5} more` : "")
                                          : "None configured"}
                                      </span>
                                    </div>
                                    {lastSlot && (
                                      <span className="text-primary-700 font-semibold shrink-0">
                                        Last slot: {lastSlot}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-dark-400 italic">
                              Closed on this day. No slots will be offered to customers.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* BOTTOM SAVE CONTROLS */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t border-border">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSaveSchedule}
                      disabled={isSavingSchedule}
                      className="font-semibold shadow-button text-xs py-3 px-6"
                    >
                      {isSavingSchedule ? "Saving Schedule..." : "Save Operating Schedule"}
                    </Button>
                    {hasUnsavedChanges ? (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Unsaved changes (click Save Operating Schedule to publish)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        Published & in sync with public booking form
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: SERVICES & EXPERIENCE */}
              {activeTab === "services" && (
                <div className="space-y-10 max-w-3xl">
                  {/* Experience & service location */}
                  <form onSubmit={handleBasicsSave} className="space-y-4">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-dark-900">
                        Experience & Service Location
                      </h3>
                      <p className="text-xs text-dark-500 mt-0.5">
                        Shown on your public profile to help customers pick the right expert.
                      </p>
                    </div>
                    {(() => {
                      const availableSubs = subcategoriesMap[vendorProfile.category] || [];
                      return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Professional Title / Headline */}
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Professional Title / Headline
                        </label>
                        <input
                          type="text"
                          value={vendorProfile.role_title || ""}
                          onChange={(e) =>
                            setVendorProfile({ ...vendorProfile, role_title: e.target.value })
                          }
                          placeholder="e.g. Senior Consultant Cardiologist, Expert Web Developer"
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-medium"
                        />
                        <p className="text-[10px] text-dark-400 mt-1">
                          This headline appears directly under your name on directory cards and your public profile.
                        </p>
                      </div>

                      {/* Industry Category */}
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Industry Category
                        </label>
                        <select
                          value={vendorProfile.category || ""}
                          onChange={(e) => {
                            const newCat = e.target.value;
                            setVendorProfile((prev) => ({
                              ...prev,
                              category: newCat,
                              subcategory: "",
                            }));
                          }}
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Select Category</option>
                          {categoriesList.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Specialty Subcategory */}
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Specialty Subcategory
                        </label>
                        {availableSubs.length > 0 ? (
                          <select
                            value={vendorProfile.subcategory || ""}
                            onChange={(e) => {
                              const sub = e.target.value;
                              setVendorProfile((prev) => ({
                                ...prev,
                                subcategory: sub,
                                role_title: (!prev.role_title || prev.role_title === "Professional" || prev.role_title === prev.category) ? sub : prev.role_title,
                              }));
                            }}
                            className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-medium text-primary-700 bg-primary-50/20"
                          >
                            <option value="">Select Specialty</option>
                            {availableSubs.map((sub) => (
                              <option key={sub} value={sub}>
                                {sub}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={vendorProfile.subcategory || ""}
                            onChange={(e) =>
                              setVendorProfile({ ...vendorProfile, subcategory: e.target.value })
                            }
                            placeholder="e.g. General"
                            className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                          />
                        )}
                        <p className="text-[10px] text-dark-400 mt-1">
                          {availableSubs.length > 0
                            ? `${availableSubs.length} specialties available under ${vendorProfile.category}`
                            : "Specialty under your category"}
                        </p>
                      </div>

                      {/* Years of Experience */}
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Years of Experience
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={vendorProfile.experienceYears}
                          onChange={(e) =>
                            setVendorProfile({ ...vendorProfile, experienceYears: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Base Hourly Rate */}
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Base Hourly Rate (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={vendorProfile.hourlyRate || ""}
                          onChange={(e) =>
                            setVendorProfile({ ...vendorProfile, hourlyRate: e.target.value })
                          }
                          placeholder="e.g. 500"
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Specialty / Focus Area */}
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Key Focus Area / Bio Line
                        </label>
                        <input
                          type="text"
                          value={vendorProfile.specialty}
                          onChange={(e) =>
                            setVendorProfile({ ...vendorProfile, specialty: e.target.value })
                          }
                          placeholder="e.g. Heart surgery & angioplasty"
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div>
                        <PincodeInput
                          value={vendorProfile.pincode || ""}
                          onChange={(val) => {
                            setVendorProfile((prev) => ({
                              ...prev,
                              pincode: val,
                              city: val.length < 6 ? "" : prev.city,
                              state: val.length < 6 ? "" : prev.state,
                            }));
                          }}
                          onCityDetected={(detectedCity, res) => {
                            setVendorProfile((prev) => ({
                              ...prev,
                              city: detectedCity,
                              state: res?.state || prev.state || "",
                            }));
                          }}
                          enforceLocationMatch={false}
                          label="Service Pincode"
                          placeholder="e.g. 501218"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Service City & State
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={
                              vendorProfile.city
                                ? `${vendorProfile.city}${vendorProfile.state ? `, ${vendorProfile.state}` : ""}`
                                : ""
                            }
                            placeholder="Auto-filled from Pincode"
                            className="w-full pl-3 pr-8 py-2.5 bg-dark-100 border border-border rounded-xl text-xs text-dark-900 cursor-not-allowed font-medium"
                          />
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dark-400" />
                        </div>
                        <p className="text-[10px] text-dark-400 mt-1">
                          Locked to your verified service pincode.
                        </p>
                      </div>
                    <div className="mt-4 sm:col-span-2">
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Areas served
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {SERVICE_AREA_CITIES.map((city) => {
                          const selected = (vendorProfile.serviceAreas || []).includes(city);
                          return (
                            <button
                              key={city}
                              type="button"
                              onClick={() =>
                                setVendorProfile((prev) => ({
                                  ...prev,
                                  serviceAreas: selected
                                    ? (prev.serviceAreas || []).filter((area) => area !== city)
                                    : [...(prev.serviceAreas || []), city],
                                }))
                              }
                              className={`py-1.5 px-3.5 rounded-xl border text-xs font-semibold transition-colors ${
                                selected
                                  ? "border-primary-500 bg-primary-50 text-primary-700"
                                  : "border-border bg-white text-dark-600 hover:bg-dark-50"
                              }`}
                            >
                              {city}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-dark-400 mt-1.5">
                        Cities where you accept bookings. Customers searching these cities can find
                        you. Your profile address stays unchanged.
                      </p>
                    </div>
                    </div>
                      );
                    })()}
                    {/* Bank & Payout Destination Section in Profile */}
                    <div className="p-4 bg-dark-50 rounded-2xl border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-dark-900 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-primary-600" /> Bank & Payout Information
                        </h4>
                        <p className="text-[11px] text-dark-500 mt-0.5">
                          {hasValidPayout
                            ? `Configured destination: ${payoutDetails?.type === "upi" ? `UPI (${payoutDetails.upi_id})` : `${payoutDetails?.bank_name || "Bank Account"} (${maskAccountNumber(payoutDetails?.account_number)})`}`
                            : "No bank account or UPI details added yet. Add details to receive client payouts."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openPayoutDetailsEditor}
                        className="py-1.5 px-3 rounded-xl border border-border bg-white text-dark-700 hover:bg-dark-50 text-xs font-semibold shrink-0"
                      >
                        {hasValidPayout ? "Update Bank Details" : "+ Add Bank Details"}
                      </button>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="font-semibold shadow-button text-xs py-2.5 px-6"
                    >
                      Save Profile & Title
                    </Button>
                  </form>

                  {/* Services offered */}
                  <div className="pt-8 border-t border-border space-y-4">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-dark-900">
                        Services & Skills Offered
                      </h3>
                      <p className="text-xs text-dark-500 mt-0.5">
                        Customers pick from these when booking you. Prices are per service.
                      </p>
                    </div>

                    {(vendorProfile?.services || []).length === 0 ? (
                      <div className="p-5 rounded-2xl border border-dashed border-border bg-dark-50 text-center text-xs text-dark-500">
                        No services yet. Add your first below.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(vendorProfile?.services || []).map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start justify-between gap-4 p-4 bg-dark-50 rounded-2xl border border-border"
                          >
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-dark-900">
                                {s.title}
                              </h4>
                              {s.description && (
                                <p className="text-xs text-dark-500 mt-0.5">{s.description}</p>
                              )}
                              <p className="text-xs font-semibold text-primary-700 mt-1">
                                {formatMoney(Number(s.price) || 0)}
                                {s.duration ? ` • ${s.duration}` : ""}
                              </p>
                              {Array.isArray(s.inclusions) && s.inclusions.length > 0 && (
                                <ul className="text-[11px] text-dark-600 mt-1.5 space-y-0.5 list-disc list-inside">
                                  {s.inclusions.map((line) => (
                                    <li key={line}>{line}</li>
                                  ))}
                                </ul>
                              )}
                              {Array.isArray(s.exclusions) && s.exclusions.length > 0 && (
                                <p className="text-[11px] text-amber-700 mt-1.5">
                                  Extra charges: {s.exclusions.join(" • ")}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                aria-label="Edit service"
                                onClick={() =>
                                  setServiceForm({
                                    id: s.id,
                                    title: s.title,
                                    description: s.description || "",
                                    price: s.price,
                                    duration: s.duration || "",
                                    inclusions: formatInclusions(s.inclusions),
                                    exclusions: formatInclusions(s.exclusions),
                                  })
                                }
                                className="p-2 rounded-lg border border-border text-dark-600 hover:bg-white transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Delete service"
                                onClick={() => handleServiceDelete(s.id)}
                                className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={handleServiceSubmit}
                      className="p-5 rounded-2xl border border-primary-200 bg-primary-50/30 space-y-3"
                    >
                      <h4 className="font-heading text-sm font-bold text-dark-900">
                        {serviceForm.id ? "Edit service" : "Add a service"}
                      </h4>
                      <input
                        type="text"
                        required
                        value={serviceForm.title}
                        onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })}
                        placeholder="Service title (e.g. Emergency Leak Repair)"
                        className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      <input
                        type="text"
                        value={serviceForm.description}
                        onChange={(e) =>
                          setServiceForm({ ...serviceForm, description: e.target.value })
                        }
                        placeholder="Short description (optional)"
                        className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={serviceForm.price}
                          onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                          placeholder="Price"
                          className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                        <input
                          type="text"
                          value={serviceForm.duration}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, duration: e.target.value })
                          }
                          placeholder="Duration (e.g. 60 mins)"
                          className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-dark-700 mb-1">
                            What&apos;s included (one per line)
                          </label>
                          <textarea
                            rows={3}
                            value={serviceForm.inclusions}
                            onChange={(e) =>
                              setServiceForm({ ...serviceForm, inclusions: e.target.value })
                            }
                            placeholder={"Visit & diagnosis\nEstimated 45 mins of work\nBasic tools"}
                            className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-dark-700 mb-1">
                            Extra charges / not included (one per line)
                          </label>
                          <textarea
                            rows={3}
                            value={serviceForm.exclusions}
                            onChange={(e) =>
                              setServiceForm({ ...serviceForm, exclusions: e.target.value })
                            }
                            placeholder={"Spare parts at actuals\nTravel beyond 5 km: ₹10/km"}
                            className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          className="font-semibold shadow-button text-xs py-2.5 px-5"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          {serviceForm.id ? "Save Changes" : "Add Service"}
                        </Button>
                        {serviceForm.id && (
                          <button
                            type="button"
                            onClick={() => setServiceForm(blankServiceForm())}
                            className="text-xs text-dark-600 hover:text-dark-900 px-2"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Qualifications */}
                  <div className="pt-8 border-t border-border space-y-4">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-dark-900">
                        Qualifications & Certifications
                      </h3>
                      <p className="text-xs text-dark-500 mt-0.5">
                        Degrees, licenses and certifications shown on your public profile.
                      </p>
                    </div>

                    {(vendorProfile?.credentials || []).length === 0 ? (
                      <div className="p-5 rounded-2xl border border-dashed border-border bg-dark-50 text-center text-xs text-dark-500">
                        No qualifications added yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(vendorProfile?.credentials || []).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-4 p-4 bg-dark-50 rounded-2xl border border-border"
                          >
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-dark-900">
                                {c.title}
                              </h4>
                              <p className="text-xs text-dark-500 mt-0.5">
                                {[c.issuer, c.year].filter(Boolean).join(" • ")}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label="Delete qualification"
                              onClick={() => handleCredDelete(c.id)}
                              className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={handleCredSubmit}
                      className="p-5 rounded-2xl border border-primary-200 bg-primary-50/30 space-y-3"
                    >
                      <h4 className="font-heading text-sm font-bold text-dark-900">
                        Add a qualification
                      </h4>
                      <input
                        type="text"
                        required
                        value={credForm.title}
                        onChange={(e) => setCredForm({ ...credForm, title: e.target.value })}
                        placeholder="Qualification (e.g. Master Electrician Certification)"
                        className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={credForm.issuer}
                          onChange={(e) => setCredForm({ ...credForm, issuer: e.target.value })}
                          placeholder="Issuer (e.g. Maharashtra Board)"
                          className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                        <input
                          type="text"
                          value={credForm.year}
                          onChange={(e) => setCredForm({ ...credForm, year: e.target.value })}
                          placeholder="Year"
                          className="w-full px-3.5 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        className="font-semibold shadow-button text-xs py-2.5 px-5"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Qualification
                      </Button>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 4: VERIFICATION */}
              {activeTab === "verification" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Identity & Professional Credentials
                    </h3>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Upload the documents our compliance team reviews. Your profile stays hidden
                      from the public directory until every document is approved.
                    </p>
                  </div>

                  {isLoadingDocs ? (
                    <div className="flex items-center justify-center py-8 text-xs text-dark-400">
                      <div className="h-4 w-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-2" />
                      Loading your documents…
                    </div>
                  ) : latestDocs.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-dashed border-border bg-dark-50 text-center text-xs text-dark-500">
                      No documents uploaded yet.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {latestDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-4 bg-dark-50 rounded-2xl border border-border"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                              <FileCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-dark-900">
                                {doc.type}
                              </h4>
                              <p className="text-xs text-dark-500 mt-0.5" suppressHydrationWarning>
                                {doc.file_path?.split("/").pop()} • Uploaded{" "}
                                {doc.created_at
                                  ? new Date(doc.created_at).toLocaleDateString()
                                  : "just now"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full capitalize ${
                                docStatusStyles[doc.status] || "text-dark-600 bg-dark-50"
                              }`}
                            >
                              {doc.status === "approved" && <Check className="w-3 h-3 stroke-[3]" />}
                              {doc.status === "rejected" && <AlertCircle className="w-3 h-3" />}
                              {doc.status === "pending" && <Clock className="w-3 h-3" />}
                              {doc.status}
                            </span>
                            {doc.status === "rejected" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDocType(doc.type);
                                  showToast(`Selected "${doc.type}" for re-upload below`, "info");
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-semibold underline px-2 py-1"
                              >
                                Re-upload
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-6 border-2 border-dashed border-primary-200 bg-primary-50/30 rounded-2xl space-y-4">
                    <div className="text-center">
                      <Upload className="w-10 h-10 text-primary-500 mx-auto mb-2" />
                      <h4 className="font-heading text-sm font-bold text-dark-900">
                        Upload a verification document
                      </h4>
                      <p className="text-xs text-dark-500 max-w-md mx-auto mt-1">
                        PDF or image. New uploads start as pending until an admin reviews them.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        disabled={isUploading}
                        aria-label="Document type"
                        className="w-full sm:w-auto px-3 py-2.5 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      >
                        {documentTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>

                      <label
                        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                          isUploading
                            ? "bg-primary-300 text-white cursor-wait"
                            : "bg-primary-500 hover:bg-primary-600 text-white shadow-button cursor-pointer"
                        }`}
                      >
                        {isUploading ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Choose File
                          </>
                        )}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleDocUpload}
                          disabled={isUploading}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: NOTIFICATION SETTINGS */}
              {activeTab === "settings" && (
                <div className="p-6 sm:p-8 space-y-6 max-w-2xl">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      Notification Preferences
                    </h3>
                    <p className="text-xs text-dark-500 mt-1">
                      Manage how you receive alerts for new bookings, schedule changes, and payout updates.
                    </p>
                  </div>

                  {!notifPrefs ? (
                    <p className="text-xs text-dark-400">Loading preferences…</p>
                  ) : (
                    <div className="space-y-3">
                      {[
                        {
                          key: "whatsapp",
                          label: "WhatsApp Notifications",
                          hint: "Receive WhatsApp alerts for new bookings, client cancellations, and payout disbursements.",
                        },
                        {
                          key: "email",
                          label: "Email Notifications",
                          hint: "Receive booking confirmations and appointment reminders via email.",
                        },
                        {
                          key: "bookings",
                          label: "Booking Updates & Schedule Alerts",
                          hint: "Get notified when customers book, reschedule, or cancel services.",
                        },
                        {
                          key: "announcements",
                          label: "Platform News & Payout Announcements",
                          hint: "Important updates regarding payout schedules, platform features, and policies.",
                        },
                      ].map((row) => (
                        <label
                          key={row.key}
                          className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-dark-50/50 hover:bg-dark-50 transition-colors cursor-pointer"
                        >
                          <div>
                            <span className="block text-xs font-semibold text-dark-900">
                              {row.label}
                            </span>
                            <span className="block text-[11px] text-dark-500 mt-0.5">
                              {row.hint}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={!!notifPrefs[row.key]}
                            onChange={() => handleVendorPrefToggle(row.key)}
                            className="mt-0.5 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0 cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </ErrorBoundary>
            </div>
          </div>
        </div>
        {/* PAYOUT DETAILS MODAL */}
        {isEditingPayoutDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-surface border border-border rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-base font-bold text-dark-900">
                      Payout & Bank Account Details
                    </h3>
                    <p className="text-xs text-dark-500">
                      Direct deposit for your earnings withdrawals.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingPayoutDetails(false)}
                  className="p-1.5 rounded-xl text-dark-400 hover:text-dark-700 hover:bg-dark-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Selector Tabs */}
              <div className="flex rounded-xl bg-dark-100 p-1 border border-border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPayoutForm((prev) => ({ ...prev, type: "bank" }))}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${payoutForm.type === "bank" ? "bg-white text-primary-700 shadow-xs" : "text-dark-600 hover:text-dark-900"}`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Bank Transfer (IMPS / NEFT)
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutForm((prev) => ({ ...prev, type: "upi" }))}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${payoutForm.type === "upi" ? "bg-white text-primary-700 shadow-xs" : "text-dark-600 hover:text-dark-900"}`}
                >
                  <QrCode className="w-3.5 h-3.5" /> UPI ID
                </button>
              </div>

              <form onSubmit={handleSavePayoutDetails} className="space-y-4">
                {payoutForm.type === "bank" ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Account Holder Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutForm.account_holder}
                        onChange={(e) => setPayoutForm({ ...payoutForm, account_holder: e.target.value })}
                        placeholder="As shown in bank passbook (e.g. Ramesh Kumar)"
                        className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          IFSC Code <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={11}
                          value={payoutForm.ifsc_code}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
                            const detected = getBankNameFromIFSC(val);
                            setPayoutForm((prev) => ({
                              ...prev,
                              ifsc_code: val,
                              bank_name: detected || prev.bank_name,
                            }));
                          }}
                          placeholder="e.g. HDFC0001234"
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-mono font-bold uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={payoutForm.bank_name}
                          onChange={(e) => setPayoutForm({ ...payoutForm, bank_name: e.target.value })}
                          placeholder="e.g. HDFC Bank, SBI"
                          className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Bank Account Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={payoutForm.account_number}
                        onChange={(e) => setPayoutForm({ ...payoutForm, account_number: e.target.value.replace(/\D/g, "") })}
                        placeholder="Enter 9 to 18 digit account number"
                        className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Confirm Account Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutForm.confirm_account_number}
                        onChange={(e) => setPayoutForm({ ...payoutForm, confirm_account_number: e.target.value.replace(/\D/g, "") })}
                        placeholder="Re-enter bank account number"
                        className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-mono"
                      />
                      {payoutForm.confirm_account_number && payoutForm.account_number !== payoutForm.confirm_account_number && (
                        <p className="text-[11px] text-red-600 mt-1 font-medium">Account numbers do not match.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        UPI ID / VPA <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutForm.upi_id}
                        onChange={(e) => setPayoutForm({ ...payoutForm, upi_id: e.target.value.trim() })}
                        placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm"
                        className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Registered Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={payoutForm.account_holder}
                        onChange={(e) => setPayoutForm({ ...payoutForm, account_holder: e.target.value })}
                        placeholder="Name linked with your UPI ID"
                        className="w-full px-3.5 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </>
                )}

                <div className="p-3 bg-dark-50 rounded-xl border border-border text-[11px] text-dark-500 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    Your banking information is securely encrypted and used strictly to deposit your earnings withdrawals.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingPayoutDetails(false)}
                    className="py-2.5 px-4 rounded-xl border border-border text-xs font-semibold text-dark-600 hover:bg-dark-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSavingPayoutDetails}
                    className="py-2.5 px-5 text-xs font-semibold shadow-button bg-primary-600 hover:bg-primary-700"
                  >
                    {isSavingPayoutDetails ? "Verifying & Saving..." : "Save Payout Details"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
