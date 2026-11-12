import DirectoryClient from "./DirectoryClient";
import { readPublicDirectory } from "@/lib/public-directory";

export const dynamic = "force-dynamic";

export default async function BrowseProfessionalsPage({ searchParams }) {
  const params = await searchParams;
  const requestedCategory = Array.isArray(params?.category) ? params.category[0] : params?.category;
  const category = typeof requestedCategory === "string" && requestedCategory.trim()
    ? requestedCategory.trim() : "all";
  const initialDirectory = await readPublicDirectory(category);
  return <DirectoryClient initialDirectory={initialDirectory} />;
}
