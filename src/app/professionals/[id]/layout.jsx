const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com").replace(/\/+$/, "");

// Generate this on the server, even while the profile UI loads on the client.
// Otherwise profiles inherit /professionals as their preferred URL.
export async function generateMetadata({ params }) {
  const { id } = await params;

  return {
    alternates: {
      canonical: `${SITE_URL}/professionals/${encodeURIComponent(id)}`,
    },
  };
}

export default function ProfessionalProfileLayout({ children }) {
  return children;
}
