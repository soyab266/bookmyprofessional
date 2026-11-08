const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Contact Support & Office Address",
  description: "Get in touch with BookMyProfessional support for booking assistance, verification queries, or business partnerships. Our team responds within 24 hours.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/contact`,
    siteName: "Book My Professional",
    title: "Contact Us",
    description: "Reach out to our support team for booking help, verification queries, or business partnerships. We respond within 24 hours.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Contact Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us",
    description: "Reach our support team for booking help, professional verification, or business enquiries.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function ContactLayout({ children }) {
  return children;
}
