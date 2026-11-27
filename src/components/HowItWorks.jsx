"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
  Sparkles,
  ArrowRight,
} from "lucide-react";

function HeroDots() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-6 top-16 hidden lg:block"
    >
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" className="text-primary-300">
        {Array.from({ length: 16 }).map((_, i) => (
          <circle
            key={i}
            cx={12 + (i % 4) * 24}
            cy={12 + Math.floor(i / 4) * 24}
            r="2.5"
            fill="currentColor"
            opacity="0.5"
          />
        ))}
      </svg>
    </div>
  );
}

function CurvedArrow() {
  return (
    <svg viewBox="0 0 100 40" fill="none" className="h-auto w-full text-primary-300">
      <path
        d="M 5 27 Q 50 2 90 22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="5 6"
        fill="none"
      />
      <polygon points="88,13 98,25 84,27" fill="currentColor" />
    </svg>
  );
}

function VerticalConnector() {
  return (
    <div aria-hidden="true" className="flex h-7 items-center justify-center sm:hidden">
      <svg viewBox="0 0 24 48" fill="none" className="h-full w-4 text-primary-300">
        <path
          d="M 12 2 L 12 36"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 8"
          fill="none"
        />
        <polygon points="5,33 19,33 12,45" fill="currentColor" />
      </svg>
    </div>
  );
}

function SearchVisual() {
  const chips = ["Plumber", "Electrician"];
  return (
    <div
      aria-hidden="true"
      className="w-full space-y-2 rounded-2xl bg-primary-50/70 p-3 ring-1 ring-primary-100/80"
    >
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => (
          <span
            key={chip}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              i === 0
                ? "bg-primary-500 text-white"
                : "bg-surface text-dark-600 ring-1 ring-border"
            }`}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-border">
        <Search className="h-3.5 w-3.5 shrink-0 text-primary-500" />
        <span className="text-xs font-medium text-dark-800">Plumber</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-border">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary-500" />
        <span className="text-xs font-medium text-dark-800">Bangalore, KA</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-dark-400" />
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 py-2.5 text-xs font-semibold text-white shadow-button">
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
      </div>
    </div>
  );
}

function CompareVisual() {
  const pros = [
    { img: "/images/pro_plumber.jpg", name: "Ramesh K.", rating: "4.9", price: "₹500" },
    { img: "/images/pro_beautician.jpg", name: "Priya S.", rating: "4.8", price: "₹700", selected: true },
    { img: "/images/pro_electrician.jpg", name: "Arun M.", rating: "4.7", price: "₹650" },
  ];
  return (
    <div
      aria-hidden="true"
      className="w-full space-y-2 rounded-2xl bg-primary-50/70 p-3 ring-1 ring-primary-100/80"
    >
      {pros.map((pro) => (
        <div
          key={pro.price}
          className={`flex items-center gap-2 rounded-xl bg-surface px-2.5 py-2 ${
            pro.selected ? "ring-2 ring-primary-300" : "ring-1 ring-border"
          }`}
        >
          <img
            src={pro.img}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <span className="block h-1.5 w-4/5 rounded-full bg-dark-200" />
            <span className="block h-1.5 w-1/2 rounded-full bg-dark-100" />
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-amber-400">
            <Star className="h-3 w-3 fill-current" />
            <span className="text-[10px] font-semibold text-dark-600">{pro.rating}</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-dark-900">{pro.price}</span>
        </div>
      ))}
    </div>
  );
}

function BookingVisual() {
  const dates = [
    { day: "Mon", date: "12" },
    { day: "Tue", date: "13" },
    { day: "Wed", date: "14", selected: true },
    { day: "Thu", date: "15" },
  ];
  const times = ["10:00 AM", "12:30 PM", "4:00 PM"];
  return (
    <div
      aria-hidden="true"
      className="w-full space-y-3 rounded-2xl bg-primary-50/70 p-3 ring-1 ring-primary-100/80"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-dark-900">Select Date &amp; Time</span>
        <span className="flex items-center gap-1 text-dark-400">
          <ChevronLeft className="h-3.5 w-3.5" />
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {dates.map((d) => (
          <span
            key={d.date}
            className={`rounded-lg py-1.5 text-center ${
              d.selected ? "bg-primary-500 text-white shadow-button" : "bg-surface ring-1 ring-border"
            }`}
          >
            <span
              className={`block text-[9px] font-medium ${
                d.selected ? "text-white/80" : "text-dark-400"
              }`}
            >
              {d.day}
            </span>
            <span className="block text-[11px] font-bold leading-tight">{d.date}</span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {times.map((time, i) => (
          <span
            key={time}
            className={`rounded-lg py-1.5 text-center text-[10px] font-semibold ${
              i === 1 ? "bg-primary-500 text-white shadow-button" : "bg-surface text-dark-600 ring-1 ring-border"
            }`}
          >
            {time}
          </span>
        ))}
      </div>
      <div className="rounded-xl bg-primary-500 py-2.5 text-center text-[11px] font-semibold text-white shadow-button">
        Confirm Booking
      </div>
    </div>
  );
}

function GetServiceVisual() {
  return (
    <div className="flex w-full items-end justify-center">
      <img
        src="/images/how-it-works-plumber.webp"
        alt="Professional arriving and completing the service"
        width={320}
        height={220}
        className="mx-auto h-auto max-h-[220px] w-auto max-w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

const CTA_AVATARS = [
  "/images/pro_plumber.jpg",
  "/images/pro_beautician.jpg",
  "/images/pro_electrician.jpg",
  "/images/pro_doctor.jpg",
];

export default function HowItWorks() {
  const steps = [
    {
      title: "Search",
      desc: "Find the service you need in your location.",
      badge: "bg-primary-100 text-primary-600",
      visual: <SearchVisual />,
    },
    {
      title: "Compare",
      desc: "View profiles, ratings, reviews and prices.",
      badge: "bg-violet-100 text-violet-600",
      visual: <CompareVisual />,
    },
    {
      title: "Book",
      desc: "Choose date & time and confirm your booking.",
      badge: "bg-amber-100 text-amber-600",
      visual: <BookingVisual />,
    },
    {
      title: "Get Service",
      desc: "Relax while the professional takes care of the rest.",
      badge: "bg-emerald-100 text-emerald-600",
      visual: <GetServiceVisual />,
    },
  ];

  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-16 overflow-hidden border-y border-border bg-primary-50/40 py-14 sm:py-16 lg:py-20"
    >
      <HeroDots />

      <div className="relative z-10 mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-surface px-3.5 py-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary-500" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-600">
              How It Works
            </span>
          </div>

          <h1 className="mt-5 font-heading text-3xl font-bold tracking-tight text-dark-900 sm:text-4xl lg:text-[42px]">
            How <span className="text-primary-500">BookMyProfessional</span> Works
          </h1>

          <p className="mt-4 text-base font-medium text-dark-700 sm:text-lg">
            Getting professional help has never been this easy.
          </p>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Find trusted experts, compare options, book at your convenience, and get the service
            &mdash; all in a few simple steps.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 xl:gap-14">
          {steps.map((step, i) => (
            <React.Fragment key={step.title}>
              <div className="relative">
                <div className="flex h-full flex-col rounded-[20px] border border-border bg-surface p-5 shadow-card sm:p-6">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold ${step.badge}`}
                  >
                    {i + 1}
                  </span>
                  <h2 className="mt-4 font-heading text-lg font-bold text-dark-900 sm:text-xl">
                    {step.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.desc}</p>
                  <div className="mt-5 flex flex-1 items-end">{step.visual}</div>
                </div>

                {i < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-14 top-1/2 hidden w-14 -translate-y-1/2 xl:block"
                  >
                    <CurvedArrow />
                  </div>
                )}
              </div>

              {i < steps.length - 1 && <VerticalConnector />}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-14 rounded-[28px] border border-primary-100 bg-primary-50 px-6 py-10 shadow-card sm:mt-16 sm:px-10 sm:py-12 lg:px-14">
          <div className="flex flex-col items-center gap-9 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600">
                Ready to get started?
              </p>
              <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-dark-900 sm:text-3xl lg:text-4xl">
                Book a <span className="text-primary-500">Trusted Professional</span> Today
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-dark-600 sm:text-base">
                Find the right professional for your needs and book online.
              </p>
              <Link
                href="/professionals"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-button bg-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-button transition-colors hover:bg-primary-600"
              >
                <span>Find a Professional</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-3">
              <div className="flex -space-x-2">
                {CTA_AVATARS.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt="Verified professional"
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
                    loading="lazy"
                  />
                ))}
              </div>
              <p className="text-xs text-dark-600 sm:text-sm">
                Upfront pricing on every profile.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
