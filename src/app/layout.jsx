import { Inter, Poppins, Caveat } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";
import { ComingSoonProvider } from "@/context/ComingSoonContext";
import { LocationProvider } from "@/context/LocationContext";
import AuthModal from "@/components/AuthModal";
import ComingSoonModal from "@/components/ComingSoonModal";
import LiveLocationPrompt from "@/components/LiveLocationPrompt";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: ["500", "600", "700", "800"],
});

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
  weight: ["600", "700"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

const SITE_NAME = "Book My Professional";
const SITE_TITLE = "Book My Professional | Connect with Top Experts Instantly";
const SITE_DESCRIPTION =
  "Hire verified, experienced professionals for your projects, business, and personal needs with fast scheduling and guaranteed quality.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Book My Professional",
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  keywords: [
    "book a professional online",
    "find professionals online",
    "professional services marketplace",
    "online service booking platform",
    "book verified professionals",
    "find service providers near me",
    "hire professionals online",
    "online professional directory",
    "trusted service providers",
    "professional appointment booking",
    "electrician near me",
    "hire a plumber online",
    "book home cleaning service",
    "professional house cleaning services",
    "find a verified electrician",
    "local home service professionals",
    "find a doctor near me",
    "book doctor appointment online",
    "healthcare professionals near me",
    "online medical consultation",
    "find verified healthcare professionals",
    "find a tutor near me",
    "book a private tutor",
    "home tuition services",
    "online tutor booking",
    "experienced tutors near me",
    "private academic tutor",
    "IT support services near me",
    "hire an IT professional",
    "computer repair technician near me",
    "technical support services",
    "freelance IT consultant",
    "find a beautician near me",
    "book a beauty professional",
    "salon services near me",
    "professional makeup artist near me",
    "beauty services appointment booking",
    "find a consultant online",
    "hire a business consultant",
    "professional consultation booking",
    "find an expert for consultation",
    "book a professional consultation",
    "verified professionals online",
    "background-checked professionals",
    "professional credentials verification",
    "secure online service booking",
    "service provider ratings and reviews",
    "transparent service pricing",
    "secure payments for service bookings",
    "join as a professional",
    "register as a service provider",
    "list my services online",
    "get clients online as a professional",
    "find customers for my services",
    "online platform for service providers",
    "create a professional service profile",
    "get more service bookings",
    "professional service provider registration",
    "grow my service business online",
    "how online service booking works",
    "how to find a reliable professional",
    "how to choose a verified service provider",
    "BookMyProfessional"
],
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Book My Professional - Hire Verified Experts Across India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${caveat.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background font-sans text-dark-800 selection:bg-primary-100 selection:text-primary-800">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          <LocationProvider>
            <MarketplaceProvider>
              <ComingSoonProvider>
                <LiveLocationPrompt />
                {children}
                <AuthModal />
                <ComingSoonModal />
              </ComingSoonProvider>
            </MarketplaceProvider>
          </LocationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
