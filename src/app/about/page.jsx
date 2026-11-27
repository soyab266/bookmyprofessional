"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { getSiteContent, DEFAULT_MARKETING } from "@/lib/data/site-content";
import {
  ShieldCheck,
  Award,
  Users,
  Sparkles,
  Heart,
  TrendingUp,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Globe2,
  Target,
  Zap,
  Building,
  Star,
  Lock,
  Headphones,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
} from "lucide-react";

export default function AboutPage() {
  const [marketing, setMarketing] = useState(DEFAULT_MARKETING);
  const [social, setSocial] = useState({});

  useEffect(() => {
    let active = true;
    getSiteContent().then((content) => {
      if (!active) return;
      setMarketing(content.marketing);
      setSocial(content.social);
    });
    return () => { active = false; };
  }, []);

  const milestones = [
    {
      year: "2022",
      title: "The Founding Vision",
      desc: "Founded with the mission to eliminate friction in finding certified home, health, and tech professionals across India.",
    },
    {
      year: "2024",
      title: "AI-Powered Matching",
      desc: "Introduced smart matching algorithms, instant vendor payouts, and verified client review integrity verification.",
    },
  ];

  const values = [
    {
      icon: ShieldCheck,
      title: "Uncompromising Quality",
      desc: "Every service provider is verified via government IDs, trade licenses, and real client reviews before receiving their first booking.",
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    {
      icon: Lock,
      title: "Financial Security (Escrow)",
      desc: "Client funds stay secure in escrow until the customer signs off on the completed work. Transparent pricing with zero hidden fees.",
      color: "text-primary-600 bg-primary-50 border-primary-200",
    },
    {
      icon: Heart,
      title: "Customer Delight",
      desc: "Our happiness guarantee ensures free rematching or swift refunds if a consultation or service doesn't meet professional standards.",
      color: "text-rose-600 bg-rose-50 border-rose-200",
    },
    {
      icon: Zap,
      title: "Speed & Accessibility",
      desc: "Instant booking in under 60 seconds with responsive communication. Average professional response time is under 45 minutes.",
      color: "text-amber-600 bg-amber-50 border-amber-200",
    },
  ];

  const leaders = [
    {
      name: "Shreya Nair",
      role: "Co-Founder & Chief Executive Officer",
      bio: "Former marketplace operations director with 14+ years scaling tech and service marketplaces across EMEA.",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
    },
    {
      name: "Marcus Becker",
      role: "Chief Technology Officer",
      bio: "Pioneered automated escrow infrastructure and AI matching engines with a focus on trust and real-time reliability.",
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
    },
    {
      name: "Elena Rostova",
      role: "Head of Trust & Safety",
      bio: "Oversees criminal record checks, license authentications, and platform dispute arbitration protocols.",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80",
    },
    {
      name: "David Chen",
      role: "VP of Vendor Growth",
      bio: "Dedicated to helping freelance tradespeople, tutors, and medical professionals grow their independent businesses.",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
    },
  ];

  const stats = marketing.about;

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
            <span className="text-dark-900 font-semibold">About Us</span>
          </div>
        </div>
      </div>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-primary-50/70 via-surface to-background border-b border-border overflow-hidden">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-surface px-3.5 py-1 shadow-xs mb-5">
              <Sparkles className="h-4 w-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700">
                Our Story & Mission
              </span>
            </div>

            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-dark-900 max-w-4xl mx-auto leading-tight">
              Empowering Everyday Living Through{" "}
              <span className="text-primary-500">Trusted Professional Services</span>
            </h1>

            <p className="mt-5 text-sm sm:text-base lg:text-lg text-dark-600 max-w-2xl mx-auto leading-relaxed font-normal">
              BookMyProfessional is built on a single, vital belief: booking certified experts for your home, health, academics, and tech should be as secure and effortless as ordering a ride.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                href="/professionals"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm shadow-button transition-colors"
              >
                Browse Verified Experts
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/register?role=professional"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface hover:bg-dark-50 border border-border text-dark-800 font-semibold text-sm transition-colors shadow-xs"
              >
                Join as a Professional
              </Link>
            </div>
          </div>
        </section>

        {/* IMPACT METRICS */}
        <section className="py-12 bg-surface border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {stats.map((s, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-dark-50/50 border border-border text-center flex flex-col items-center justify-center"
                >
                  <p className="font-heading text-3xl sm:text-4xl font-extrabold text-primary-600 tracking-tight">
                    {s.value}
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-dark-900 mt-1">
                    {s.label}
                  </p>
                  <p className="text-[11px] text-dark-500 mt-0.5">
                    {s.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MISSION & VISION */}
        <section className="py-14 sm:py-18 bg-background border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
              {/* Left text column */}
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 uppercase tracking-wider mb-2">
                  <Target className="w-4 h-4 text-primary-500" />
                  <span>Why We Exist</span>
                </div>
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight">
                  Bridging the gap between certified talent and busy individuals.
                </h2>
                <p className="mt-4 text-xs sm:text-sm text-dark-600 leading-relaxed">
                  Finding a dependable electrician in an emergency, an empathetic general physician for a quick consultation, or a seasoned tutor for your children used to involve hours of uncertain calls, unvetted recommendations, and opaque pricing.
                </p>
                <p className="mt-3 text-xs sm:text-sm text-dark-600 leading-relaxed">
                  We engineered BookMyProfessional to change that entirely. By holding service providers to strict verification standards and protecting every single rupee via milestone escrow, we foster genuine trust in the gig and service economy.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Every professional verified through multi-tier ID and criminal history screening",
                    "Fair, transparent pricing with guaranteed milestone escrow protection",
                    "Immediate scheduling sync with real-time calendar availability",
                    "Built-in customer review feature on every profile",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-dark-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Image / Graphic Card */}
              <div className="relative">
                <div className="relative rounded-3xl overflow-hidden shadow-soft border border-border bg-dark-100 aspect-[4/3]">
                  <img
                    src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=900&auto=format&fit=crop&q=80"
                    alt="Professional Collaboration"
                    width={900}
                    height={675}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 text-white">
                    <p className="font-heading text-lg sm:text-xl font-bold">
                      Skilled People. Better Living.
                    </p>
                    <p className="text-xs text-white/80 mt-1">
                      Connecting households and businesses with reliable local experts across India.
                    </p>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-5 -left-5 bg-surface p-4 rounded-2xl shadow-card border border-border hidden sm:flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-heading text-sm font-bold text-dark-900">100% Verified</p>
                    <p className="text-xs text-dark-500">Government ID & License checked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CORE VALUES */}
        <section className="py-14 sm:py-18 bg-surface border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                Principles That Guide Us
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight mt-1.5">
                Our Core Values
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-dark-600">
                Built from the ground up on integrity, customer empowerment, and top-tier service standards.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {values.map((val, idx) => {
                const Icon = val.icon;
                return (
                  <div
                    key={idx}
                    className="p-6 rounded-2xl bg-surface border border-border shadow-card hover:shadow-soft hover:border-primary-200 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${val.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-heading text-base font-bold text-dark-900 mb-2">
                        {val.title}
                      </h3>
                      <p className="text-xs text-dark-600 leading-relaxed">
                        {val.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* JOURNEY / MILESTONES */}
        <section className="py-14 sm:py-18 bg-background border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                How We Got Here
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight mt-1.5">
                Our Growth & Milestones
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
              {milestones.map((m, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-surface border border-border shadow-card relative flex flex-col justify-between"
                >
                  <div>
                    <span className="inline-block font-heading text-2xl font-extrabold text-primary-500 mb-2">
                      {m.year}
                    </span>
                    <h3 className="font-heading text-base font-bold text-dark-900 mb-1.5">
                      {m.title}
                    </h3>
                    <p className="text-xs text-dark-600 leading-relaxed">
                      {m.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LEADERSHIP TEAM */}
        <section className="py-14 sm:py-18 bg-surface border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                The People Behind The Platform
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight mt-1.5">
                Meet Our Leadership
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-dark-600">
                A team of seasoned marketplace operators, engineers, and trust specialists.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {leaders.map((person, idx) => (
                <div
                  key={idx}
                  className="bg-surface rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-soft transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="h-56 bg-dark-100 overflow-hidden">
                      <img
                        src={person.image}
                        alt={person.name}
                        width={280}
                        height={224}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading text-base font-bold text-dark-900">
                        {person.name}
                      </h3>
                      <p className="text-xs text-primary-600 font-semibold mt-0.5">
                        {person.role}
                      </p>
                      <p className="text-xs text-dark-600 mt-2.5 leading-relaxed">
                        {person.bio}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="py-16 bg-gradient-to-r from-dark-900 via-primary-950 to-dark-900 text-white border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
              Ready to Experience Better Service?
            </h2>
            <p className="mt-3 text-xs sm:text-sm sm:text-base text-white/80 max-w-xl mx-auto">
              Create a free account and book verified professionals for your daily and professional requirements.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                href="/professionals"
                className="px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm shadow-button transition-colors"
              >
                Find a Professional Now
              </Link>
              <Link
                href="/contact"
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm transition-colors"
              >
                Contact Our Support
              </Link>
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
                  <Link href="/about" className="hover:text-white transition-colors">
                    Escrow Protection
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-white transition-colors">
                    Verification Standard
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition-colors">
                    Terms & Privacy
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
