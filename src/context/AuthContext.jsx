"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/data/profiles";

const AuthContext = createContext(null);

function mapUser(authUser, profile) {
  const meta = authUser?.user_metadata || {};
  const email = profile?.email || authUser?.email || "";

  return {
    id: authUser?.id,
    name: profile?.full_name || meta.full_name || email.split("@")[0] || "User",
    email,
    phone: profile?.phone || meta.phone || "",
    role: profile?.role || meta.role || "customer",
    avatar: profile?.avatar_url || null,
    whatsapp_consent: Boolean(profile?.whatsapp_consent ?? meta.whatsapp_consent),
    user_metadata: meta,
  };
}

export function AuthProvider({ children }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("login"); // "login" | "signup"
  const [authRole, setAuthRole] = useState("customer"); // "customer" | "professional"
  const [user, setUser] = useState(null); // { id, name, email, role, avatar }
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Restore the session (Supabase) and stay in sync
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const hydrate = async (authUser) => {
      let profile = await getProfile(authUser.id);

      // Verify if OAuth initiated with professional role but profile defaulted to customer
      if (typeof window !== 'undefined') {
        try {
          const intendedRole = localStorage.getItem('oauth_role');
          const intendedNext = localStorage.getItem('oauth_next');
          if (intendedRole === 'professional') {
            const supabase = createClient();
            if (!profile || profile.role !== 'professional') {
              await supabase.from('profiles').update({ role: 'professional' }).eq('id', authUser.id);
              profile = { ...(profile || {}), role: 'professional' };
            }
            try {
              const { data: pro } = await supabase.from('professionals').select('id').eq('id', authUser.id).maybeSingle();
              if (!pro) {
                await supabase.from('professionals').insert({
                  id: authUser.id,
                  name: profile?.full_name || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'Professional',
                  role_title: 'Professional',
                  category: 'Doctors',
                  city: 'Mumbai',
                  verification_status: 'not_submitted',
                  is_active: true,
                });
              }
            } catch {}

            localStorage.removeItem('oauth_role');
            localStorage.removeItem('oauth_next');

            if (window.location.pathname === '/dashboard' || window.location.pathname === '/login' || window.location.pathname === '/register') {
              window.location.replace(intendedNext || '/vendor');
              return;
            }
          }
        } catch {}
      }

      if (active) {
        setUser(mapUser(authUser, profile));
        setIsLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        if (data?.session?.user) hydrate(data.session.user);
        else setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) hydrate(session.user);
      else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
  };

  const openAuthModal = (tab = "login", role = "customer") => {
    setAuthModalTab(tab);
    setAuthRole(role);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const login = async ({ identifier, email, password, role, next } = {}) => {
    const mail = (identifier || email || "").trim();

    if (!mail || !password) {
      const error = new Error("Please enter your email and password.");
      showToast(error.message, "error");
      throw error;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: mail,
      password,
    });

    if (error) {
      showToast(error.message, "error");
      throw error;
    }

    // Fetch profile immediately so we can redirect to the correct dashboard
    // without waiting for the onAuthStateChange → getProfile round-trip.
    let userRole = data.user?.user_metadata?.role || "customer";
    try {
      const profile = await getProfile(data.user.id);
      if (profile?.role) userRole = profile.role;
    } catch {
      // fall back to metadata role — redirect will still be correct in most cases
    }

    closeAuthModal();
    showToast(
      `Welcome back, ${data.user?.user_metadata?.full_name || mail.split("@")[0]}! You are now logged in.`
    );

    // Return enriched object so callers can redirect immediately
    return { ...data.user, _resolvedRole: userRole };
  };

  const signup = async ({
    fullName,
    name,
    email,
    phone,
    password,
    role,
    category,
    subcategory,
    city,
    pincode,
    whatsapp_consent,
  } = {}) => {
    const displayName = (fullName || name || "").trim();



    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName, role, phone, city, pincode, whatsapp_consent: Boolean(whatsapp_consent) },
      },
    });

    if (error) {
      showToast(error.message, "error");
      throw error;
    }

    if (role === "professional" && data?.user) {
      const insertProfile = (fields) => {
        const cleanSub = subcategory && subcategory.trim() && subcategory.toLowerCase() !== "professional" ? subcategory.trim() : null;
        const title = cleanSub || category || "Professional";
        return supabase.from("professionals").insert({
          id: data.user.id,
          name: displayName,
          category,
          subcategory: cleanSub,
          role_title: title,
          city,
          verification_status: "pending",
          ...fields,
        });
      };
      try {
        const { error: proError } = await insertProfile(pincode ? { pincode } : {});
        if (proError && pincode) {
          // ponytail: pincode column may not exist yet (schema not applied) — save the rest.
          const { error: retryError } = await insertProfile({});
          if (retryError) throw retryError;
        } else if (proError) {
          throw proError;
        }
      } catch {
        // ponytail: professionals row is best-effort — the table may not exist yet, and with
        // email confirmation on there is no session so RLS blocks the insert. Move this into a
        // DB trigger on profiles when the schema is applied.
      }
    }

    closeAuthModal();

    if (!data?.session) {
      showToast("Account created. Check your email to confirm it, then sign in.", "info");
      return { needsEmailConfirmation: true };
    }

    showToast(
      `Welcome to BookMyProfessional, ${displayName}! Your account was created successfully.`
    );
    return { user: data.user, role, redirectUrl: role === "professional" ? "/vendor" : "/dashboard" };
  };

  const logout = async () => {


    try {
      await createClient().auth.signOut();
    } catch {
      // ignore — local state is cleared below regardless
    }
    setUser(null);
    showToast("You have been signed out successfully.", "info");
  };

  const loginWithProvider = async (provider, options = {}) => {
    const safeProvider = provider.toLowerCase();
    const role = options.role || authRole || "customer";
    const defaultNext = role === "professional" ? "/vendor" : "/dashboard";
    const next = (options.next && options.next !== "/" && options.next !== "/login" && options.next !== "/register")
      ? options.next
      : defaultNext;

    // DIRECT GOOGLE OAUTH: Bypasses Supabase Auth URL Configuration completely
    if (safeProvider === "google") {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("oauth_role", role);
          localStorage.setItem("oauth_next", next);
        } catch {}
      }
      const targetUrl = new URL("/api/auth/google", window.location.origin);
      targetUrl.searchParams.set("role", role);
      targetUrl.searchParams.set("next", next);
      // Optional WhatsApp opt-in from the register form; carried through the
      // signed OAuth state to the callback (see /api/auth/google).
      if (options.whatsappConsent === true) {
        targetUrl.searchParams.set("wa", "1");
      }
      window.location.href = targetUrl.toString();
      return;
    }

    // Fallback for non-Google providers (if configured)
    const redirectUrl = new URL(`${window.location.origin}/auth/callback`);
    redirectUrl.searchParams.set("role", role);
    redirectUrl.searchParams.set("next", next);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: safeProvider,
      options: {
        redirectTo: redirectUrl.toString(),
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    if (error) {
      showToast(error.message, "error");
      throw error;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
    return data;
  };

  const resendVerificationEmail = async (email) => {

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      showToast(error.message, "error");
      throw error;
    }
    showToast("Verification email resent successfully! Check your inbox.");
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthModalOpen,
        authModalTab,
        authRole,
        user,
        isLoading,
        toastMessage,
        setAuthModalTab,
        setAuthRole,
        openAuthModal,
        closeAuthModal,
        login,
        loginWithProvider,
        signup,
        resendVerificationEmail,
        logout,
        showToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
