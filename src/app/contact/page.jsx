"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  HelpCircle,
  FileText,
  AlertCircle,
  Headphones,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Navigation,
  Train,
  ExternalLink,
  Building2,
  Car,
  Compass,
} from "lucide-react";
import { insertContactMessage } from "@/lib/data/contacts";
import { getSiteContent } from "@/lib/data/site-content";

export default function ContactPage() {
  const [social, setSocial] = useState({});

  useEffect(() => {
    let active = true;
    getSiteContent().then((content) => {
      if (active) setSocial(content.social);
    });
    return () => { active = false; };
  }, []);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    topic: "customer_support",
    subject: "",
    message: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const [expandedFaq, setExpandedFaq] = useState(0);
  const [selectedCity, setSelectedCity] = useState("mumbai");

  const cityHubs = [
    {
      id: "mumbai",
      name: "Mumbai (Main Headquarters)",
      address: "Bandra Kurla Complex, Mumbai 400051, India",
      mapQuery: "Bandra+Kurla+Complex,+Mumbai,+India",
      phone: "+91 89193 28705",
      email: "hq@bookmyprofessional.com",
      transit: "Metro Bandra Kurla Complex (Line 3) – 2 min walk",
      parking: "Basement parking available at BKC",
      hours: "Mon – Sat: 09:00 – 20:00 IST",
    },
    {
      id: "delhi",
      name: "Delhi Regional Hub",
      address: "Connaught Place, New Delhi 110001, India",
      mapQuery: "Connaught+Place,+New+Delhi,+India",
      phone: "+91 11 4000 8820",
      email: "delhi@bookmyprofessional.com",
      transit: "Metro Connaught Place (Blue Line) – 3 min walk",
      parking: "Paid parking at Palika Parking (5 min walk)",
      hours: "Mon – Sat: 09:00 – 20:00 IST",
    },
    {
      id: "hyderabad",
      name: "Hyderabad Financial Hub",
      address: "Banjara Hills, Hyderabad 500034, India",
      mapQuery: "Banjara+Hills,+Hyderabad,+India",
      phone: "+91 40 4000 1190",
      email: "hyderabad@bookmyprofessional.com",
      transit: "Metro Banjara Hills (Line 1) – direct station exit",
      parking: "Basement parking, Banjara Hills",
      hours: "Mon – Sat: 09:00 – 20:00 IST",
    },
    {
      id: "bangalore",
      name: "Bangalore Southern Hub",
      address: "MG Road, Bangalore 560001, India",
      mapQuery: "MG+Road,+Bangalore,+India",
      phone: "+91 80 4000 5500",
      email: "bangalore@bookmyprofessional.com",
      transit: "Metro MG Road (Purple Line) – 4 min walk",
      parking: "Paid parking, MG Road",
      hours: "Mon – Sat: 09:00 – 20:00 IST",
    },
  ];

  const currentHub = cityHubs.find((c) => c.id === selectedCity) || cityHubs[0];

  const contactChannels = [
    {
      icon: Phone,
      title: "Direct Phone & WhatsApp",
      details: "+91 89193 28705",
      subtext: "Mon – Sat, 9:00 AM – 8:00 PM IST",
      badge: "Quick Response",
      actionText: "Call Now",
      href: "tel:+918919328705",
    },
    {
      icon: Mail,
      title: "Email Support Desk",
      details: "support@bookmyprofessional.com",
      subtext: "Average reply within 2 business hours",
      badge: "24/7 Inbox",
      actionText: "Send Email",
      href: "mailto:support@bookmyprofessional.com",
    },
    {
      icon: MapPin,
      title: "India Headquarters",
      details: "Bandra Kurla Complex, Mumbai 400051",
      subtext: "India (Visits by appointment)",
      badge: "HQ Office",
      actionText: "Get Directions",
      href: "https://maps.google.com/?q=Bandra+Kurla+Complex+Mumbai",
    },
  ];

  const faqs = [
    {
      q: "How does the Escrow Payment protection work?",
      a: "When you book a service, your payment is held securely in our licensed escrow account. Funds are released to the professional only after the appointment is successfully completed and you confirm your satisfaction.",
    },
    {
      q: "How are professionals vetted and background checked?",
      a: "Every service provider submits government-issued photo identification, relevant trade certifications or university degrees, proof of business insurance, and undergoes criminal record verification before receiving approval.",
    },
    {
      q: "What is the cancellation and refund policy?",
      a: "You can cancel free of charge up to 24 hours before your scheduled appointment for an instant 100% refund. For cancellations within 24 hours, emergency reschedule options or partial refunds apply depending on the pro's policy.",
    },
    {
      q: "How do I register as a professional service provider?",
      a: "Click 'Join as a Professional' in our menu or navigate to the Vendor Portal. Complete your profile, upload your documents, set your hourly/service pricing, and our verification team will review your application within 24 hours.",
    },
    {
      q: "What if I am not satisfied with the delivered service?",
      a: "We offer a 100% Satisfaction Guarantee. Simply open a dispute ticket from your Customer Dashboard within 48 hours of service completion, and our dispute concierge will mediate rematching or a full escrow refund.",
    },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.name || !form.email || !form.message) return;

    setIsSubmitting(true);
    try {
      const ticketNum = "BMP-" + Math.floor(100000 + Math.random() * 900000);
      const payload = {
        ticket_number: ticketNum,
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        topic: form.topic,
        subject: form.subject || "Support Inquiry",
        message: form.message,
      };

      await insertContactMessage(payload);

      setSubmittedTicket({
        ticketNumber: ticketNum,
        name: form.name,
        email: form.email,
        topic: form.topic,
        subject: form.subject || "Support Inquiry",
      });
      setForm({
        name: "",
        email: "",
        phone: "",
        topic: "customer_support",
        subject: "",
        message: "",
      });
    } catch (error) {
      setErrorMsg(error?.message || "Failed to submit message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <span className="text-dark-900 font-semibold">Contact Us</span>
          </div>
        </div>
      </div>

      <main className="flex-1">
        {/* HEADER SECTION */}
        <section className="py-14 sm:py-18 bg-gradient-to-b from-primary-50/70 via-surface to-background border-b border-border text-center">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-surface px-3.5 py-1 shadow-xs mb-4">
              <Headphones className="h-4 w-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700">
                24/7 Dedicated Support Concierge
              </span>
            </div>

            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-dark-900 max-w-3xl mx-auto">
              We're Here to Help <span className="text-primary-500">Every Step of the Way</span>
            </h1>

            <p className="mt-3.5 text-xs sm:text-sm sm:text-base text-dark-600 max-w-xl mx-auto leading-relaxed">
              Have questions about booking an expert, professional onboarding, or escrow transactions? Our team is always ready to assist you.
            </p>
          </div>
        </section>

        {/* 3 CONTACT CHANNELS */}
        <section className="py-10 bg-surface border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {contactChannels.map((c, i) => {
                const Icon = c.icon;
                return (
                  <div
                    key={i}
                    className="p-6 rounded-2xl bg-surface border border-border shadow-card hover:shadow-soft hover:border-primary-200 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center">
                          <Icon className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full border border-primary-200">
                          {c.badge}
                        </span>
                      </div>
                      <h2 className="font-heading text-base font-bold text-dark-900 mb-1">
                        {c.title}
                      </h2>
                      <p className="text-sm font-semibold text-primary-600 mb-1">
                        {c.details}
                      </p>
                      <p className="text-xs text-dark-500">
                        {c.subtext}
                      </p>
                    </div>

                    <a
                      href={c.href}
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center text-xs font-bold text-primary-600 hover:text-primary-700 group"
                    >
                      <span>{c.actionText}</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CONTACT FORM & LIVE SUPPORT INFO */}
        <section className="py-14 sm:py-18 bg-background border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
              
              {/* Left Column: Form (7 cols) */}
              <div className="lg:col-span-7">
                <div className="bg-surface rounded-3xl border border-border shadow-card p-6 sm:p-8">
                  <div className="mb-6">
                    <h2 className="font-heading text-xl sm:text-2xl font-bold text-dark-900">
                      Send Us a Message
                    </h2>
                    <p className="text-xs sm:text-sm text-dark-600 mt-1">
                      Fill out the form below and an assigned concierge specialist will reach out within 2 hours.
                    </p>
                  </div>

                  {submittedTicket ? (
                    <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center animate-in fade-in zoom-in-95 duration-200">
                      <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h3 className="font-heading text-lg font-bold text-emerald-900 mb-1">
                        Message Sent Successfully!
                      </h3>
                      <p className="text-xs sm:text-sm text-emerald-700 mb-4">
                        Ticket Number: <span className="font-mono font-bold">{submittedTicket.ticketNumber}</span>
                      </p>
                      <p className="text-xs text-emerald-800 max-w-md mx-auto leading-relaxed mb-6">
                        Thank you, {submittedTicket.name}. A confirmation email has been dispatched to <strong>{submittedTicket.email}</strong>.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSubmittedTicket(null)}
                        className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                      >
                        Submit Another Message
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {errorMsg && (
                        <div className="flex items-center gap-2 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                          <span>{errorMsg}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-dark-700 mb-1">
                            Your Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Enter your full name"
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-dark-700 mb-1">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            required
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="Enter your email address"
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-dark-700 mb-1">
                            Phone Number (Optional)
                          </label>
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder="Enter your phone number"
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-dark-700 mb-1">
                            Topic / Department
                          </label>
                          <select
                            value={form.topic}
                            onChange={(e) => setForm({ ...form, topic: e.target.value })}
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                          >
                            <option value="customer_support">Customer Booking Support</option>
                            <option value="vendor_onboarding">Professional Vendor Partner</option>
                            <option value="escrow_billing">Escrow Payment & Billing</option>
                            <option value="dispute">Dispute or Quality Feedback</option>
                            <option value="general">General Partnership Inquiry</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={form.subject}
                          onChange={(e) => setForm({ ...form, subject: e.target.value })}
                          placeholder="Brief summary of your request..."
                          className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-dark-700 mb-1">
                          Your Detailed Message *
                        </label>
                        <textarea
                          rows={4}
                          required
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          placeholder="Tell us what you need help with or any booking ID references..."
                          className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-dark-50/70 border border-border rounded-xl text-dark-900 focus:bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting}
                        className="w-full py-3 rounded-xl justify-center font-semibold text-sm shadow-button"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending Message...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Send className="w-4 h-4" />
                            <span>Submit Message</span>
                          </div>
                        )}
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Right Column: Office info & Safety promise (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                {/* Office Card */}
                <div className="bg-surface rounded-3xl border border-border shadow-card p-6 sm:p-7">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-bold text-dark-900">
                        Operational Hours
                      </h3>
                      <p className="text-xs text-dark-500">Live assistance & emergency support</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs text-dark-700 pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span className="font-medium">Monday – Saturday</span>
                      <span className="font-semibold text-dark-900">09:00 – 20:00 IST</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Sunday & Public Holidays</span>
                      <span className="font-semibold text-primary-600">Closed</span>
                    </div>
                  </div>
                </div>

                {/* Dispute & Safety Guarantee Card */}
                <div className="bg-surface rounded-3xl border border-emerald-200/80 bg-emerald-50/30 p-6 sm:p-7 shadow-card">
                  <div className="flex items-center gap-3 mb-3">
                    <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
                    <div>
                      <h3 className="font-heading text-base font-bold text-dark-900">
                        The Trust Guarantee
                      </h3>
                      <p className="text-xs text-dark-500">100% Escrow Protection on all bookings</p>
                    </div>
                  </div>
                  <p className="text-xs text-dark-600 leading-relaxed">
                    All financial transactions are protected by Indian escrow regulations. If a service provider does not arrive or work doesn't match standards, your payment is promptly refunded.
                  </p>
                </div>

                {/* Quick Shortcuts */}
                <div className="bg-surface rounded-3xl border border-border p-6 shadow-card">
                  <h3 className="font-heading text-sm font-bold text-dark-900 mb-3">
                    Quick Access
                  </h3>
                  <div className="space-y-2 text-xs">
                    <Link
                      href="/dashboard"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-dark-50 border border-border text-dark-800 transition-colors"
                    >
                      <span className="font-medium">Customer Dashboard & Bookings</span>
                      <ChevronRight className="w-4 h-4 text-dark-400" />
                    </Link>
                    <Link
                      href="/vendor"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-dark-50 border border-border text-dark-800 transition-colors"
                    >
                      <span className="font-medium">Professional Vendor Payout Portal</span>
                      <ChevronRight className="w-4 h-4 text-dark-400" />
                    </Link>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* INTERACTIVE OFFICE & MAP SECTION */}
        <section className="py-14 sm:py-18 bg-surface border-b border-border">
          <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 uppercase tracking-wider mb-2">
                  <Compass className="w-4 h-4 text-primary-500" />
                  <span>Our Locations</span>
                </div>
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight">
                  Find Our <span className="text-primary-500">Offices & Hubs</span>
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-dark-600 max-w-xl">
                  Visit our regional offices or connect with our local field concierge teams across major metropolitan centers.
                </p>
              </div>

              {/* City Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {cityHubs.map((hub) => (
                  <button
                    key={hub.id}
                    type="button"
                    onClick={() => setSelectedCity(hub.id)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      selectedCity === hub.id
                        ? "bg-primary-500 text-white shadow-button ring-2 ring-primary-300"
                        : "bg-dark-50 hover:bg-dark-100 text-dark-700 border border-border"
                    }`}
                  >
                    {hub.id.charAt(0).toUpperCase() + hub.id.slice(1)} Hub
                  </button>
                ))}
              </div>
            </div>

            {/* Map & Office Detail Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-surface rounded-3xl border border-border shadow-card overflow-hidden">
              
              {/* Map Container (8 cols) */}
              <div className="lg:col-span-8 relative min-h-[380px] sm:min-h-[460px] bg-dark-100 overflow-hidden">
                {/* Embedded Google Maps iframe */}
                <iframe
                  title={`Map location for ${currentHub.name}`}
                  src={`https://maps.google.com/maps?q=${currentHub.mapQuery}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                  className="w-full h-full min-h-[380px] sm:min-h-[460px] border-0"
                  loading="lazy"
                  allowFullScreen
                />

                {/* Floating Map Marker Overlay Badge */}
                <div className="absolute top-4 left-4 max-w-xs bg-surface/95 backdrop-blur-md p-3.5 rounded-2xl border border-border/90 shadow-soft hidden sm:block">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-heading text-xs font-bold text-dark-900 truncate">
                      {currentHub.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-dark-600 line-clamp-2 leading-snug">
                    {currentHub.address}
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${currentHub.mapQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700"
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Hub Specific Details (4 cols) */}
              <div className="lg:col-span-4 p-6 sm:p-7 flex flex-col justify-between bg-dark-50/40 border-t lg:border-t-0 lg:border-l border-border">
                <div className="space-y-5">
                  <div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-200 mb-2">
                      Selected Hub
                    </span>
                    <h3 className="font-heading text-lg font-bold text-dark-900">
                      {currentHub.name}
                    </h3>
                    <p className="text-xs text-dark-600 mt-1 flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                      <span>{currentHub.address}</span>
                    </p>
                  </div>

                  {/* Contact Methods */}
                  <div className="space-y-2.5 pt-4 border-t border-border/80 text-xs">
                    <div className="flex items-center gap-2.5 text-dark-700">
                      <Phone className="w-4 h-4 text-dark-400 shrink-0" />
                      <a href={`tel:${currentHub.phone}`} className="font-semibold text-primary-600 hover:underline">
                        {currentHub.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2.5 text-dark-700">
                      <Mail className="w-4 h-4 text-dark-400 shrink-0" />
                      <a href={`mailto:${currentHub.email}`} className="text-dark-700 hover:text-primary-600 truncate">
                        {currentHub.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2.5 text-dark-700">
                      <Clock className="w-4 h-4 text-dark-400 shrink-0" />
                      <span>{currentHub.hours}</span>
                    </div>
                  </div>

                  {/* Public Transit & Parking Guide */}
                  <div className="space-y-2.5 pt-4 border-t border-border/80 text-xs">
                    <div className="flex items-start gap-2 text-dark-700">
                      <Train className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-dark-900 block">Public Transit:</span>
                        <span className="text-dark-600">{currentHub.transit}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-dark-700">
                      <Car className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-dark-900 block">Parking & Accessibility:</span>
                        <span className="text-dark-600">{currentHub.parking}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Directions Button */}
                <div className="pt-6 mt-4 border-t border-border/80">
                  <a
                    href={`https://maps.google.com/?q=${currentHub.mapQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs shadow-button transition-colors text-center"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Get Navigation Directions</span>
                  </a>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* FREQUENTLY ASKED QUESTIONS */}
        <section className="py-14 sm:py-18 bg-surface border-b border-border">
          <div className="mx-auto max-w-[900px] px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <span className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                Common Inquiries
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-dark-900 tracking-tight mt-1.5">
                Frequently Asked Questions
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-dark-600">
                Quick answers regarding bookings, verified profiles, payments, and cancellations.
              </p>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <div
                    key={index}
                    className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isOpen
                        ? "bg-surface border-primary-300 shadow-soft"
                        : "bg-surface border-border hover:border-dark-300 shadow-xs"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpen ? -1 : index)}
                      className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
                    >
                      <span className="font-heading text-sm sm:text-base font-bold text-dark-900 pr-4">
                        {faq.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-dark-500 shrink-0 transition-transform duration-200 ${
                          isOpen ? "rotate-180 text-primary-600" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-0 text-xs sm:text-sm text-dark-600 leading-relaxed border-t border-border/60 mt-1 animate-in fade-in duration-150">
                        <p className="pt-3">{faq.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
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
              <h3 className="font-heading text-sm font-bold text-white mb-3">Support Hotline</h3>
              <p className="text-xs text-white/70 mb-1">
                Emergency Support Line:
              </p>
              <p className="text-xs font-semibold text-primary-400">
                +91 89193 28705
              </p>
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
