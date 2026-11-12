"use client";

import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import MarketplaceDirectory from "@/components/MarketplaceDirectory";
import { ChevronRight, ShieldCheck, Clock, Award, CreditCard } from "lucide-react";

export default function BrowseProfessionalsPage({ initialDirectory }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-dark-800">
      <Navbar />

      {/* BREADCRUMBS */}
      <div className="bg-surface border-b border-border py-3">
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs text-dark-500 font-medium">
            <Link href="/" className="hover:text-primary-600 transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-400" />
            <span className="text-dark-900 font-semibold">Find a Professional</span>
          </div>
        </div>
      </div>

      <main className="flex-1">
        {/* SEO HERO & DIRECTORY INTRO */}
        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 pt-8 pb-6">
          <div className="max-w-3xl">
            <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight">
              Find &amp; Hire Verified Professionals Near You
            </h1>
            <p className="text-sm sm:text-base text-dark-600 mt-3 leading-relaxed">
              Explore India&apos;s trusted directory of background-checked experts across healthcare,
              education, home maintenance, wellness, technology, and business consulting. Compare verified
              credentials, authentic customer reviews, transparent hourly rates, and live appointment slots
              to hire with complete confidence.
            </p>
          </div>

          {/* VALUE PILLARS STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-border/80">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="font-heading text-xs font-bold text-dark-900">100% ID Verified</p>
                <p className="text-[11px] text-dark-500 mt-0.5 leading-snug">Govt ID &amp; certification audited</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <p className="font-heading text-xs font-bold text-dark-900">Escrow Protected</p>
                <p className="text-[11px] text-dark-500 mt-0.5 leading-snug">Pay only when service is complete</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-heading text-xs font-bold text-dark-900">Instant Booking</p>
                <p className="text-[11px] text-dark-500 mt-0.5 leading-snug">Real-time availability calendars</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <p className="font-heading text-xs font-bold text-dark-900">Rated &amp; Reviewed</p>
                <p className="text-[11px] text-dark-500 mt-0.5 leading-snug">Feedback from verified customers</p>
              </div>
            </div>
          </div>
        </div>

        <MarketplaceDirectory initialDirectory={initialDirectory} />

        {/* FREQUENTLY ASKED QUESTIONS & HIRING GUIDE */}
        <section className="bg-surface border-t border-border mt-16 py-14">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <h2 className="font-heading text-xl sm:text-2xl font-bold text-dark-900 tracking-tight">
                Hiring Verified Professionals on BookMyProfessional
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-dark-600 leading-relaxed">
                Whether you need a licensed physician, certified home tutor, skilled electrician, or an IT consultant, BookMyProfessional connects you directly with vetted domain specialists across major cities in India.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-dark-50/70 border border-border/80 space-y-2">
                <h3 className="font-heading text-sm font-bold text-dark-900">
                  How are professionals verified?
                </h3>
                <p className="text-xs text-dark-600 leading-relaxed">
                  Every listed service expert undergoes strict government identity verification, professional credential auditing, and background screening before being approved to offer consultations and services.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-dark-50/70 border border-border/80 space-y-2">
                <h3 className="font-heading text-sm font-bold text-dark-900">
                  How does escrow payment protection work?
                </h3>
                <p className="text-xs text-dark-600 leading-relaxed">
                  When you schedule an appointment, your payment is held securely in escrow. Funds are only transferred to the expert after your service milestone is completed and satisfied.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-dark-50/70 border border-border/80 space-y-2">
                <h3 className="font-heading text-sm font-bold text-dark-900">
                  Can I reschedule or cancel my booking?
                </h3>
                <p className="text-xs text-dark-600 leading-relaxed">
                  Yes, you can easily reschedule or cancel appointments directly from your customer dashboard with prompt refunds according to our fair cancellation policy.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
