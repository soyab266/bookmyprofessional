import Link from "next/link";
import Navbar from "@/components/Navbar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Privacy Policy",
  description: "Read BookMyProfessional Privacy Policy to understand how your personal details, booking records, and payment security are safeguarded under Indian law.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/privacy`,
    siteName: "Book My Professional",
    title: "Privacy Policy",
    description: "Understand how BookMyProfessional handles your personal data, payment security, and data rights under Indian privacy law.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Privacy Policy — Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy",
    description: "Understand how BookMyProfessional handles your personal data and privacy rights.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

const sections = [
  {
    h: "1. What Data We Collect",
    p: "We collect account details (your full name, email address, and phone number), booking and service information such as appointment dates, service type, and payment status. Professionals additionally submit verification documents including government-issued ID, address proof, and professional qualifications or certifications.",
  },
  {
    h: "2. How We Use Your Information",
    p: "Your data is used to match customers with the most relevant verified professionals, process and confirm bookings, facilitate escrow-backed payments, and send appointment notifications via email and WhatsApp. We use aggregate, anonymised data to improve our matching algorithms and service recommendations. We do not sell, rent, or share your personal information with third-party advertisers.",
  },
  {
    h: "3. Payment Security",
    p: "All card, UPI, and net banking credentials are handled exclusively by our PCI-DSS compliant payment gateway partner PayU. Card numbers, CVV codes, and bank credentials never pass through or get stored on our servers. Transaction records showing payment status and reference IDs are retained for billing and dispute resolution purposes.",
  },
  {
    h: "4. Data Storage & Security",
    p: "Your personal and booking data is stored in encrypted PostgreSQL databases hosted on Supabase with row-level security policies that ensure each user can only access their own records. Verification documents (ID proofs, certificates) are stored in private, access-controlled storage buckets that are readable only by you and our authorised compliance team.",
  },
  {
    h: "5. Your Rights & Data Control",
    p: "You may update your personal information (name, phone, address, profile photo) at any time from your account dashboard. You can request complete deletion of your account and associated data by contacting our support team. We honour all data-erasure requests within 30 days in compliance with applicable data protection regulations. After deletion, only anonymised aggregate statistics may be retained for internal analytics.",
  },
  {
    h: "6. Cookies & Tracking",
    p: "We use essential HTTP-only session cookies to keep you securely signed in across browser sessions. We may use optional, privacy-respecting analytics cookies (without advertising trackers) to understand how visitors navigate our platform. You can opt out of non-essential cookies at any time via your browser settings.",
  },
  {
    h: "7. Third-Party Services",
    p: "BookMyProfessional integrates with PayU for payments, Brevo (Sendinblue) for transactional emails, and ImageKit for professional profile photo hosting. Each service processes only the minimum data necessary for their respective functions and maintains their own privacy and security standards.",
  },
  {
    h: "8. Changes to This Policy",
    p: "We may update this Privacy Policy periodically to reflect changes in our practices or applicable law. Significant changes will be communicated via email to registered users. Continued use of the platform after updates constitutes acceptance of the revised policy.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-12">
        <h1 className="font-heading text-3xl font-bold text-dark-900">Privacy Policy</h1>
        <p className="text-sm text-dark-500 mt-1">Last updated: October 2026</p>
        <p className="text-sm text-dark-700 mt-4 leading-relaxed">
          BookMyProfessional (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information when you use our platform to connect with verified professionals across India.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-heading text-lg font-bold text-dark-900">{s.h}</h2>
              <p className="text-sm text-dark-700 mt-2 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>
        <p className="text-sm text-dark-600 mt-10">
          Privacy questions? Reach us via{" "}
          <Link href="/contact" className="text-primary-600 font-semibold hover:underline">
            the contact page
          </Link>{" "}
          or email{" "}
          <a href="mailto:support@bookmyprofessional.com" className="text-primary-600 font-semibold hover:underline">
            support@bookmyprofessional.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
