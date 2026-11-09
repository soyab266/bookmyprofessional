/**
 * Login — server wrapper.
 * Generates unique metadata per role query variant while preserving clean canonical route
 * and excluding utility authentication pages from search engine indexing (noindex, follow).
 */

export const dynamic = "force-dynamic";

import LoginClient from "./LoginClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";
const OG_IMG   = `${SITE_URL}/og-image.png`;
const SITE_NAME = "Book My Professional";

export async function generateMetadata({ searchParams }) {
  const role = searchParams?.role;

  // Authentication utility pages are intentionally excluded from organic indexing (noindex, follow)
  // Canonical always points to the clean canonical route /login
  const canonical = `${SITE_URL}/login`;

  if (role === "professional") {
    return {
      title: "Professional Login",
      description:
        "Sign in to your BookMyProfessional professional account to manage your appointments, client messages, availability schedule, and service listings.",
      alternates: { canonical },
      openGraph: {
        type: "website", locale: "en_IN",
        url: `${SITE_URL}/login?role=professional`,
        siteName: SITE_NAME,
        title: "Professional Login",
        description: "Access your professional portal to manage appointments, services, and client bookings.",
        images: [{ url: OG_IMG, width: 1200, height: 630, alt: "Professional Login — Book My Professional" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Professional Login",
        description: "Access your professional portal on BookMyProfessional.",
        images: [OG_IMG],
      },
    };
  }

  if (role === "customer") {
    return {
      title: "Customer Login",
      description:
        "Sign in to your BookMyProfessional customer account to view upcoming bookings, track service requests, and communicate with verified professionals.",
      alternates: { canonical },
      openGraph: {
        type: "website", locale: "en_IN",
        url: `${SITE_URL}/login?role=customer`,
        siteName: SITE_NAME,
        title: "Customer Login",
        description: "Access your customer dashboard to view bookings and connect with verified professionals.",
        images: [{ url: OG_IMG, width: 1200, height: 630, alt: "Customer Login — Book My Professional" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Customer Login",
        description: "Access your customer dashboard on BookMyProfessional.",
        images: [OG_IMG],
      },
    };
  }

  // Default — /login (no role param)
  return {
    title: "Sign In",
    description:
      "Sign in to your BookMyProfessional account to manage appointments, bookings, and direct messages with verified professionals.",
    alternates: { canonical },
    openGraph: {
      type: "website", locale: "en_IN",
      url: `${SITE_URL}/login`,
      siteName: SITE_NAME,
      title: "Sign In",
      description: "Access your BookMyProfessional account to manage bookings and appointments.",
      images: [{ url: OG_IMG, width: 1200, height: 630, alt: "Sign In — Book My Professional" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sign In",
      description: "Access your BookMyProfessional account.",
      images: [OG_IMG],
    },
  };
}

export default function LoginPage() {
  return <LoginClient />;
}
