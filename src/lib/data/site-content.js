import { createClient } from "@/lib/supabase/client";
import { cached } from "@/lib/data/cache";

// Marketing numbers shown on the home banner and the About page. Admin edits these in Settings.
export const DEFAULT_MARKETING = {
  home: [
    { value: "Free", label: "Customer Signup" },
    { value: "Verified", label: "Professional Profiles" },
    { value: "Upfront", label: "Pricing" },
    { value: "Online", label: "Booking & Payment" },
  ],
  about: [
    { value: "Free", label: "Customer Signup", detail: "Create a customer account" },
    { value: "Verified", label: "Professional Profiles", detail: "Verification required before listing" },
    { value: "Upfront", label: "Pricing", detail: "Rates shown on profiles before booking" },
    { value: "Online", label: "Booking & Payment", detail: "Book and pay through the site" },
  ],
  // Unused: no page renders ctaCustomers anymore; kept only because admin Settings still writes this key.
  ctaCustomers: "50,000",
};

export const DEFAULT_TESTIMONIALS = [
  {
    name: "Priya S.",
    location: "Mumbai, India",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    comment: "“Found an amazing tutor for my daughter. The booking process was so simple!”",
  },
  {
    name: "Karan M.",
    location: "Delhi, India",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    comment: "“The electrician arrived on time and fixed everything perfectly. Great service!”",
  },
  {
    name: "Aisha S.",
    location: "Bangalore, India",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
    comment: "“I regularly book a cleaner through BookMyProfessional. Very reliable!”",
  },
  {
    name: "Rohan Mehta",
    location: "Hyderabad, India",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
    comment: "“Outstanding platform! Hired a tax consultant within an hour and got all my queries resolved.”",
  },
  {
    name: "Ananya Iyer",
    location: "Pune, India",
    rating: 5,
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
    comment: "“The beautician was super professional and friendly. Very happy with the seamless booking!”",
  },
];

export const DEFAULT_SOCIAL = {
  facebook: "",
  instagram: "",
  twitter: "",
  linkedin: "",
  youtube: "",
};

// ponytail: defaults on error / missing rows so every page renders while the settings are unset.
export async function getSiteContent() {
  return cached("site-content", async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["marketing", "testimonials", "social"]);
      if (error) throw error;

      const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
      const marketing = map.marketing || {};

      return {
        marketing: {
          home: Array.isArray(marketing.home) && marketing.home.length ? marketing.home : DEFAULT_MARKETING.home,
          about: Array.isArray(marketing.about) && marketing.about.length ? marketing.about : DEFAULT_MARKETING.about,
          ctaCustomers: marketing.ctaCustomers || DEFAULT_MARKETING.ctaCustomers,
        },
        testimonials:
          Array.isArray(map.testimonials) && map.testimonials.length
            ? map.testimonials
            : DEFAULT_TESTIMONIALS,
        social: { ...DEFAULT_SOCIAL, ...(map.social || {}) },
      };
    } catch {
      return {
        marketing: DEFAULT_MARKETING,
        testimonials: DEFAULT_TESTIMONIALS,
        social: DEFAULT_SOCIAL,
      };
    }
  });
}
