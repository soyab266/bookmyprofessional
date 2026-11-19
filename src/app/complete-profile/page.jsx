/**
 * Complete profile - shown once to brand-new Google signups, because Google
 * does not share a mobile number. Server wrapper: noindex, force-dynamic.
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import CompleteProfileClient from "./CompleteProfileClient";

export const metadata = {
  title: "Complete your profile",
  robots: { index: false, follow: true },
};

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={null}>
      <CompleteProfileClient />
    </Suspense>
  );
}
