const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "How It Works",
  description: "Discover how BookMyProfessional connects you with verified experts in 4 steps with secure escrow payment protection and guaranteed quality.",
  keywords: [
    "how online service booking works",
    "how to find a reliable professional",
    "how to choose a verified service provider",
    "secure online service booking",
    "transparent service pricing",
    "secure payments for service bookings",
    "professional credentials verification",
    "book a professional consultation"
],
  alternates: {
    canonical: `${SITE_URL}/how-it-works`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/how-it-works`,
    siteName: "Book My Professional",
    title: "How It Works",
    description: "Learn how BookMyProfessional connects you with verified experts in 4 simple steps with escrow payment security.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "How BookMyProfessional Works",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "How It Works",
    description: "Learn how BookMyProfessional connects you with verified experts in 4 simple steps with escrow payment security.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function HowItWorksLayout({ children }) {
  return children;
}
