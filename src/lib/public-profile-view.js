const DEFAULT_REVIEW_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80";

function normalizeAvailability(availability) {
  const a = availability && typeof availability === "object" ? availability : {};
  return {
    daily: a.daily && typeof a.daily === "object" ? a.daily : null,
    days: Array.isArray(a.days) ? a.days : [],
    hours: a.hours || "",
    slots: Array.isArray(a.slots) ? a.slots : [],
  };
}

function mapReview(row) {
  return {
    id: row.id,
    userName: "Verified Client",
    userAvatar: DEFAULT_REVIEW_AVATAR,
    rating: Number(row.rating) || 0,
    date: row.created_at ? new Date(row.created_at).toLocaleDateString() : "",
    comment: row.comment || "",
    breakdown: row.breakdown || {},
    verifiedBooking: true,
  };
}

// Rating & count come from actual review rows so the header always matches the reviews list
// (no fabricated counts). A pro with no reviews reads as 0 / "New".
function summarizeReviews(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  if (!list.length) return { rating: 0, reviewCount: 0 };
  const avg = list.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / list.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: list.length };
}

export function getProfessionalTitle(pro) {
  if (!pro) return "Professional";
  const sub = (pro.subcategory || "").trim();
  if (sub && sub.toLowerCase() !== "professional") return sub;
  const cat = (pro.category || "").trim();
  if (cat && cat.toLowerCase() !== "professional") return cat;
  const custom = (pro.role_title || pro.role || "").trim();
  if (custom && custom.toLowerCase() !== "professional") return custom;
  return "Professional";
}

export function mapProfessional(row, locMap = {}) {
  const city = row.city || "";
  const loc = city ? locMap[city.toLowerCase()] : null;
  const hourlyRate = Number(row.hourly_rate) || 0;
  const reviews = (row.reviews || []).map(mapReview);
  const displayTitle = getProfessionalTitle(row);

  return {
    id: row.id,
    name: row.name,
    role: displayTitle,
    role_title: displayTitle,
    category: row.category || "",
    subcategory: row.subcategory || "",
    specialty: row.specialty || "",
    ...summarizeReviews(reviews),
    location: loc ? `${city}, ${loc.country}` : city,
    city,
    latitude: row.latitude ?? loc?.latitude ?? null,
    longitude: row.longitude ?? loc?.longitude ?? null,
    experienceYears: row.experience_years || 0,
    verified: Boolean(row.verified === true && row.verification_status === "approved"),
    verificationStatus: row.verification_status || "not_submitted",
    isActive: row.is_active !== false,
    hourlyRate,
    price: hourlyRate,
    unit: row.unit || "hour",
    responseTime: row.response_time || "",
    image: row.image_url || "",
    bio: row.bio || "",
    about: row.about || "",
    pincode: row.pincode || "",
    credentials: (row.credentials || []).map((c) => ({
      title: c.title,
      issuer: c.issuer,
      year: c.year,
    })),
    services: (row.services || [])
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        price: Number(s.price) || 0,
        duration: s.duration,
        inclusions: Array.isArray(s.inclusions) ? s.inclusions : [],
        exclusions: Array.isArray(s.exclusions) ? s.exclusions : [],
      })),
    availability: normalizeAvailability(row.availability),
    reviews,
  };
}
