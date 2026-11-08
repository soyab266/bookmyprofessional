const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Browse Verified Professionals",
  description: "Search and hire verified service professionals across India. Compare vetted profiles, client ratings, transparent pricing, and book appointments with ease.",
  keywords: [
    "find professionals online",
    "online professional directory",
    "find service providers near me",
    "book verified professionals",
    "hire professionals online",
    "electrician near me",
    "hire a plumber online",
    "find a doctor near me",
    "find a tutor near me",
    "IT support services near me",
    "find a beautician near me",
    "service provider ratings and reviews"
],
  alternates: {
    canonical: `${SITE_URL}/professionals`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/professionals`,
    siteName: "Book My Professional",
    title: "Browse Verified Professionals",
    description: "Search and hire verified doctors, tutors, electricians, plumbers, IT experts and more across India. Compare profiles, ratings, and book instantly.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Browse Verified Professionals — Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Browse Verified Professionals",
    description: "Search and hire verified doctors, tutors, electricians, plumbers, IT experts and more across India.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function ProfessionalsLayout({ children }) {
  return children;
}
