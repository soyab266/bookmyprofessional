import Link from "next/link";
import Navbar from "@/components/Navbar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Terms & Conditions",
  description: "Review BookMyProfessional Terms & Conditions covering appointments, escrow payments, cancellation policies, and professional code of conduct.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/terms`,
    siteName: "Book My Professional",
    title: "Terms & Conditions",
    description: "BookMyProfessional's platform terms covering bookings, escrow payments, cancellations, refunds, and professional verification.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Terms & Conditions — Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions",
    description: "Platform terms covering bookings, escrow payments, cancellations, and professional verification.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

const sections = [
  {
    h: "1. Acceptance of Terms",
    p: "By creating an account or making a booking on BookMyProfessional, you agree to be bound by these Terms and Conditions. These terms apply to all users — customers, professionals, and visitors. If you disagree with any part of these terms, please do not use the platform.",
  },
  {
    h: "2. Use of the Platform",
    p: "BookMyProfessional connects customers with verified service professionals across India, including doctors, tutors, electricians, plumbers, IT experts, beauticians, cleaners, and business consultants. By booking a service, you agree to provide accurate contact and service location details, to treat professionals respectfully, and to honour confirmed appointment schedules.",
  },
  {
    h: "3. Booking & Scheduling",
    p: "Bookings are confirmed once payment is successfully captured by our escrow partner. Appointment slots are reserved on a first-come, first-served basis. Professionals retain the right to accept or decline service requests at their discretion. A declined booking is refunded in full, typically within 3 to 5 business days to the original payment method.",
  },
  {
    h: "4. Payments & Escrow Protection",
    p: "All service payments are processed through our PCI-DSS compliant payment gateway (PayU) and held in secure escrow until service completion. Service fees are released to the professional only after the appointment is marked complete by the customer. In the event of a dispute, our resolution team mediates to ensure a fair outcome for both parties.",
  },
  {
    h: "5. Cancellations & Refunds",
    p: "Bookings may be cancelled and rescheduled directly from your customer dashboard. Cancellations made at least 24 hours before the scheduled appointment receive a full 100% refund. Late cancellations (within 24 hours) may be subject to a partial service fee as defined in the platform's refund policy. Eligible refunds are processed to the original payment method within 5 to 7 business days.",
  },
  {
    h: "6. Professional Verification",
    p: "Professionals on BookMyProfessional undergo a multi-tier verification process involving government ID checks, address verification, educational qualification review, and professional license validation. Verified professionals display an official badge on their profiles. While verification significantly reduces risk, it is not an absolute guarantee of service outcome. Customers are encouraged to review professional portfolios and ratings before booking.",
  },
  {
    h: "7. Reviews & Ratings",
    p: "Customers may submit honest, verified reviews after service completion. Reviews must be factually accurate, respectful, and based on direct experience. We prohibit fake reviews, defamatory content, and review manipulation. BookMyProfessional reserves the right to remove reviews that violate community guidelines.",
  },
  {
    h: "8. Acceptable Use",
    p: "You must not misuse the platform in any way, including submitting fake or fraudulent bookings, harassing professionals or customers, attempting to conduct transactions outside the platform to evade escrow protection or dispute resolution, requesting or performing unlawful services, or using automated scripts to access the platform. Violations may result in immediate account suspension or permanent ban.",
  },
  {
    h: "9. Limitation of Liability",
    p: "BookMyProfessional acts as a marketplace facilitator connecting customers and independent professionals. We are not liable for direct service outcomes, injuries, property damage, or losses arising from services rendered. Our liability is limited to the booking fee paid through the platform. This does not affect any rights you may have under applicable consumer protection law.",
  },
  {
    h: "10. Modifications to Terms",
    p: "We reserve the right to update these Terms and Conditions at any time to reflect changes in our services or applicable law. We will notify registered users of significant changes via email. Continued use of the platform after the updated terms take effect constitutes your acceptance of the revised terms.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-12">
        <h1 className="font-heading text-3xl font-bold text-dark-900">Terms &amp; Conditions</h1>
        <p className="text-sm text-dark-500 mt-1">Last updated: October 2026</p>
        <p className="text-sm text-dark-700 mt-4 leading-relaxed">
          These Terms and Conditions (&quot;Terms&quot;) govern your use of BookMyProfessional&apos;s website and services. Please read them carefully before creating an account or making a booking.
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
          Questions? Contact us at{" "}
          <Link href="/contact" className="text-primary-600 font-semibold hover:underline">
            our support page
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
