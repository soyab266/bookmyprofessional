import { notFound } from "next/navigation";
import { readPublicProfileStatus } from "@/lib/public-profile-status";
import { buildProfileMetadata, readPublicProfileMetadata } from "@/lib/profile-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

// Server metadata is independent of the existing client-rendered profile UI.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await readPublicProfileMetadata(id);
  return buildProfileMetadata(id, profile, SITE_URL);
}

export default async function ProfessionalProfileLayout({ children, params }) {
  const { id } = await params;
  if (await readPublicProfileStatus(id) === "missing") notFound();
  return children;
}
