import ProfessionalDetailClient from "./ProfessionalDetailClient";
import { readPublicProfileBody } from "@/lib/profile-body";

export default async function ProfessionalDetailPage({ params }) {
  const { id } = await params;
  const initialProfile = await readPublicProfileBody(id);
  return <ProfessionalDetailClient proId={id} initialProfile={initialProfile} />;
}
