"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Briefcase,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import Button from "@/components/Button";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithProvider, resendVerificationEmail, showToast, user, isLoading: isAuthLoading } = useAuth();

  const [authRole, setAuthRole] = useState("customer"); // "customer" | "professional"
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    identifier: "",
    password: "",
    rememberMe: true,
  });

  // Honor ?role= / ?next= and bounce already-signed-in users to their dashboard.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role") === "professional") setAuthRole("professional");
    const err = params.get("error");
    if (err) {
      if (err === "GoogleOAuthCancelled") setErrorMessage("Google sign in was cancelled.");
      else if (err === "GoogleOAuthConfigMissing") setErrorMessage("Google OAuth is not configured yet. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
      else setErrorMessage(`Sign in failed (${err}). Please try again.`);
    }
    if (!isAuthLoading && user) {
      const next = params.get("next");
      const target = (next && next !== "/" && next !== "/login" && next !== "/register")
        ? next
        : (user.role === "professional" ? "/vendor" : "/dashboard");
      router.replace(target);
    }
  }, [isAuthLoading, user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!form.identifier.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!form.password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      // login() now resolves the role from the DB profile immediately
      const result = await login({ identifier: form.identifier, password: form.password, role: authRole });
      const resolvedRole = result?._resolvedRole || authRole;
      if (next && next !== "/" && next !== "/login" && next !== "/register") {
        router.replace(next);
      } else if (resolvedRole === "professional") {
        router.replace("/vendor");
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setErrorMessage(err.message || "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialAuth = async (provider) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const target = (next && next !== "/" && next !== "/login" && next !== "/register")
        ? next
        : (authRole === "professional" ? "/vendor" : "/dashboard");
      await loginWithProvider(provider.toLowerCase(), { role: authRole, next: target });
    } catch (err) {
      setErrorMessage(err.message || `Failed to sign in with ${provider}.`);
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
              Trusted by 15,000+ Verified Experts
            </span>
          </div> */}

          <h2 className="font-heading text-3xl sm:text-4xl font-bold leading-tight text-white">
            Connect with certified professionals in minutes.
          </h2>

          <p className="text-sm text-white/80 leading-relaxed">
            Manage your bookings, track service milestones, and experience transparent payment-protected scheduling across India.
          </p>
        </div>

        {/* Footer Guarantee */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-white/60 pt-4 border-t border-white/10">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>256-bit SSL Encrypted & India Data Privacy Compliant</span>
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="md:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-dark-900">
              Welcome Back
            </h1>
            <p className="text-xs sm:text-sm text-dark-500 mt-1">
              Please enter your login details to access your account.
            </p>
          </div>

          {errorMessage && (
            <div className="flex flex-col gap-2 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
              {errorMessage.toLowerCase().includes("email not confirmed") && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resendVerificationEmail(form.identifier);
                      setErrorMessage("");
                    } catch (err) {
                      setErrorMessage(err.message || "Failed to resend email.");
                    }
                  }}
                  className="mt-1 text-red-700 font-bold underline hover:text-red-900 text-left"
                >
                  Click here to resend verification email
                </button>
              )}
            </div>
          )}



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



          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-dark-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                <input
                  type="email"
                  required
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  placeholder="Enter your email address"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-surface border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-dark-700">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold text-primary-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-surface border border-border rounded-xl text-xs sm:text-sm text-dark-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
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

            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="w-full justify-center py-3 font-semibold text-sm shadow-button mt-2"
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-1.5" />
              )}
              Sign In to Account
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
            Don't have an account yet?{" "}
            <Link
              href="/register"
              className="font-bold text-primary-600 hover:text-primary-700 hover:underline"
            >
              Create Free Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
