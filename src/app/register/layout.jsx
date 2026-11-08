const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

// Minimal layout — per-variant metadata (title, description, canonical, robots)
// is handled by generateMetadata in register/page.jsx.
export const metadata = {
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Book My Professional",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function RegisterLayout({ children }) {
  return children;
}
