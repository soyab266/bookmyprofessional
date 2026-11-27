import Link from "next/link";
import Navbar from "@/components/Navbar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How cancellations, rescheduling and refunds work on BookMyProfessional: the 24-hour cancellation window, refund methods, processing timelines and dispute resolution.",
  alternates: {
    canonical: `${SITE_URL}/refund`,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/refund`,
    siteName: "Book My Professional",
    title: "Refund & Cancellation Policy",
    description:
      "BookMyProfessional's refund and cancellation policy: 24-hour free cancellation window, refunds to the original payment method via PayU, and dispute resolution.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Refund & Cancellation Policy — Book My Professional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Refund & Cancellation Policy",
    description:
      "24-hour free cancellation window, refunds to the original payment method via PayU, and dispute resolution.",
    images: [`${SITE_URL}/og-image.png`],
  },
};

const sections = [
  {
    id: "cancelling-a-booking",
    h: "1. Cancelling a Booking",
    p: "You can cancel a booking yourself from your customer dashboard up to 24 hours before the scheduled appointment. Cancellations in this window receive a full 100% refund. Inside 24 hours of the appointment, online cancellation is not available. Contact our support team with your booking ID and we will review your request case by case. A refund is not automatic in this window.",
  },
  {
    id: "professional-declines",
    h: "2. If a Professional Declines or Does Not Arrive",
    p: "If a professional declines your booking request or does not arrive for a confirmed appointment, contact our support team with your booking ID. Our team will review the booking and process your refund.",
  },
  {
    id: "how-refunds-are-paid",
    h: "3. How Refunds Are Paid",
    p: "Every refund goes back to the original payment method through our payment gateway, PayU. Refunds can only be sent to the same account or card you paid from, never in cash or to a different account. Once we process a refund, PayU advises that it takes 5 to 21 days to reflect in your account, depending on your bank or payment method.",
  },
  {
    id: "rescheduling",
    h: "4. Rescheduling",
    p: "You can reschedule a paid, upcoming booking from your customer dashboard up to 24 hours before the appointment at no extra charge. The new time slot depends on the professional's availability.",
  },
  {
    id: "service-problems-disputes",
    h: "5. Service Problems and Disputes",
    p: "If the delivered service does not match what you booked, contact our support team through the Contact page, by email or by phone. Our team reviews the booking with you and the professional and works toward a fair outcome.",
  },
  {
    id: "service-delivery-no-shipping",
    h: "6. Service Delivery (No Shipping)",
    p: "BookMyProfessional sells services, not physical goods. Your service is delivered by the professional at the appointment time and location you booked. Nothing is shipped to you, and no shipping or delivery charges apply.",
  },
];

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-12">
        <h1 className="font-heading text-3xl font-bold text-dark-900">Refund &amp; Cancellation Policy</h1>
        <p className="text-sm text-dark-500 mt-1">Last updated: November 2026</p>
        <p className="text-sm text-dark-700 mt-4 leading-relaxed">
          This policy explains how cancellations, rescheduling and refunds work on BookMyProfessional. It applies to every paid booking made through the platform.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.h} id={s.id}>
              <h2 className="font-heading text-lg font-bold text-dark-900">{s.h}</h2>
              <p className="text-sm text-dark-700 mt-2 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>
        <p className="text-sm text-dark-600 mt-10">
          Questions about a refund? Contact us at{" "}
          <Link href="/contact" className="text-primary-600 font-semibold hover:underline">
            our support page
          </Link>
          , email{" "}
          <a href="mailto:support@bookmyprofessional.com" className="text-primary-600 font-semibold hover:underline">
            support@bookmyprofessional.com
          </a>{" "}
          or call +91 89193 28705 (Mon to Sat, 9 AM to 6 PM IST).
        </p>
      </main>
    </div>
  );
}
