"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { listCategories, listSubcategories, DEFAULT_CATEGORIES } from "@/lib/data/categories";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Briefcase,
  MapPin,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import Button from "@/components/Button";
import { cleanPincode, isValidPincodeFormat } from "@/lib/pincode";
import { cleanPhone, isValidIndianPhone } from "@/lib/phone";
import PincodeInput from "@/components/PincodeInput";
import { verifiedServiceLocation } from "@/lib/registration-service-location";

export default function RegisterPage() {
  const router = useRouter();
  const { signup, loginWithProvider, showToast, user, isLoading: isAuthLoading } = useAuth();

  const [authRole, setAuthRole] = useState("customer"); // "customer" | "professional"
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [step, setStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    let timer = null;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Honor ?role= and bounce already-signed-in users to their dashboard.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role") === "professional") setAuthRole("professional");
    if (!isAuthLoading && user) {
      router.replace(user.role === "professional" ? "/vendor" : "/dashboard");
    }
  }, [isAuthLoading, user, router]);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    category: "",
    subcategory: "",
    city: "",
    state: "",
    pincode: "",
    agreeTerms: false,
    agreeWhatsApp: false,
  });
  const [proPincodeVerification, setProPincodeVerification] = useState(null);

  // Professional categories come from the DB (active rows), seeded to defaults until loaded.
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [subcategories, setSubcategories] = useState({});
  useEffect(() => {
    let active = true;
    listCategories().then((cats) => {
      if (!active || !cats?.length) return;
      setCategories(cats);
      // Keep the selected specialty valid if the DB list no longer contains it.
      setForm((f) => (cats.includes(f.category) ? f : { ...f, category: "", subcategory: "" }));
    });
    listSubcategories().then((map) => {
      if (active) setSubcategories(map || {});
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!form.fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!form.phone.trim()) {
      setErrorMessage("Please enter your phone number.");
      return;
    }
    if (!isValidIndianPhone(form.phone)) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!form.agreeTerms) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy to continue.");
      return;
    }
    if (!form.agreeWhatsApp) {
      setErrorMessage(
        "Please agree to receive WhatsApp updates from BookMyProfessional to continue. You can turn them off anytime in Settings after signing up."
      );
      return;
    }
    if (!form.password || form.password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (authRole === "professional") {
      if (!form.category || !categories.includes(form.category)) {
        setErrorMessage("Please select your profession category.");
        return;
      }
      const availableSubs = subcategories[form.category] || [];
      if (availableSubs.length > 0 && !form.subcategory?.trim()) {
        setErrorMessage(`Please select a specialty subcategory for ${form.category}.`);
        return;
      }
      if (!form.pincode?.trim()) {
        setErrorMessage("Please enter your 6-digit service pincode.");
        return;
      }
      const cleanPin = cleanPincode(form.pincode);
      if (!isValidPincodeFormat(cleanPin)) {
        setErrorMessage("Please enter a valid 6-digit Indian pincode (cannot start with 0).");
        return;
      }
      if (!verifiedServiceLocation(cleanPin, proPincodeVerification)) {
        setErrorMessage(proPincodeVerification?.error || "Please wait for your service pincode to identify a city before continuing.");
        return;
      }
    }

    setIsLoading(true);
    try {
      // Step 1: Send OTP via Brevo API
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, type: 'signup' })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data?.remainingSeconds) setResendCooldown(data.remainingSeconds);
        throw new Error(data.error || 'Failed to send OTP.');
      }
      
      setStep("otp");
      setResendCooldown(data?.cooldown || 60);
      showToast("OTP sent to your email. Please check your inbox.", "info");
    } catch (err) {
      setErrorMessage(err.message || "Failed to initiate registration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage("");
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, type: 'signup' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.remainingSeconds) setResendCooldown(data.remainingSeconds);
        throw new Error(data.error || 'Failed to resend OTP.');
      }
      setResendCooldown(data?.cooldown || 60);
      showToast('New verification code sent to your email.', 'success');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialAuth = async (provider) => {
    try {
      setIsLoading(true);
      const target = authRole === "professional" ? "/vendor" : "/dashboard";
      await loginWithProvider(provider.toLowerCase(), { role: authRole, next: target, whatsappConsent: form.agreeWhatsApp });
    } catch (err) {
      setErrorMessage(err.message || `Failed to sign up with ${provider}.`);
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (otp.length !== 6) {
      setErrorMessage("Please enter the 6-digit OTP.");
      return;
    }

    setIsLoading(true);
    try {
      // Step 2: Verify OTP
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, type: 'signup', otp })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired OTP.');
      }

      // Step 3: Complete actual Supabase Signup
      const result = await signup({
        fullName: form.fullName,
        email: form.email,
        phone: cleanPhone(form.phone),
        password: form.password,
        role: authRole,
        category: authRole === "professional" ? form.category : undefined,
        subcategory: authRole === "professional" ? form.subcategory || undefined : undefined,
        city: authRole === "professional" ? form.city : undefined,
        pincode: authRole === "professional" ? form.pincode : undefined,
        whatsapp_consent: form.agreeWhatsApp,
      });
      if (result?.needsEmailConfirmation) {
        showToast("Check your email to confirm your account, then sign in.", "info");
        router.push("/login");
        return;
      }
      router.replace(authRole === "professional" ? "/vendor" : "/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Verification failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Column: Visual Brand Hero */}
      <div className="md:w-1/2 bg-gradient-to-br from-dark-900 via-primary-950 to-primary-900 text-white p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        {/* Brand Logo */}
        <Link href="/" className="relative z-10 flex flex-col group">
          <div className="flex items-baseline font-heading text-2xl font-bold tracking-tight text-white leading-none">
            <span>Book</span>
            <span className="text-primary-400">My</span>
            <span>Professional</span>
          </div>
          <span className="text-xs text-white/70 tracking-normal mt-1 leading-tight font-sans">
            Skilled People. Better Living.
          </span>
        </Link>

        {/* Hero Copy */}
        <div className="relative z-10 my-12 max-w-md space-y-4">
          {/* <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-xs font-semibold text-white">
              {authRole === "professional"
                ? "Join as a Verified Professional"
                : "Join 100,000+ Happy Customers"}
            </span>
          </div> */}

          <h2 className="font-heading text-3xl sm:text-4xl font-bold leading-tight text-white">
            {authRole === "professional"
              ? "Grow your freelance business with instant client appointments."
              : "Find trusted local experts with verified credentials."}
          </h2>

          <p className="text-sm text-white/80 leading-relaxed">
            {authRole === "professional"
              ? "Earn top market rates, manage your weekly availability, and receive guaranteed milestone payouts straight to your bank account."
              : "Compare prices, schedule in-person or remote consultations, and enjoy guaranteed escrow protection for every booking."}
          </p>
        </div>

        {/* Footer Guarantee */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-white/60 pt-4 border-t border-white/10">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>256-bit SSL Encrypted & India Data Privacy Compliant</span>
        </div>
      </div>

      {/* Right Column: Register Form */}
      <div className="md:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-5">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-dark-900">
              Create Free Account
            </h1>
            <p className="text-xs sm:text-sm text-dark-500 mt-1">
              Join BookMyProfessional today in less than a minute.
            </p>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {step === "otp" ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Enter 6-digit OTP sent to {form.email}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full px-4 py-3 text-center tracking-[1em] font-heading font-bold bg-surface border border-border rounded-xl text-lg text-dark-900 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full rounded-xl py-3 text-sm"
                disabled={isLoading}
              >
                {isLoading ? "Verifying..." : "Verify & Create Account"}
              </Button>
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("form"); setOtp(""); setErrorMessage(""); }}
                  className="text-dark-500 hover:text-dark-800 font-medium hover:underline cursor-pointer"
                >
                  ← Change Email / Back
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isLoading}
                  className={`font-semibold transition-colors ${
                    resendCooldown > 0
                      ? "text-dark-400 cursor-not-allowed"
                      : "text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                  }`}
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
                </button>
              </div>
            </form>
          ) : (
            <>



          {/* Role Switcher */}
          <div className="bg-dark-50 p-1.5 rounded-2xl border border-border flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAuthRole("customer")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                authRole === "customer"
                  ? "bg-surface text-primary-600 shadow-sm border border-border/80"
                  : "text-dark-600 hover:text-dark-900"
              }`}
            >
              <User className="h-4 w-4" />
              <span>Customer</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthRole("professional")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                authRole === "professional"
                  ? "bg-surface text-primary-600 shadow-sm border border-border/80"
                  : "text-dark-600 hover:text-dark-900"
              }`}
            >
              <Briefcase className="h-4 w-4" />
              <span>Professional</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-dark-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Enter your full name"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-surface border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Enter your email address"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-xl text-xs text-dark-900 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="10-digit mobile number"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-xl text-xs text-dark-900 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* Professional Specific Fields */}
            {authRole === "professional" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-primary-50/50 rounded-2xl border border-primary-100">
                <div>
                  <label className="block text-[11px] font-bold text-primary-900 mb-1">
                    Profession Category
                  </label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}
                    className="w-full px-3 py-2 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none"
                  >
                    <option value="" disabled>Select your category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-primary-900 mb-1">
                    {(subcategories[form.category] || []).length > 0 ? (
                      <>
                        Specialty Subcategory <span className="text-red-500">*</span>
                      </>
                    ) : (
                      "Specialty Subcategory"
                    )}
                  </label>
                  <select
                    value={form.subcategory}
                    onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-primary-200 rounded-xl text-xs text-dark-900 focus:outline-none"
                    required={(subcategories[form.category] || []).length > 0}
                  >
                    {(subcategories[form.category] || []).length > 0 ? (
                      <>
                        <option value="">Select your specialty...</option>
                        {(subcategories[form.category] || []).map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="">{form.category ? `General ${form.category}` : "Select a category first"}</option>
                    )}
                  </select>
                </div>
                <div>
                  <PincodeInput
                    value={form.pincode || ""}
                    onChange={(val) => {
                      setProPincodeVerification(null);
                      setForm((prev) => ({ ...prev, pincode: val, city: "", state: "" }));
                    }}
                    onVerified={(res) => {
                      setProPincodeVerification(res);
                      setForm((prev) => {
                        const location = verifiedServiceLocation(prev.pincode, res);
                        return { ...prev, city: location?.city || "", state: location?.state || "" };
                      });
                    }}
                    enforceLocationMatch={false}
                    label="Service Pincode"
                    placeholder="e.g. 501218"
                    required
                  />
                </div>

              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-dark-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 bg-surface border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.agreeTerms}
                  onChange={(e) => setForm({ ...form, agreeTerms: e.target.checked })}
                  className="mt-0.5 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0 cursor-pointer"
                />
                <span className="text-[11px] text-dark-600 leading-tight">
                  I agree to the{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 underline font-medium hover:text-primary-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Terms of Service
                  </Link>{' '}
                  &{' '}
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 underline font-medium hover:text-primary-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </Link>{' '}
                  of BookMyProfessional. <span className="text-rose-500 font-medium">*</span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.agreeWhatsApp}
                  onChange={(e) => setForm({ ...form, agreeWhatsApp: e.target.checked })}
                  className="mt-0.5 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0 cursor-pointer"
                />
                <span className="text-[11px] text-dark-600 leading-tight">
                  I agree to receive booking updates, appointment reminders, and other relevant
                  notifications from BookMyProfessional on WhatsApp. You can turn this off
                  anytime in Settings. <span className="text-rose-500 font-medium">*</span>
                </span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="w-full justify-center py-3 font-semibold text-sm shadow-button mt-2"
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              {authRole === "professional" ? "Register as Professional" : "Create Free Account"}
            </Button>
          </form>

          {/* Social Auth Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-2.5 text-dark-500 font-medium">Or</span>
            </div>
          </div>

          {/* Continue with Google */}
          <button
            type="button"
            onClick={() => handleSocialAuth("google")}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-surface border border-border rounded-xl text-xs sm:text-sm font-semibold text-dark-800 hover:bg-dark-50 hover:border-dark-300 transition-colors cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <p className="text-xs text-center text-dark-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-primary-600 hover:text-primary-700 hover:underline"
            >
              Sign In
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
