"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { listCategories, listSubcategories, DEFAULT_CATEGORIES } from "@/lib/data/categories";
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Briefcase,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Building2,
  MapPin,
  Sparkles,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import Button from "./Button";
import { cleanPincode, isValidPincodeFormat } from "@/lib/pincode";
import PincodeInput from "./PincodeInput";

export default function AuthModal() {
  const router = useRouter();
  const {
    isAuthModalOpen,
    authModalTab,
    authRole,
    setAuthModalTab,
    setAuthRole,
    closeAuthModal,
    login,
    signup,
    loginWithProvider,
    showToast,
    toastMessage,
  } = useAuth();

  // Mode: "auth" (login/signup) or "forgot-password"
  const [viewMode, setViewMode] = useState("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [forgotPasswordSubmitted, setForgotPasswordSubmitted] = useState(false);

  // Form states
  const [loginForm, setLoginForm] = useState({
    identifier: "",
    password: "",
    rememberMe: true,
  });

  const [signupForm, setSignupForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    category: "",
    subcategory: "",
    city: "Mumbai",
    pincode: "",
    agreeTerms: false,
    agreeWhatsApp: false,
  });

  const [forgotEmail, setForgotEmail] = useState("");
  const [proPincodeVerification, setProPincodeVerification] = useState(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isAuthModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isAuthModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      // Reset view modes on close
      setTimeout(() => {
        setViewMode("auth");
        setErrorMessage("");
        setForgotPasswordSubmitted(false);
      }, 200);
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isAuthModalOpen]);

  // Professional categories come from the DB (active rows), seeded to defaults until loaded.
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [subcategories, setSubcategories] = useState({});
  useEffect(() => {
    let active = true;
    listCategories().then((cats) => {
      if (!active || !cats?.length) return;
      setCategories(cats);
      setSignupForm((f) => (cats.includes(f.category) ? f : { ...f, category: "", subcategory: "" }));
    });
    listSubcategories().then((map) => {
      if (active) setSubcategories(map || {});
    });
    return () => {
      active = false;
    };
  }, []);

  if (!isAuthModalOpen) return <ToastNotification toastMessage={toastMessage} />;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!loginForm.identifier.trim()) {
      setErrorMessage("Please enter your email address");
      return;
    }
    if (!loginForm.password) {
      setErrorMessage("Please enter your password");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login({ identifier: loginForm.identifier, password: loginForm.password, role: authRole });
      const resolvedRole = result?._resolvedRole || authRole;
      // Immediate role-based redirect
      if (resolvedRole === "professional") {
        router.replace("/vendor");
      } else {
        router.replace("/dashboard");
      }
    } catch (error) {
      setErrorMessage(error?.message || "Unable to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!signupForm.fullName.trim()) {
      setErrorMessage("Please enter your full name");
      return;
    }
    if (!signupForm.email.trim() || !signupForm.email.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      return;
    }
    if (!signupForm.phone.trim()) {
      setErrorMessage("Please enter your phone number");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(signupForm.phone.replace(/\D/g, ""))) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number");
      return;
    }
    if (!signupForm.password || signupForm.password.length < 6) {
      setErrorMessage("Password must be at least 6 characters");
      return;
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }
    if (!signupForm.agreeTerms) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy");
      return;
    }
    if (!signupForm.agreeWhatsApp) {
      setErrorMessage(
        "Please agree to receive WhatsApp updates from BookMyProfessional to continue. You can turn them off anytime in Settings."
      );
      return;
    }
    if (authRole === "professional") {
      if (!signupForm.category || !categories.includes(signupForm.category)) {
        setErrorMessage("Please select your profession category.");
        return;
      }
      const availableSubs = subcategories[signupForm.category] || [];
      if (availableSubs.length > 0 && !signupForm.subcategory?.trim()) {
        setErrorMessage(`Please select a specialty subcategory for ${signupForm.category}.`);
        return;
      }
      if (!signupForm.pincode?.trim()) {
        setErrorMessage("Please enter your 6-digit service pincode");
        return;
      }
      const cleanPin = cleanPincode(signupForm.pincode);
      if (!isValidPincodeFormat(cleanPin)) {
        setErrorMessage("Please enter a valid 6-digit Indian pincode (cannot start with 0)");
        return;
      }
      if (proPincodeVerification && !proPincodeVerification.valid) {
        setErrorMessage(proPincodeVerification.error || "Please enter a valid, verified Indian pincode");
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await signup({
        fullName: signupForm.fullName,
        email: signupForm.email,
        phone: signupForm.phone,
        password: signupForm.password,
        role: authRole,
        category: authRole === "professional" ? signupForm.category : undefined,
        subcategory: authRole === "professional" ? signupForm.subcategory || undefined : undefined,
        city: authRole === "professional" ? signupForm.city : undefined,
        pincode: authRole === "professional" ? signupForm.pincode : undefined,
        whatsapp_consent: signupForm.agreeWhatsApp,
      });

      if (!result?.needsEmailConfirmation) {
        if (authRole === "professional") {
          router.replace("/vendor");
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (error) {
      setErrorMessage(error?.message || "Unable to create your account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to send reset instructions. Please try again.");
      setForgotPasswordSubmitted(true);
    } catch (error) {
      setErrorMessage(error?.message || "Unable to send reset instructions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Wire Google OAuth through loginWithProvider
  const handleSocialAuth = async (provider) => {
    try {
      setIsLoading(true);
      const target = authRole === "professional" ? "/vendor" : "/dashboard";
      await loginWithProvider(provider.toLowerCase(), { role: authRole, next: target });
    } catch (err) {
      showToast(err?.message || `Failed to sign in with ${provider}.`, "error");
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Toast Notification Container */}
      <ToastNotification toastMessage={toastMessage} />

      {/* Main Modal Backdrop */}
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
        {/* Dark Backdrop Overlay with Blur */}
        <div
          className="fixed inset-0 bg-dark-900/65 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
          onClick={closeAuthModal}
          aria-hidden="true"
        />

        {/* Modal Window Container */}
        <div
          className="relative w-full max-w-[480px] my-auto bg-surface rounded-2xl shadow-2xl border border-border/80 overflow-hidden z-10 transition-all duration-300 animate-in zoom-in-95 fade-in"
          role="dialog"
          aria-modal="true"
        >
          {/* Top Decorative Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-primary-400 to-sky-400" />

          {/* Close Button */}
          <button
            type="button"
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-2 rounded-full text-dark-400 hover:text-dark-800 hover:bg-dark-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 z-10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-5 sm:p-7">
            {/* Logo & Header */}
            <div className="text-center mb-5">
              <div className="inline-flex items-baseline font-heading text-xl sm:text-2xl font-bold tracking-tight text-dark-900 leading-none">
                <span>Book</span>
                <span className="text-primary-500">My</span>
                <span>Professional</span>
              </div>
              <p className="text-xs text-dark-500 mt-1 font-sans">
                {viewMode === "forgot-password"
                  ? "Reset your account password"
                  : authModalTab === "login"
                  ? "Welcome back! Please enter your details to sign in."
                  : "Join thousands of clients & top verified experts today."}
              </p>
            </div>

            {/* ERROR ALERT */}
            {errorMessage && (
              <div className="mb-4 flex items-center gap-2 p-3 text-xs sm:text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}



            {/* FORGOT PASSWORD VIEW */}
            {viewMode === "forgot-password" ? (
              <div className="space-y-4">
                {forgotPasswordSubmitted ? (
                  <div className="text-center py-4 space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h3 className="font-heading font-semibold text-dark-900 text-base">
                      Password Reset Link Sent
                    </h3>
                    <p className="text-xs text-dark-600 max-w-xs mx-auto">
                      We've sent an email to <span className="font-semibold text-dark-800">{forgotEmail}</span> with instructions to reset your password.
                    </p>
                    <Button
                      variant="primary"
                      className="w-full mt-3 justify-center"
                      onClick={() => {
                        setViewMode("auth");
                        setAuthModalTab("login");
                        setForgotPasswordSubmitted(false);
                      }}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                        Registered Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="email"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="Enter your email address"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-dark-50 border border-border rounded-lg text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading}
                      className="w-full justify-center py-2.5 font-semibold text-sm shadow-button"
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      ) : (
                        <KeyRound className="h-4 w-4 mr-2" />
                      )}
                      Send Reset Instructions
                    </Button>

                    <button
                      type="button"
                      onClick={() => setViewMode("auth")}
                      className="w-full text-center text-xs font-medium text-dark-600 hover:text-primary-600 pt-1"
                    >
                      ← Back to Login
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <>
                {/* ROLE SWITCHER: Customer vs Professional */}
                <div className="mb-4 bg-dark-50 p-1 rounded-xl border border-border flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAuthRole("customer")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      authRole === "customer"
                        ? "bg-surface text-primary-600 shadow-sm border border-border/80"
                        : "text-dark-600 hover:text-dark-900"
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>Customer (I need help)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthRole("professional")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      authRole === "professional"
                        ? "bg-surface text-primary-600 shadow-sm border border-border/80"
                        : "text-dark-600 hover:text-dark-900"
                    }`}
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    <span>Professional (I offer services)</span>
                  </button>
                </div>

                {/* LOGIN / SIGN UP TABS */}
                <div className="flex border-b border-border mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalTab("login");
                      setErrorMessage("");
                    }}
                    className={`flex-1 pb-2.5 text-sm font-semibold transition-all text-center relative ${
                      authModalTab === "login"
                        ? "text-primary-600"
                        : "text-dark-500 hover:text-dark-800"
                    }`}
                  >
                    Sign In
                    {authModalTab === "login" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalTab("signup");
                      setErrorMessage("");
                    }}
                    className={`flex-1 pb-2.5 text-sm font-semibold transition-all text-center relative ${
                      authModalTab === "signup"
                        ? "text-primary-600"
                        : "text-dark-500 hover:text-dark-800"
                    }`}
                  >
                    Create Account
                    {authModalTab === "signup" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
                    )}
                  </button>
                </div>



                {/* LOGIN FORM */}
                {authModalTab === "login" && (
                  <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1">
                        Email or Mobile Number
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="text"
                          required
                          value={loginForm.identifier}
                          onChange={(e) =>
                            setLoginForm({ ...loginForm, identifier: e.target.value })
                          }
                          placeholder="Enter your email address"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-dark-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => setViewMode("forgot-password")}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={loginForm.password}
                          onChange={(e) =>
                            setLoginForm({ ...loginForm, password: e.target.value })
                          }
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={loginForm.rememberMe}
                          onChange={(e) =>
                            setLoginForm({ ...loginForm, rememberMe: e.target.checked })
                          }
                          className="rounded border-border text-primary-500 focus:ring-primary-500 h-4 w-4"
                        />
                        <span className="text-xs text-dark-600 font-medium">
                          Remember me for 30 days
                        </span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading}
                      className="w-full justify-center py-2.5 mt-2 font-semibold text-sm shadow-button"
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-1.5" />
                      )}
                      Sign In to Account
                    </Button>

                    <div className="text-center pt-2">
                      <p className="text-xs text-dark-500">
                        Don't have an account?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthModalTab("signup");
                            setErrorMessage("");
                          }}
                          className="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          Sign Up free
                        </button>
                      </p>
                    </div>

                    {/* Google OAuth */}
                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-border" />
                      <span className="mx-3 text-[11px] text-dark-400 shrink-0">or</span>
                      <div className="flex-grow border-t border-border" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSocialAuth("google")}
                      className="w-full flex items-center justify-center gap-2.5 border border-border rounded-xl py-2.5 text-sm font-medium text-dark-700 hover:bg-surface-50 transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>
                  </form>
                )}

                {/* SIGN UP FORM */}
                {authModalTab === "signup" && (
                  <form onSubmit={handleSignupSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-dark-700 mb-1">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                        <input
                          type="text"
                          required
                          value={signupForm.fullName}
                          onChange={(e) =>
                            setSignupForm({ ...signupForm, fullName: e.target.value })
                          }
                          placeholder="Enter your full name"
                          className="w-full pl-10 pr-3.5 py-2 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type="email"
                            required
                            value={signupForm.email}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, email: e.target.value })
                            }
                            placeholder="Enter your email address"
                            className="w-full pl-10 pr-3 py-2 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type="tel"
                            required
                            value={signupForm.phone}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, phone: e.target.value })
                            }
                            placeholder="10-digit mobile number"
                            className="w-full pl-10 pr-3 py-2 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* PROFESSIONAL SPECIFIC EXTRA FIELDS */}
                    {authRole === "professional" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-primary-50/50 rounded-xl border border-primary-100 animate-in fade-in">
                        <div>
                          <label className="block text-[11px] font-semibold text-primary-900 mb-1">
                            Your Profession / Specialty
                          </label>
                          <select
                            required
                            value={signupForm.category}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, category: e.target.value, subcategory: "" })
                            }
                            className="w-full px-2.5 py-2 bg-white border border-primary-200 rounded-lg text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
                          <label className="block text-[11px] font-semibold text-primary-900 mb-1">
                            {(subcategories[signupForm.category] || []).length > 0 ? (
                              <>
                                Specialty Subcategory <span className="text-red-500">*</span>
                              </>
                            ) : (
                              "Specialty Subcategory"
                            )}
                          </label>
                          <select
                            value={signupForm.subcategory}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, subcategory: e.target.value })
                            }
                            className="w-full px-2.5 py-2 bg-white border border-primary-200 rounded-lg text-xs text-dark-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            required={(subcategories[signupForm.category] || []).length > 0}
                          >
                            {(subcategories[signupForm.category] || []).length > 0 ? (
                              <>
                                <option value="">Select your specialty...</option>
                                {(subcategories[signupForm.category] || []).map((sub) => (
                                  <option key={sub} value={sub}>
                                    {sub}
                                  </option>
                                ))}
                              </>
                            ) : (
                              <option value="">{signupForm.category ? `General ${signupForm.category}` : "Select a category first"}</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <PincodeInput
                            value={signupForm.pincode || ""}
                            onChange={(val) => {
                              setSignupForm((prev) => ({
                                ...prev,
                                pincode: val,
                                city: val.length < 6 ? "" : prev.city,
                                state: val.length < 6 ? "" : prev.state,
                              }));
                            }}
                            onVerified={(res) => setProPincodeVerification(res)}
                            onCityDetected={(detectedCity, res) => {
                              setSignupForm((prev) => ({
                                ...prev,
                                city: detectedCity,
                                state: res?.state || prev.state || "",
                              }));
                            }}
                            enforceLocationMatch={false}
                            label="Service Pincode"
                            placeholder="e.g. 501218"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-primary-900 mb-1">
                            City / Area & State
                          </label>
                          <div className="relative">
                            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-500" />
                            <input
                              type="text"
                              readOnly
                              value={signupForm.city ? `${signupForm.city}${signupForm.state ? `, ${signupForm.state}` : ""}` : ""}
                              placeholder="Auto-filled from Pincode"
                              className="w-full pl-8 pr-2.5 py-2 bg-dark-100 border border-primary-200 rounded-lg text-xs text-dark-900 cursor-not-allowed font-medium focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PASSWORDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={signupForm.password}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, password: e.target.value })
                            }
                            placeholder="Min 6 chars"
                            className="w-full pl-10 pr-8 py-2 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            required
                            value={signupForm.confirmPassword}
                            onChange={(e) =>
                              setSignupForm({
                                ...signupForm,
                                confirmPassword: e.target.value,
                              })
                            }
                            placeholder="Re-enter password"
                            className="w-full pl-10 pr-8 py-2 bg-dark-50 border border-border rounded-lg text-xs sm:text-sm text-dark-900 placeholder:text-dark-400 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={signupForm.agreeTerms}
                          onChange={(e) =>
                            setSignupForm({ ...signupForm, agreeTerms: e.target.checked })
                          }
                          className="mt-0.5 rounded border-border text-primary-500 focus:ring-primary-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="text-[11px] text-dark-600 leading-tight">
                          I agree to BookMyProfessional&apos;s{" "}
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Terms
                          </a>{" "}
                          &{" "}
                          <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Privacy Policy
                          </a>
                          . <span className="text-rose-500 font-medium">*</span>
                        </span>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={signupForm.agreeWhatsApp}
                          onChange={(e) =>
                            setSignupForm({ ...signupForm, agreeWhatsApp: e.target.checked })
                          }
                          className="mt-0.5 rounded border-border text-primary-500 focus:ring-primary-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="text-[11px] text-dark-600 leading-tight">
                          I agree to receive booking updates, reminders, and notifications from
                          BookMyProfessional on WhatsApp. You can turn this off anytime in
                          Settings. <span className="text-rose-500 font-medium">*</span>
                        </span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading}
                      className="w-full justify-center py-2.5 mt-2 font-semibold text-sm shadow-button"
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1.5" />
                      )}
                      {authRole === "professional"
                        ? "Register as Professional"
                        : "Create Free Account"}
                    </Button>

                    <div className="text-center pt-1">
                      <p className="text-xs text-dark-500">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthModalTab("login");
                            setErrorMessage("");
                          }}
                          className="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          Sign In
                        </button>
                      </p>
                    </div>

                    {/* Google OAuth */}
                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-border" />
                      <span className="mx-3 text-[11px] text-dark-400 shrink-0">or</span>
                      <div className="flex-grow border-t border-border" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSocialAuth("google")}
                      className="w-full flex items-center justify-center gap-2.5 border border-border rounded-xl py-2.5 text-sm font-medium text-dark-700 hover:bg-surface-50 transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>
                  </form>
                )}
              </>
            )}

            {/* TRUST BADGE AT FOOTER */}
            <div className="mt-5 pt-3 border-t border-border/80 flex items-center justify-center gap-1.5 text-[11px] text-dark-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>256-bit SSL Encrypted & Verified Privacy</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Crisp Toast component
function ToastNotification({ toastMessage }) {
  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[1000] max-w-sm bg-dark-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-dark-700 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <p className="text-xs sm:text-sm font-medium leading-snug">
        {toastMessage.message}
      </p>
    </div>
  );
}
