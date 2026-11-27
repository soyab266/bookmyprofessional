"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import HowItWorks from "@/components/HowItWorks";
import { getSiteContent } from "@/lib/data/site-content";
import { ChevronRight, Facebook, Instagram, Linkedin, Youtube } from "lucide-react";

export default function HowItWorksPage() {
  const [social, setSocial] = useState({});

  useEffect(() => {
    let active = true;
    getSiteContent().then((content) => {
      if (!active) return;
      setSocial(content.social);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-dark-800">
      <Navbar />

      {/* BREADCRUMB */}
      <div className="bg-surface border-b border-border py-3">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs text-dark-500 font-medium">
            <Link href="/" className="hover:text-primary-600 transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-400" />
            <span className="text-dark-900 font-semibold">How It Works</span>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <HowItWorks />

        {/* DETAILED SERVICE BREAKDOWN & SEO CONTENT */}
        <section className="bg-surface py-16 border-t border-border">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 space-y-14">
            {/* Value Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-dark-50/70 p-6 rounded-2xl border border-border/80">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-lg mb-4">
                  01
                </div>
                <h2 className="font-heading text-lg font-bold text-dark-900 mb-2">
                  Multi-Tier Verification
                </h2>
                <p className="text-xs sm:text-sm text-dark-600 leading-relaxed">
                  Every doctor, tutor, electrician, technician, and consultant undergoes strict government ID checks, educational qualification review, and practical skill verification before taking appointments.
                </p>
              </div>

              <div className="bg-dark-50/70 p-6 rounded-2xl border border-border/80">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg mb-4">
                  02
                </div>
                <h2 className="font-heading text-lg font-bold text-dark-900 mb-2">
                  Guaranteed Escrow Protection
                </h2>
                <p className="text-xs sm:text-sm text-dark-600 leading-relaxed">
                  Your payment is securely held in escrow via PayU. The professional is only paid once the service is delivered and marked complete, giving you peace of mind and complete financial security.
                </p>
              </div>

              <div className="bg-dark-50/70 p-6 rounded-2xl border border-border/80">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg mb-4">
                  03
                </div>
                <h2 className="font-heading text-lg font-bold text-dark-900 mb-2">
                  Transparent Pricing &amp; Rescheduling
                </h2>
                <p className="text-xs sm:text-sm text-dark-600 leading-relaxed">
                  No hidden platform fees, surprise travel surcharges, or opaque estimates. View clear upfront hourly or service rates, with instant free rescheduling up to 24 hours prior to your scheduled time.
                </p>
              </div>
            </div>

            {/* Step-by-Step Guidance */}
            <div className="space-y-6">
              <div className="border-b border-border pb-4">
                <h2 className="font-heading text-2xl font-bold text-dark-900">
                  Step-by-Step Service Guide for Customers &amp; Clients
                </h2>
                <p className="text-xs sm:text-sm text-dark-500 mt-1">
                  Everything you need to know about booking, consulting, and completing a milestone on BookMyProfessional.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-dark-700 leading-relaxed">
                <div className="space-y-4 bg-background p-6 rounded-xl border border-border">
                  <h3 className="font-heading font-bold text-dark-900 text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs">A</span>
                    Finding &amp; Selecting the Best Professional
                  </h3>
                  <p>
                    Use our verified directory to filter by profession category, specialty subcategory, city, pincode, and customer ratings. Review detailed professional portfolios, badges, experience timelines, and previous client feedback.
                  </p>
                  <p>
                    Whether you need an in-person home visit in Hyderabad, Bangalore, or Mumbai, or a remote consultation via video, you can view the exact slot availability in real time.
                  </p>
                </div>

                <div className="space-y-4 bg-background p-6 rounded-xl border border-border">
                  <h3 className="font-heading font-bold text-dark-900 text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs">B</span>
                    Completing the Service &amp; Payout Release
                  </h3>
                  <p>
                    Once your consultation or project appointment is completed satisfactorily, mark the booking as finished in your customer dashboard. You will receive an official digital invoice with full GST details.
                  </p>
                  <p>
                    Leave an honest, verified review to help fellow community members. In the rare event of a dispute, our dedicated resolution team intervenes to enforce fair refunds or free rework.
                  </p>
                </div>
              </div>
            </div>

            {/* How It Works FAQ */}
            <div className="space-y-6">
              <h2 className="font-heading text-2xl font-bold text-dark-900 border-b border-border pb-4">
                Frequently Asked Questions About How It Works
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-background p-5 rounded-xl border border-border space-y-2">
                  <h3 className="font-semibold text-dark-900 text-sm">
                    How does the escrow payment guarantee protect me?
                  </h3>
                  <p className="text-xs text-dark-600 leading-relaxed">
                    When you book an appointment, your payment is held safely by our escrow partner. The service professional does not receive payment until the service has been marked complete by you.
                  </p>
                </div>

                <div className="bg-background p-5 rounded-xl border border-border space-y-2">
                  <h3 className="font-semibold text-dark-900 text-sm">
                    What happens if I need to cancel or reschedule?
                  </h3>
                  <p className="text-xs text-dark-600 leading-relaxed">
                    You can reschedule or cancel directly from your customer dashboard. Cancellations made at least 24 hours prior to the appointment receive a full 100% refund straight to your original payment method.
                  </p>
                </div>

                <div className="bg-background p-5 rounded-xl border border-border space-y-2">
                  <h3 className="font-semibold text-dark-900 text-sm">
                    How are professionals vetted and background checked?
                  </h3>
                  <p className="text-xs text-dark-600 leading-relaxed">
                    Every professional must upload government-issued identification, proof of address, educational or professional licenses, and certifications. Our compliance team verifies all records before activating their profile.
                  </p>
                </div>

                <div className="bg-background p-5 rounded-xl border border-border space-y-2">
                  <h3 className="font-semibold text-dark-900 text-sm">
                    Can I communicate with the professional before the visit?
                  </h3>
                  <p className="text-xs text-dark-600 leading-relaxed">
                    Yes. Once your booking is initiated, you receive immediate WhatsApp and SMS notifications with the verified professional&apos;s direct contact details to coordinate service specifics.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#031726] text-white pt-12 pb-8 border-t border-[#0d2a44]">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 pb-8 border-b border-white/10">
            <div>
              <div className="flex flex-col">
                <Link href="/" className="font-heading text-xl font-bold tracking-tight text-white">
                  <span>Book</span>
                  <span className="text-[#0070F3]">My</span>
                  <span>Professional</span>
                </Link>
                <span className="text-[11px] text-white/70 mt-0.5">
                  Skilled People. Better Living.
                </span>
              </div>
              <p className="mt-3 text-xs text-white/70 max-w-xs leading-relaxed">
                Connecting you with verified professionals for high-quality, dependable services.
              </p>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-3">Company</h3>
              <ul className="space-y-2 text-xs text-white/70">
                <li>
                  <Link href="/about" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/professionals" className="hover:text-white transition-colors">
                    Find Experts
                  </Link>
                </li>
                <li>
                  <Link href="/how-it-works" className="hover:text-white transition-colors">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/vendor" className="hover:text-white transition-colors">
                    Vendor Portal
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition-colors">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-3">Legal & Safety</h3>
              <ul className="space-y-2 text-xs text-white/70">
                <li>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/refund" className="hover:text-white transition-colors">
                    Refund & Cancellation
                  </Link>
                </li>
                <li>
                  <Link href="/terms#payments-escrow-protection" className="hover:text-white transition-colors">
                    Payment Protection
                  </Link>
                </li>
                <li>
                  <Link href="/terms#professional-verification" className="hover:text-white transition-colors">
                    Verification Standard
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold text-white mb-3">Support</h3>
              <p className="text-xs text-white/70 mb-2">
                Have a question or need assistance with a booking?
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center text-xs font-semibold text-primary-400 hover:text-primary-300"
              >
                Contact Support Desk →
              </Link>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-white/60 gap-3">
            <p>© {new Date().getFullYear()} BookMyProfessional. All rights reserved.</p>
            <div className="flex items-center gap-4">
              {[
                { key: "facebook", Icon: Facebook, label: "Facebook" },
                { key: "instagram", Icon: Instagram, label: "Instagram" },
                { key: "linkedin", Icon: Linkedin, label: "LinkedIn" },
                { key: "youtube", Icon: Youtube, label: "YouTube" },
              ]
                .filter(({ key }) => social[key])
                .map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={social[key]}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="hover:text-white transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
