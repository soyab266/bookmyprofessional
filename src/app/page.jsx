"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { listProfessionals } from "@/lib/data/professionals";
import MarketplaceDirectory from "@/components/MarketplaceDirectory";
import CountUp from "@/components/CountUp";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useComingSoon } from "@/context/ComingSoonContext";
import { subscribeNewsletter } from "@/lib/data/contacts";
import { listCategoryTiles } from "@/lib/data/categories";
import { getSiteContent, DEFAULT_MARKETING, DEFAULT_TESTIMONIALS } from "@/lib/data/site-content";
import { listMyWishlist, addWish, removeWish } from "@/lib/data/wishlist";
import {
  ShieldCheck,
  Zap,
  CalendarCheck,
  Star,
  Users,
  Award,
  ArrowRight,
  Search,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  TrendingUp,
  Briefcase,
  MapPin,
  FileText,
  CalendarDays,
  Check,
  Heart,
  UserCheck,
  Shield,
  Layers,
  CreditCard,
  LayoutGrid,
  Headphones,
  Timer,
  CalendarCheck2,
  Bell,
  Smartphone,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  AlertCircle,
  XCircle,
  Navigation,
  Crosshair,
  Loader2,
  X,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { ikImage } from "@/lib/imagekit";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { useLocationSafe } from "@/context/LocationContext";

// Scrolls the placeholder text only when it is wider than the input; static otherwise.
function ScrollingPlaceholder({ text, className = "" }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const check = () => {
      const box = boxRef.current;
      const t = textRef.current;
      if (!box || !t) return;
      setDuration(t.scrollWidth > box.clientWidth ? t.scrollWidth / 30 : 0);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden"
      aria-hidden="true"
    >
      <div
        className={`flex w-max ${duration ? "animate-marquee-scroll" : ""}`}
        style={duration ? { animationDuration: `${duration}s` } : undefined}
      >
        <span ref={textRef} className={`pr-10 whitespace-nowrap text-muted ${className}`}>
          {text}
        </span>
        <span className={`pr-10 whitespace-nowrap text-muted ${className}`}>{text}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { openAuthModal, user, showToast } = useAuth();
  const { openComingSoonModal } = useComingSoon();
  const {
    setSearchQuery,
    setSelectedLocation,
    setPincode,
    setNearCoords,
    startBooking,
    openProDetail,
    setIsProDashboardOpen,
  } = useMarketplace();

  const [marketplacePros, setFeaturedProfessionals] = useState([]);
  useEffect(() => {
    let active = true;
    listProfessionals({ page: 1, pageSize: 5, sortBy: "featured" }).then(({ rows }) => {
      if (active) setFeaturedProfessionals(rows || []);
    });
    return () => { active = false; };
  }, []);

  const [heroLocation, setHeroLocation] = useState("");
  const [heroService, setHeroService] = useState("");
  const [heroFocus, setHeroFocus] = useState("");
  const [activeGpsCoords, setActiveGpsCoords] = useState(null);
  const [locationConfirmation, setLocationConfirmation] = useState("");

  const locationCtx = useLocationSafe();
  const { liveLocation, updateLiveLocation, clearLiveLocation } = locationCtx || {};

  const { locate, status: geoStatus, clear: clearGeo } = useGeoLocation();
  const isGeoLoading = geoStatus === "locating" || geoStatus === "geocoding";

  // Bidirectionally sync with LocationContext (if detected in banner or loaded from storage)
  useEffect(() => {
    if (liveLocation && !heroLocation) {
      const locText =
        liveLocation.formatted ||
        liveLocation.city ||
        (liveLocation.pincode ? `Pincode ${liveLocation.pincode}` : "");
      if (locText) {
        setHeroLocation(locText);
        if (liveLocation.latitude && liveLocation.longitude) {
          const coords = { latitude: liveLocation.latitude, longitude: liveLocation.longitude };
          setActiveGpsCoords(coords);
          setNearCoords(coords);
        }
        setLocationConfirmation(`Location active: ${locText}`);
      }
    }
  }, [liveLocation]);
  const [activeTab, setActiveTab] = useState("all");
  const [savedPros, setSavedPros] = useState({});
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  // ponytail: active categories come from DB; styling map below provides image + color for known names.
  const [activeCategories, setActiveCategories] = useState([]);
  const [homeCategories, setHomeCategories] = useState([]);
  const [categoryIcons, setCategoryIcons] = useState({});
  const [marketing, setMarketing] = useState(DEFAULT_MARKETING);
  const [testimonials, setTestimonials] = useState(DEFAULT_TESTIMONIALS);
  const [social, setSocial] = useState({});
  useEffect(() => {
    let active = true;
    listCategoryTiles().then((tiles) => {
      if (!active) return;
      setActiveCategories(tiles.map((t) => t.name));
      setHomeCategories(tiles.filter((t) => t.showOnHome).map((t) => t.name));
      setCategoryIcons(
        Object.fromEntries(tiles.filter((t) => t.icon).map((t) => [t.name, t.icon]))
      );
    });
    getSiteContent().then((content) => {
      if (!active) return;
      setMarketing(content.marketing);
      setTestimonials(content.testimonials);
      setSocial(content.social);
    });
    return () => { active = false; };
  }, []);

  // Handle OAuth error redirected to root by Supabase
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDesc = urlParams.get("error_description") || hashParams.get("error_description");
    const error = urlParams.get("error") || hashParams.get("error");
    if (errorDesc || error) {
      const msg = errorDesc || error || "Sign in failed. Please try again.";
      showToast(decodeURIComponent(msg.replace(/\+/g, " ")), "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (isSubscribing) return;
    setIsSubscribing(true);
    try {
      await subscribeNewsletter(newsletterEmail);
      showToast("Subscribed! You'll get the latest updates and offers.", "success");
      setNewsletterEmail("");
    } catch (err) {
      showToast(err?.message || "Subscription failed. Please try again.", "error");
    } finally {
      setIsSubscribing(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!user) {
      setSavedPros({});
      return () => {
        active = false;
      };
    }
    listMyWishlist().then((ids) => {
      if (active) setSavedPros(Object.fromEntries(ids.map((id) => [id, true])));
    });
    return () => {
      active = false;
    };
  }, [user]);

  const toggleSave = async (id, name) => {
    if (!user) {
      showToast("Sign in to save professionals", "info");
      openAuthModal("login", "customer");
      return;
    }
    if (savedPros[id]) {
      setSavedPros((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      const ok = await removeWish(id);
      if (!ok) {
        setSavedPros((prev) => ({ ...prev, [id]: true }));
        showToast("Unable to update your wishlist right now.", "error");
        return;
      }
      showToast(`${name} removed from your favorites!`, "info");
    } else {
      setSavedPros((prev) => ({ ...prev, [id]: true }));
      const ok = await addWish(id);
      if (!ok) {
        setSavedPros((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        showToast("Unable to update your wishlist right now.", "error");
        return;
      }
      showToast(`${name} saved to your favorites!`, "success");
    }
  };

  const handleUseCurrentLocation = (e) => {
    if (e) e.preventDefault();
    setLocationConfirmation("");
    locate(
      ({ coords, city, pincode, state, displayName }) => {
        setActiveGpsCoords(coords);
        setNearCoords(coords);
        setSelectedLocation("all");
        setPincode("");
        const locText = displayName || city || (pincode ? `Pincode ${pincode}` : "Current Location");
        setHeroLocation(locText);
        setLocationConfirmation(`Location detected: ${locText}`);
        showToast(`Location detected: ${locText}`, "success");

        // Sync with global LocationContext so banner & rest of app recognize it immediately
        if (updateLiveLocation) {
          updateLiveLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            city,
            pincode,
            state: state || "",
            formatted: locText,
          });
        }
      },
      (err) => {
        showToast(err.message, "error");
      }
    );
  };

  const handleLocationChange = (e) => {
    const val = e.target.value;
    setHeroLocation(val);
    setLocationConfirmation("");
    if (activeGpsCoords) {
      setActiveGpsCoords(null);
      setNearCoords(null);
      clearGeo();
    }
  };

  const handleClearLocation = () => {
    setHeroLocation("");
    setActiveGpsCoords(null);
    setNearCoords(null);
    setLocationConfirmation("");
    clearGeo();
    if (clearLiveLocation) {
      clearLiveLocation();
    }
  };

  const handleHeroSearch = (e) => {
    if (e) e.preventDefault();
    if (heroService) setSearchQuery(heroService);

    if (activeGpsCoords) {
      // Real coordinates used for nearest-first sorting
      setNearCoords(activeGpsCoords);
      setSelectedLocation("all");
      setPincode("");
    } else {
      // Manual search - clear stale GPS
      setNearCoords(null);
      const place = heroLocation.trim();
      if (/^\d{6}$/.test(place)) {
        setPincode(place);
        setSelectedLocation("all");
      } else if (place && place !== "Current Location") {
        setSelectedLocation(place);
        setPincode("");
      } else {
        setSelectedLocation("all");
        setPincode("");
      }
    }

    const element = document.getElementById("find");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCategoryClick = (catTitle) => {
    router.push(`/professionals?category=${encodeURIComponent(catTitle)}`);
  };

  const topCategories = [
    {
      title: "Doctors",
      subtitle: "Healthcare for you",
      bgGradient: "from-sky-100 to-sky-50",
      cardBg: "bg-sky-50/70 border-sky-100",
      image: "/images/cat_doctor.jpg",
    },
    {
      title: "Tutors",
      subtitle: "Learn from the best",
      bgGradient: "from-amber-100 to-amber-50",
      cardBg: "bg-amber-50/70 border-amber-100",
      image: "/images/cat_tutor.jpg",
    },
    {
      title: "IT Professionals",
      subtitle: "Tech support & more",
      bgGradient: "from-emerald-100 to-emerald-50",
      cardBg: "bg-emerald-50/70 border-emerald-100",
      image: "/images/cat_it_pro.jpg",
    },
    {
      title: "Electricians",
      subtitle: "Safe & reliable",
      bgGradient: "from-orange-100 to-orange-50",
      cardBg: "bg-orange-50/70 border-orange-100",
      image: "/images/cat_electrician.jpg",
    },
    {
      title: "Plumbers",
      subtitle: "Fix it with experts",
      bgGradient: "from-blue-100 to-blue-50",
      cardBg: "bg-blue-50/70 border-blue-100",
      image: "/images/cat_plumber.jpg",
    },
    {
      title: "Beauticians",
      subtitle: "Look & feel great",
      bgGradient: "from-rose-100 to-rose-50",
      cardBg: "bg-rose-50/70 border-rose-100",
      image: "/images/cat_beautician.jpg",
    },
    {
      title: "Cleaners",
      subtitle: "Clean spaces, happier you",
      bgGradient: "from-cyan-100 to-cyan-50",
      cardBg: "bg-cyan-50/70 border-cyan-100",
      image: "/images/cat_cleaner.jpg",
    },
    {
      title: "Consultants",
      subtitle: "Expert advice",
      bgGradient: "from-slate-200 to-slate-100",
      cardBg: "bg-slate-50/70 border-slate-200",
      image: "/images/cat_consultant.jpg",
    },
  ];
  // ponytail: DB categories drive the visible list (admin deactivate → disappears); this map supplies
  // the visual chrome for known names. Unknown categories fall back to a neutral card.
  const categoryStyleByKey = Object.fromEntries(topCategories.map((c) => [c.title, c]));
  const categoryStylesFor = (name) => categoryStyleByKey[name] || {
    title: name,
    subtitle: "Professional service",
    bgGradient: "from-slate-200 to-slate-100",
    cardBg: "bg-slate-50/70 border-slate-200",
    image: `/images/cat_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.jpg`,
  };

  const features = [
    {
      icon: ShieldCheck,
      title: "100% Background Checked",
      desc: "Every professional undergoes multi-tier credential verification, identity checks, and portfolio audits.",
      tag: "Security",
    },
    {
      icon: Zap,
      title: "Instant Smart Matching",
      desc: "Our AI-powered engine pairs your project requirements with qualified experts in minutes.",
      tag: "Speed",
    },
    {
      icon: CalendarCheck,
      title: "Flexible Scheduling",
      desc: "Direct calendar sync lets you schedule consultations, ongoing retainers, or emergency sprints with ease.",
      tag: "Convenience",
    },
    {
      icon: Lock,
      title: "Milestone Escrow Protection",
      desc: "Payments are held securely and released only when deliverables meet your agreed milestones.",
      tag: "Protection",
    },
    {
      icon: Clock,
      title: "24/7 Dedicated Support",
      desc: "Direct access to our dedicated dispute resolution and project concierge whenever you need help.",
      tag: "Support",
    },
    {
      icon: Award,
      title: "Satisfaction Guarantee",
      desc: "Not fully satisfied with the initial consultation? We offer hassle-free rematching or full refunds.",
      tag: "Guarantee",
    },
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Describe Your Need",
      desc: "Tell us what you want accomplished, your budget range, and timeline expectations.",
    },
    {
      step: "02",
      title: "Review Matched Experts",
      desc: "Compare verified profiles, genuine reviews, portfolio samples, and hourly/fixed rates.",
    },
    {
      step: "03",
      title: "Book & Collaborate",
      desc: "Schedule sessions with integrated video calls, escrow payments, and tracking tools.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-dark-800">
      {/* Navigation Header */}
      <Navbar />

      <main className="flex-1">
        {/* HERO SECTION WITH BACKGROUND IMAGE */}
        <section
          className="relative min-h-[460px] sm:min-h-[500px] lg:min-h-[520px] flex items-center bg-cover bg-right sm:bg-center bg-no-repeat overflow-hidden"
          style={{
            backgroundImage: "url('/images/heroimage.png')",
          }}
        >
          {/* Subtle mobile gradient overlay for pristine text readability without obscuring the professional */}
          <div className="absolute inset-0 bg-gradient-to-r from-surface/95 via-surface/80 to-transparent lg:from-surface/85 lg:via-surface/40 lg:to-transparent pointer-events-none" />

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12 w-full">
            <div className="max-w-2xl lg:max-w-2xl text-center sm:text-left">
              {/* Badge: Trusted Professionals. At Your Service. */}
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-surface/90 backdrop-blur-sm px-3 py-1 shadow-sm mb-4">
                <span className="flex h-2 w-2 rounded-full ring-2 ring-primary-300 bg-primary-500" />
                <span className="text-xs font-semibold text-primary-700">
                  Trusted Professionals. At Your Service.
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-dark-900 sm:leading-[3rem]">
                Book Verified <br />
                <span className="text-primary-500">Professionals</span> <br />
                For Every Need
              </h1>
              {/* Subheadline description */}
              <p className="mt-3.5 text-sm sm:text-basefont-normal leading-relaxed max-w-lg lg:text-dark-700 text-dark-900">
                From home services to healthcare, education to professional
                consultation – find, compare and book trusted experts near you.
              </p>

              {/* Unified Two-Part Search Bar */}
                <form onSubmit={handleHeroSearch} className="mt-8 w-full max-w-2xl">
                  <div className="flex flex-col sm:flex-row items-stretch bg-surface rounded-card border border-border shadow-soft p-1.5 gap-1.5 sm:gap-0">
                    {/* Location Input */}
                    <div className="flex items-center gap-2 px-3 py-2 sm:w-[38%] sm:min-w-[180px] border-b sm:border-b-0 sm:border-r border-border shrink-0">
                      <MapPin className="h-4 w-4 text-primary-500 shrink-0" />
                      <div className="relative flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Location / Pincode"
                          value={heroLocation}
                          onChange={handleLocationChange}
                          onFocus={() => setHeroFocus("location")}
                          onBlur={() => setHeroFocus("")}
                          className="w-full bg-transparent text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none"
                          aria-label="Location or Pincode"
                        />
                      </div>

                      {/* Clear button if text exists */}
                      {heroLocation && (
                        <button
                          type="button"
                          onClick={handleClearLocation}
                          className="p-1 rounded-full text-dark-400 hover:text-dark-700 hover:bg-dark-100 transition-colors cursor-pointer shrink-0"
                          aria-label="Clear location input"
                          title="Clear location"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Touch-friendly GPS target inside location field */}
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isGeoLoading}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 min-w-[32px] min-h-[32px] ${
                          activeGpsCoords
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs"
                            : "bg-dark-50/80 hover:bg-primary-50 border-border hover:border-primary-300 text-dark-600 hover:text-primary-600"
                        }`}
                        aria-label="Use my current location"
                        title="Use my current location"
                      >
                        {isGeoLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
                        ) : activeGpsCoords ? (
                          <Crosshair className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                        ) : (
                          <Navigation className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Service Input */}
                    <div className="flex flex-1 items-center gap-2 px-3 py-2 min-w-0">
                      <Search className="h-4 w-4 text-muted shrink-0" />
                      <div className="relative flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Search service (e.g. Plumber, Tutor)"
                          value={heroService}
                          onChange={(e) => setHeroService(e.target.value)}
                          onFocus={() => setHeroFocus("service")}
                          onBlur={() => setHeroFocus("")}
                          className="w-full bg-transparent text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none"
                          aria-label="Search for a service"
                        />
                      </div>
                    </div>

                    {/* Buttons Container: Entry point beside the search button */}
                    <div className="flex items-center gap-1.5 sm:self-center p-1 sm:p-0 shrink-0">
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isGeoLoading}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[8px] border text-xs font-semibold whitespace-nowrap transition-all cursor-pointer min-h-[40px] ${
                          activeGpsCoords
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs"
                            : "bg-surface border-border text-dark-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 shadow-xs"
                        }`}
                        aria-label="Use my current location"
                        title="Use my current location"
                      >
                        {isGeoLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500 shrink-0" />
                        ) : (
                          <Crosshair className={`h-3.5 w-3.5 shrink-0 ${activeGpsCoords ? "text-emerald-600" : "text-primary-500"}`} />
                        )}
                        <span>
                          {isGeoLoading ? "Locating..." : activeGpsCoords ? "Near Me ✓" : "Near Me"}
                        </span>
                      </button>

                      {/* Search Button */}
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        className="flex-1 sm:flex-none rounded-[8px] px-4 sm:px-5 py-2.5 font-semibold text-xs sm:text-sm whitespace-nowrap shadow-button cursor-pointer min-h-[40px]"
                      >
                        <Search className="h-4 w-4 mr-1.5 shrink-0" />
                        Search
                      </Button>
                    </div>
                  </div>

                  {/* Geolocation feedback / status note */}
                {isGeoLoading && (
                  <div className="mt-2.5 flex items-center gap-2 text-xs text-primary-600 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Detecting current location and reverse-geocoding...</span>
                  </div>
                )}

                {!isGeoLoading && activeGpsCoords && (
                  <div className="mt-2.5 flex items-center justify-between text-xs text-emerald-700 bg-emerald-50/80 border border-emerald-200/80 px-3 py-1.5 rounded-lg shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        Using GPS location: <strong>{heroLocation || "Current Location"}</strong>. Matching pros sorted nearest first.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      className="text-dark-500 hover:text-dark-800 text-[11px] font-medium underline cursor-pointer ml-2"
                    >
                      Clear / Manual
                    </button>
                  </div>
                )}

                {/* Popular Tags */}
                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs">
                  <span className="font-semibold text-dark-700 mr-1">
                    Popular:
                  </span>
                  {(activeCategories.length > 0 ? activeCategories.slice(0, 6) : []).map((service) => (
                    <button
                      key={service}
                      type="button"
                      onClick={() => handleCategoryClick(service)}
                      className="rounded-full border border-border bg-surface/90 px-3 py-1 text-xs text-dark-700 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 shadow-xs transition-colors cursor-pointer"
                    >
                      {service}
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* EXPLORE OUR TOP CATEGORIES SECTION */}
        <section id="categories" className="py-12 sm:py-14 bg-surface border-b border-border scroll-mt-14">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Header: Title + Subtitle + View All Link */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-dark-900">
                  Explore Our <span className="text-primary-500">Top Categories</span>
                </h2>
                <p className="mt-2 text-sm sm:text-base text-dark-600 font-normal">
                  Find professional services for every part of your life.
                </p>
              </div>
              <Link
                href="/professionals"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors group shrink-0"
              >
                <span>View All Categories</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Categories Grid / Horizontal Scroll on small screens */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
              {(activeCategories.length > 0 ? homeCategories : topCategories.map((c) => c.title)).map((name) => {
                const cat = categoryStylesFor(name);
                const tileImage = categoryIcons[name] || cat.image;
                return (
                  <div
                    key={name}
                    onClick={() => handleCategoryClick(cat.title)}
                    className={`group relative flex flex-col items-center text-center rounded-[14px] border ${cat.cardBg} p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-card cursor-pointer`}
                  >
                    {/* Image Container with Soft Pastel Background */}
                    <div
                      className="w-full aspect-square rounded-[10px] overflow-hidden flex items-center justify-center mb-2.5 bg-dark-100"
                    >
                      <img
                        src={tileImage}
                        alt={cat.title}
                        width={200}
                        height={200}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </div>

                    {/* Text Details */}
                    <h3 className="font-heading text-xs sm:text-sm font-bold text-dark-900 leading-tight">
                      {cat.title}
                    </h3>
                    <p className="mt-1 text-[10px] sm:text-[11px] text-muted leading-tight line-clamp-1">
                      {cat.subtitle}
                    </p>
                  </div>
                );
              })}

              {/* 8th card: opens the full directory */}
              <Link
                href="/professionals"
                className="group relative flex flex-col items-center justify-center text-center rounded-[14px] border-2 border-dashed border-primary-200 bg-primary-50/60 p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-card hover:border-primary-400"
              >
                <div className="w-full aspect-square rounded-[10px] flex items-center justify-center mb-2.5 bg-primary-100/70">
                  <ArrowRight className="w-7 h-7 text-primary-500 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
                <h3 className="font-heading text-xs sm:text-sm font-bold text-primary-600 leading-tight">
                  View All
                </h3>
                <p className="mt-1 text-[10px] sm:text-[11px] text-muted leading-tight line-clamp-1">
                  Every category
                </p>
              </Link>
            </div>
          </div>
        </section>

         {/* HOW IT WORKS / WORKFLOW SECTION */}
        <section id="how-it-works" className="py-12 sm:py-14 bg-surface border-y border-border overflow-hidden scroll-mt-16">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Header: How BookMyProfessional Works */}
            <div className="mx-auto max-w-3xl text-center mb-14 sm:mb-20">
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-[42px] font-bold text-dark-900 tracking-tight">
                How <span className="text-primary-500">BookMyProfessional</span> Works
              </h2>
              <p className="mt-3 text-base sm:text-lg text-dark-600 font-normal">
                Getting professional help has never been this easy.
              </p>
            </div>

            {/* 4 Steps Row with Curved Connectors and Handwritten Note */}
            <div className="relative">

              {/* Steps Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6 relative">
                
                {/* STEP 1: Search */}
                <div className="relative flex flex-col items-center text-center px-3">
                  {/* Icon Circle */}
                  <div className="relative mb-5">
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-primary-100/80 flex items-center justify-center text-primary-500 shadow-soft ring-8 ring-primary-50/60">
                      <Search className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.3]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-dark-900">
                    <span className="text-primary-500 font-bold mr-1">1.</span> Search
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-dark-600 leading-relaxed max-w-[210px]">
                    Find the service you need in your location.
                  </p>

                  {/* Dotted Curved Arrow Connector (Desktop only, between Step 1 and 2) */}
                  <div className="hidden lg:block absolute top-7 -right-10 w-20 pointer-events-none select-none z-0">
                    <svg viewBox="0 0 100 40" fill="none" className="w-full h-auto text-primary-300">
                      <path
                        d="M 5 30 Q 50 2 92 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        fill="none"
                      />
                      <polygon points="90,16 97,26 86,28" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* STEP 2: Compare */}
                <div className="relative flex flex-col items-center text-center px-3">
                  {/* Icon Circle */}
                  <div className="relative mb-5">
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-primary-100/80 flex items-center justify-center text-primary-500 shadow-soft ring-8 ring-primary-50/60">
                      <FileText className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.3]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-dark-900">
                    <span className="text-primary-500 font-bold mr-1">2.</span> Compare
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-dark-600 leading-relaxed max-w-[210px]">
                    View profiles, ratings and prices.
                  </p>

                  {/* Dotted Curved Arrow Connector (Desktop only, between Step 2 and 3) */}
                  <div className="hidden lg:block absolute top-7 -right-10 w-20 pointer-events-none select-none z-0">
                    <svg viewBox="0 0 100 40" fill="none" className="w-full h-auto text-primary-300">
                      <path
                        d="M 5 30 Q 50 2 92 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        fill="none"
                      />
                      <polygon points="90,16 97,26 86,28" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* STEP 3: Book */}
                <div className="relative flex flex-col items-center text-center px-3">
                  {/* Icon Circle */}
                  <div className="relative mb-5">
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-primary-100/80 flex items-center justify-center text-primary-500 shadow-soft ring-8 ring-primary-50/60">
                      <CalendarDays className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.3]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-dark-900">
                    <span className="text-primary-500 font-bold mr-1">3.</span> Book
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-dark-600 leading-relaxed max-w-[210px]">
                    Choose date & time and confirm your booking.
                  </p>

                  {/* Dotted Curved Arrow Connector (Desktop only, between Step 3 and 4) */}
                  <div className="hidden lg:block absolute top-7 -right-10 w-20 pointer-events-none select-none z-0">
                    <svg viewBox="0 0 100 40" fill="none" className="w-full h-auto text-primary-300">
                      <path
                        d="M 5 30 Q 50 2 92 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        fill="none"
                      />
                      <polygon points="90,16 97,26 86,28" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* STEP 4: Get Service */}
                <div className="relative flex flex-col items-center text-center px-3">
                  {/* Icon Circle (Green/Success) */}
                  <div className="relative mb-5">
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-emerald-100/80 flex items-center justify-center text-success shadow-soft ring-8 ring-emerald-50/60">
                      <Check className="w-8 h-8 sm:w-9 sm:h-9 stroke-[3]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-dark-900">
                    <span className="text-primary-500 font-bold mr-1">4.</span> Get Service
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-dark-600 leading-relaxed max-w-[210px]">
                    Relax while the professional takes care of the rest.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </section>


         {/* FEATURED PROFESSIONALS PREVIEW */}
        <section
          id="experts"
          className="bg-surface py-14 sm:py-16 border-b border-border scroll-mt-14"
        >
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Header: Title + Subtitle + View All Professionals Link */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-dark-900">
                  Featured <span className="text-primary-500">Professionals</span>
                </h2>
                <p className="mt-2 text-sm sm:text-base text-dark-600 font-normal">
                  Explore professionals. Booking opens after verification.
                </p>
              </div>
              <a
                href="#find"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors group shrink-0"
              >
                <span>View All Professionals</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>

            {/* 5 Cards Grid: 1 col on mobile, 2 cols on sm, 3 cols on md, 5 cols on xl */}
            {marketplacePros.length === 0 ? (
              <p className="text-sm text-muted">New professionals are being verified — check back soon.</p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {marketplacePros.slice(0, 5).map((pro) => (
                  <div
                    key={pro.id}
                    className="group bg-surface rounded-card border border-border shadow-card hover:shadow-soft hover:border-primary-200 transition-all duration-200 overflow-hidden flex flex-col justify-between"
                  >
                    <Link href={`/professionals/${pro.id}`} className="block">
                      {/* Image Container with Badges */}
                      <div className="relative aspect-square w-full bg-dark-100 overflow-hidden">
                        {pro.image ? (
                          <img
                            src={ikImage(pro.image)}
                            alt={pro.name}
                            width={280}
                            height={280}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-heading font-bold text-3xl text-dark-400">
                            {pro.name?.charAt(0) || "P"}
                          </div>
                        )}

                        {/* Verification Status Badge */}
                        {(() => {
                          const s = pro.verificationStatus;
                          if (pro.verified === true && s === "approved") {
                            return (
                              <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-white/90 backdrop-blur-xs rounded-full px-2 py-0.5 shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary-500" />
                                <span className="text-[10px] font-bold text-dark-800">Verified</span>
                              </div>
                            );
                          }
                          if (s === "pending" || s === "documents_requested") {
                            return (
                              <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-amber-50/90 backdrop-blur-xs rounded-full px-2 py-0.5 shadow-xs">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-[10px] font-bold text-amber-800">Pending</span>
                              </div>
                            );
                          }
                          if (s === "rejected") {
                            return (
                              <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-red-50/90 backdrop-blur-xs rounded-full px-2 py-0.5 shadow-xs">
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-[10px] font-bold text-red-800">Not Approved</span>
                              </div>
                            );
                          }
                          return (
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-white/90 backdrop-blur-xs rounded-full px-2 py-0.5 shadow-xs">
                              <AlertCircle className="w-3.5 h-3.5 text-dark-400" />
                              <span className="text-[10px] font-bold text-dark-600">Not Verified</span>
                            </div>
                          );
                        })()}

                        <button
                          type="button"
                          aria-label="Save professional"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleSave(pro.id, pro.name);
                          }}
                          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-dark-500 hover:text-danger hover:bg-white transition-colors shadow-xs"
                        >
                          <Heart className={`w-3.5 h-3.5 ${savedPros[pro.id] ? "fill-red-500 text-red-500" : ""}`} />
                        </button>
                      </div>

                      {/* Content Section */}
                      <div className="p-3.5">
                        {/* Name with Verified Checkmark */}
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-heading font-bold text-sm text-dark-900 leading-tight truncate group-hover:text-primary-600 transition-colors">
                            {pro.name}
                          </h3>
                          {pro.verified === true && pro.verificationStatus === "approved" && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                          )}
                        </div>

                        {/* Profession / Role */}
                        <p className="text-xs text-dark-600 font-medium mt-0.5">
                          {pro.role}
                        </p>

                        {/* Rating & Reviews */}
                        {pro.reviewCount > 0 && pro.rating ? (
                          <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-dark-800">
                            <Star className="w-3.5 h-3.5 fill-warning text-warning" />
                            <span>{pro.rating}</span>
                            <span className="text-muted font-normal">({pro.reviewCount} reviews)</span>
                          </div>
                        ) : (
                          <span className="block mt-2 text-xs font-semibold text-muted">New</span>
                        )}

                        {/* Location */}
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-muted">
                          <MapPin className="w-3 h-3 text-muted shrink-0" />
                          <span className="truncate">{pro.location}</span>
                        </div>

                        {/* Pricing */}
                        <div className="mt-3 flex items-baseline gap-2 pt-2 border-t border-border">
                          <div className="flex items-baseline gap-1">
                            <span className="font-heading font-bold text-sm text-dark-900">
                              {formatMoney(pro.price, 0)}
                            </span>
                            <span className="text-[11px] text-muted">/{pro.unit}</span>
                          </div>
                        </div>
                      </div>
                    </Link>

                    {/* Bottom Action Button */}
                    <div className="p-3.5 pt-0">
                      <Link
                        href={pro.verified === true && pro.verificationStatus === "approved" ? `/book/${pro.id}` : `/professionals/${pro.id}`}
                        className="w-full inline-flex items-center justify-center rounded-[6px] py-2 text-xs font-semibold shadow-button bg-primary-500 hover:bg-primary-600 text-white transition-colors"
                      >
                        {pro.verified === true && pro.verificationStatus === "approved" ? "Book Now" : "View Profile"}
                      </Link>
                    </div>
                  </div>
              ))}
            </div>
            )}
          </div>
        </section>

        {/* FULL INTERACTIVE MARKETPLACE DIRECTORY & SEARCH */}
        <MarketplaceDirectory preview />

        {/* COMMUNITY STATS BANNER WITH STEPS.PNG BACKGROUND */}
        <section
          className="relative py-14 sm:py-16 bg-cover bg-center bg-no-repeat overflow-hidden border-y border-border"
          style={{
            backgroundImage: "url('/images/steps.png')",
          }}
        >
          {/* Dark luxury overlay for optimal high contrast */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-none" />

          <div className="relative z-10 mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 ">
            {/* 4 Stats in row / grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 lg:gap-12 w-full lg:w-auto flex-1 py-12 justify-items-center">
                
                {/* Stat 1: 10,000+ Verified Professionals */}
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 border-[#D4A359] bg-[#D4A359]/15 flex items-center justify-center text-[#E8C27B] shrink-0 shadow-sm">
                    <UserCheck className="w-6 h-6 sm:w-7 sm:h-7 stroke-[1.8]" />
                  </div>
                  <div>
                    <p className="font-heading text-xl sm:text-2xl font-bold text-white leading-none">
                      <CountUp value={marketing.home[0]?.value} />
                    </p>
                    <p className="text-xs sm:text-sm text-dark-200 mt-1 font-medium leading-tight">
                      {marketing.home[0]?.label}
                    </p>
                  </div>
                </div>

                {/* Stat 2: 50,000+ Happy Customers */}
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 border-[#D4A359] bg-[#D4A359]/15 flex items-center justify-center text-[#E8C27B] shrink-0 shadow-sm">
                    <Shield className="w-6 h-6 sm:w-7 sm:h-7 stroke-[1.8]" />
                  </div>
                  <div>
                    <p className="font-heading text-xl sm:text-2xl font-bold text-white leading-none">
                      <CountUp value={marketing.home[1]?.value} delay={150} />
                    </p>
                    <p className="text-xs sm:text-sm text-dark-200 mt-1 font-medium leading-tight">
                      {marketing.home[1]?.label}
                    </p>
                  </div>
                </div>

                {/* Stat 3: 100+ Service Categories */}
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 border-[#D4A359] bg-[#D4A359]/15 flex items-center justify-center text-[#E8C27B] shrink-0 shadow-sm">
                    <Layers className="w-6 h-6 sm:w-7 sm:h-7 stroke-[1.8]" />
                  </div>
                  <div>
                    <p className="font-heading text-xl sm:text-2xl font-bold text-white leading-none">
                      <CountUp value={marketing.home[2]?.value} delay={300} />
                    </p>
                    <p className="text-xs sm:text-sm text-dark-200 mt-1 font-medium leading-tight">
                      {marketing.home[2]?.label}
                    </p>
                  </div>
                </div>

                {/* Stat 4: 4.8/5 Average Rating */}
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 border-[#D4A359] bg-[#D4A359]/15 flex items-center justify-center text-[#E8C27B] shrink-0 shadow-sm">
                    <Star className="w-6 h-6 sm:w-7 sm:h-7 stroke-[1.8] fill-none" />
                  </div>
                  <div>
                    <p className="font-heading text-xl sm:text-2xl font-bold text-white leading-none">
                      <CountUp value={marketing.home[3]?.value} delay={450} />
                    </p>
                    <p className="text-xs sm:text-sm text-dark-200 mt-1 font-medium leading-tight">
                      {marketing.home[3]?.label}
                    </p>
                  </div>
                </div>

              </div>
          </div>


        </section>

        {/* WHY CHOOSE BOOKMYPROFESSIONAL SECTION */}
        <section id="trust" className="py-14 sm:py-16 bg-surface border-b border-border scroll-mt-14">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Main Header */}
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-[38px] font-bold text-dark-900 tracking-tight">
                Why Choose <span className="text-primary-500">BookMyProfessional?</span>
              </h2>
            </div>

            {/* 5 Compact Features in a Row with responsive layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 items-start gap-y-6 gap-x-6 lg:gap-x-3 xl:gap-x-8">
              
              {/* Item 1: Verified Professionals (Purple) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#8E44AD] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Verified Professionals
                  </h3>
                  <p className="text-xs text-dark-600 mt-1 leading-snug">
                    Background checked for your safety
                  </p>
                </div>
              </div>

              {/* Item 2: Easy Booking (Coral / Orange) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#E67E51] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CalendarDays className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Easy Booking
                  </h3>
                  <p className="text-xs text-dark-600 mt-1 leading-snug">
                    Quick and hassle-free appointments
                  </p>
                </div>
              </div>

              {/* Item 3: Secure Payments (Teal / Turquoise) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#26B99A] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CreditCard className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Secure Payments
                  </h3>
                  <p className="text-xs text-dark-600 mt-1 leading-snug">
                    Safe and encrypted transactions
                  </p>
                </div>
              </div>

              {/* Item 4: Wide Range of Services (Blue) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#3B82F6] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <LayoutGrid className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Wide Range of Services
                  </h3>
                  <p className="text-xs text-dark-600 mt-1 leading-snug">
                    Everything you need in one place
                  </p>
                </div>
              </div>

              {/* Item 5: Reliable Support (Amber / Gold) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#E69500] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Headphones className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Reliable Support
                  </h3>
                  <p className="text-xs text-dark-600 mt-1 leading-snug">
                    We're here whenever you need help
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* WHAT OUR CUSTOMERS SAY (TESTIMONIALS MARQUEE) */}
        <section className="py-14 sm:py-18 bg-surface border-b border-border overflow-hidden">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-[38px] font-bold text-dark-900 tracking-tight">
                What Our Customers Say
              </h2>
            </div>

            {/* Two infinite rows: first drifts right, second drifts left */}
            <div className="flex flex-col gap-5">
              {[
                {
                  items: testimonials.filter((_, i) => i % 2 === 0),
                  anim: "animate-marquee-right",
                },
                {
                  items: testimonials.filter((_, i) => i % 2 === 1),
                  anim: "animate-marquee-left",
                },
              ].map(({ items, anim }) => {
                if (!items.length) return null;
                const loop = [...items, ...items, ...items, ...items];
                return (
                  <div
                    key={anim}
                    className="overflow-hidden py-2 motion-reduce:overflow-x-auto"
                  >
                    <div
                      className={`flex w-max ${anim} motion-reduce:animate-none`}
                      style={{ animationDuration: `${items.length * 12}s` }}
                    >
                      {loop.map((item, idx) => (
                        <div
                          key={idx}
                          className="mr-5 w-[300px] sm:w-[340px] lg:w-[380px] shrink-0 bg-surface rounded-card border border-border/80 shadow-card p-6 flex flex-col justify-between"
                        >
                          <div>
                            {/* 5 Yellow Stars */}
                            <div className="flex items-center gap-1 mb-4">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className="w-4 h-4 fill-warning text-warning"
                                />
                              ))}
                            </div>

                            {/* Review Quote */}
                            <p className="font-heading text-sm font-medium text-dark-800 leading-relaxed min-h-[58px]">
                              {item.comment}
                            </p>
                          </div>

                          {/* Author info */}
                          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/60">
                            <img
                              src={item.avatar}
                              alt={item.name}
                              width={44}
                              height={44}
                              className="w-11 h-11 rounded-full object-cover border border-border"
                              loading="lazy"
                            />
                            <div>
                              <h3 className="font-heading font-bold text-sm text-dark-900 leading-tight">
                                {item.name}
                              </h3>
                              <p className="font-heading text-xs text-muted mt-0.5">
                                {item.location}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* GET THE BOOKMYPROFESSIONAL APP SECTION */}
        <section className="relative py-14 sm:py-18 bg-gradient-to-b from-[#EBF5FE] to-[#E3F0FC] overflow-hidden border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-8">
              
              {/* Left Column: Heading + Subtitle + Store Buttons */}
              <div className="w-full lg:w-[38%] text-center lg:text-left flex flex-col items-center lg:items-start">
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-[25px] font-bold text-dark-900 leading-[1.18] tracking-tight">
                  Get the  {" "}<span className="text-primary-500"> BookMyProfessional </span> App
                </h2>
                <p className="mt-4 text-base sm:text-lg text-dark-600 font-normal leading-relaxed max-w-md">
                  Book, manage and connect with professionals on the go.
                </p>

                {/* App Store & Play Store Download Badges */}
                <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3.5 sm:gap-4">
                  {/* Apple App Store */}
                  <button
                    type="button"
                    onClick={openComingSoonModal}
                    className="inline-flex items-center gap-3 bg-black text-white px-5 py-2.5 rounded-[10px] hover:bg-dark-800 transition-all duration-200 shadow-card group"
                  >
                    <img
                      src="/images/top_categories/apple-logo.svg"
                      alt="Apple logo"
                      width={40}
                      height={40}
                      className="w-10 h-10 object-contain filter invert"
                      loading="lazy"
                    />
                    <div className="text-left leading-none">
                      <span className="text-[10px] text-dark-200 uppercase font-medium block mb-1">
                        Download on the
                      </span>
                      <span className="font-heading text-sm sm:text-base font-bold text-white tracking-tight">
                        App Store
                      </span>
                    </div>
                  </button>

                  {/* Google Play Store */}
                  <button
                    type="button"
                    onClick={openComingSoonModal}
                    className="inline-flex items-center gap-3 bg-black text-white px-5 py-2.5 rounded-[10px] hover:bg-dark-800 transition-all duration-200 shadow-card group"
                  >
                    <img
                      src="/images/top_categories/playstore.webp"
                      alt="Google Play logo"
                      width={40}
                      height={40}
                      className="w-10 h-10 object-contain"
                      loading="lazy"
                    />
                    <div className="text-left leading-none">
                      <span className="text-[10px] text-dark-200 uppercase font-medium block mb-1">
                        GET IT ON
                      </span>
                      <span className="font-heading text-sm sm:text-base font-bold text-white tracking-tight">
                        Google Play
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Center Column: Mobile Mockup Image */}
              <div className="w-full lg:w-[34%] flex items-center justify-center relative">
                <div className="relative max-w-[280px] sm:max-w-[380px] lg:max-w-[420px] drop-shadow-2xl">
                  <img
                    src="/images/top_categories/mobile_img.png"
                    alt="BookMyProfessional Mobile Application Mockup"
                    width={420}
                    height={630}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Right Column: 4 Feature Bullet Items with Blue Circular Icons */}
              <div className="w-full lg:w-[28%] flex flex-col justify-center space-y-5 sm:space-y-6">
                
                {/* Feature 1: Faster Booking */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-500 shrink-0 shadow-xs">
                    <Timer className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Faster Booking
                  </span>
                </div>

                {/* Feature 2: Manage Appointments */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-500 shrink-0 shadow-xs">
                    <CalendarCheck2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Manage Appointments
                  </span>
                </div>

                {/* Feature 3: Get Real-time Updates */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-500 shrink-0 shadow-xs">
                    <Bell className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Get Real-time Updates
                  </span>
                </div>

                {/* Feature 4: Available on iOS & Android */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-500 shrink-0 shadow-xs">
                    <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className="font-heading text-sm sm:text-base font-bold text-dark-900 leading-tight">
                    Available on iOS & Android
                  </span>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* YOUR NEXT PROFESSIONAL IS JUST A CLICK AWAY BANNER WITH BG_2.PNG */}
        <section
          className="relative py-16 sm:py-20 lg:py-24 bg-cover bg-center bg-no-repeat overflow-hidden border-b border-border"
          style={{
            backgroundImage: "url('/images/bg_2.png')",
          }}
        >
          {/* Subtle dark backdrop overlay for high readability */}
          <div className="absolute inset-0 bg-dark-900/50 backdrop-blur-[0.5px] pointer-events-none" />

          <div className="relative z-10 mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="relative flex flex-col items-center text-center">
              
              {/* Cursive handwritten note & curved arrow on top-right (matches screenshot) */}
              <div className="hidden sm:flex flex-col items-end absolute right-2 sm:right-6 lg:right-12 xl:right-16 -top-2 sm:top-2 text-right pointer-events-none select-none">
                <div className="font-handwriting text-white text-xl sm:text-2xl lg:text-[26px] font-normal leading-tight drop-shadow-md rotate-[-3deg]">
                  Better Services <br />
                  A Better Tomorrow
                </div>
                {/* Curved hand-drawn arrow pointing down and right */}
                <svg
                  className="w-9 h-9 sm:w-11 sm:h-11 text-white stroke-current mt-1 mr-4 drop-shadow-sm"
                  viewBox="0 0 50 50"
                  fill="none"
                >
                  <path
                    d="M 12 6 C 10 22, 18 36, 38 33"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 29 26 L 39 33 L 31 40"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Main Headline */}
              <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-bold text-white tracking-tight leading-[1.2] max-w-2xl drop-shadow-md">
                Your Next Professional <br />
                Is Just a Click Away
              </h2>

              {/* Subheadline description */}
              <p className="mt-3 text-sm sm:text-base md:text-lg text-white/90 font-normal max-w-xl drop-shadow-sm">
                Join thousands of happy customers today.
              </p>

              {/* CTA Buttons */}
              <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
                <Link
                  href="/professionals"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white bg-[#0070F3] hover:bg-[#0060df] rounded-xl shadow-md transition-all duration-200"
                >
                  Find a Professional
                </Link>
                <Link
                  href="/register?role=professional"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white bg-black/40 hover:bg-black/55 border border-white/80 hover:border-white rounded-xl backdrop-blur-xs transition-all duration-200"
                >
                  Join as a Professional
                </Link>
              </div>

              {/* Mobile version of handwritten note */}
              <div className="sm:hidden flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/20 text-center pointer-events-none select-none">
                <span className="font-handwriting text-white text-lg font-normal drop-shadow-sm">
                  Better Services, A Better Tomorrow
                </span>
              </div>

            </div>
          </div>
        </section>
      </main>

      {/* FOOTER - EXACT SCREENSHOT MATCH */}
      <footer className="bg-[#031726] text-white pt-14 pb-10 border-t border-[#0d2a44]">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-8 pb-12 border-b border-white/10">
            
            {/* Column 1: Brand Logo, Tagline, Description & Social Icons */}
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-between">
              <div>
                {/* Brand Logo */}
                <div className="flex flex-col">
                  <Link href="/" className="font-heading text-xl sm:text-2xl font-bold tracking-tight inline-block">
                    <span className="text-white">BookMy</span>
                    <span className="text-[#0070F3]">Professional</span>
                  </Link>
                  <span className="text-[11px] sm:text-xs text-white/70 font-normal tracking-wide mt-0.5">
                    Skilled People. Better Living.
                  </span>
                </div>

                {/* Description */}
                <p className="mt-4 text-xs sm:text-sm text-white/75 leading-relaxed max-w-xs">
                  Connecting you with trusted professionals for a better, easier and happier life.
                </p>
              </div>

              {/* Social Media Icons (admin-managed in Settings → Social Media Links) */}
              <div className="flex items-center gap-4 mt-6 text-white">
                {[
                  { key: "facebook", Icon: Facebook, label: "Facebook", cls: "fill-current" },
                  { key: "instagram", Icon: Instagram, label: "Instagram", cls: "stroke-[2.2]" },
                  { key: "linkedin", Icon: Linkedin, label: "LinkedIn", cls: "fill-current" },
                  { key: "youtube", Icon: Youtube, label: "YouTube", cls: "fill-current" },
                ]
                  .filter(({ key }) => social[key])
                  .map(({ key, Icon, label, cls }) => (
                    <a
                      key={key}
                      href={social[key]}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={label}
                      className="hover:text-[#0070F3] transition-colors p-1"
                    >
                      <Icon className={`w-5 h-5 ${cls}`} />
                    </a>
                  ))}
              </div>
            </div>

            {/* Column 2: Quick Links */}
            <div className="lg:ml-3">
              <h3 className="font-heading text-sm sm:text-base font-bold text-white mb-4">
                Quick Links
              </h3>
              <ul className="space-y-2.5 text-xs sm:text-sm text-white/75 font-normal">
                <li>
                  <Link href="/" className="hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/professionals" className="hover:text-white transition-colors">
                    Categories
                  </Link>
                </li>
                <li>
                  <Link href="/how-it-works" className="hover:text-white transition-colors">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: For Professionals */}
            <div>
              <h3 className="font-heading text-sm sm:text-base font-bold text-white mb-4">
                For Professionals
              </h3>
              <ul className="space-y-2.5 text-xs sm:text-sm text-white/75 font-normal">
                <li>
                  <Link
                    href="/register?role=professional"
                    className="hover:text-white transition-colors text-left inline-block"
                  >
                    Join as a Professional
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login?role=professional"
                    className="hover:text-white transition-colors text-left inline-block"
                  >
                    Professional Login
                  </Link>
                </li>
                <li>
                  <Link href="/vendor" className="hover:text-white transition-colors">
                    Vendor Portal
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition-colors">
                    Help & Support
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: For Customers */}
            <div>
              <h3 className="font-heading text-sm sm:text-base font-bold text-white mb-4">
                For Customers
              </h3>
              <ul className="space-y-2.5 text-xs sm:text-sm text-white/75 font-normal">
                <li>
                  <Link
                    href="/login?role=customer"
                    className="hover:text-white transition-colors text-left inline-block"
                  >
                    Customer Login
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard"
                    className="hover:text-white transition-colors text-left inline-block"
                  >
                    My Bookings
                  </Link>
                </li>
                <li>
                  <a href="#trust" className="hover:text-white transition-colors">
                    Safety & Trust
                  </a>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 5: Subscribe to our Newsletter */}
            <div>
              <h3 className="font-heading text-sm sm:text-base font-bold text-white mb-4">
                Subscribe to our Newsletter
              </h3>
              <p className="text-xs sm:text-sm text-white/75 mb-4">
                Get the latest updates and offers.
              </p>
              <form
                onSubmit={handleNewsletterSubmit}
                className="flex items-center bg-white rounded-[8px] p-1 shadow-sm max-w-sm"
              >
                <input
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Your email address"
                  className="w-full bg-transparent px-3 py-1.5 text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubscribing}
                  aria-label="Subscribe"
                  className="bg-[#0070F3] hover:bg-[#0060df] disabled:opacity-60 text-white p-2.5 rounded-[6px] transition-colors shrink-0 flex items-center justify-center shadow-xs"
                >
                  {isSubscribing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  )}
                </button>
              </form>
            </div>

          </div>

          {/* Bottom Row: Copyright right-aligned matching screenshot */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-end text-xs text-white/60">
            <p>© {new Date().getFullYear()} BookMyProfessional. All rights reserved.</p>
          </div>

        </div>
      </footer>
    </div>
  );
}
