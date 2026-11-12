const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export const metadata = {
  title: "Set New Password",
  description: "Set a new BookMyProfessional account password from your one-time password reset link.",
  alternates: {
    canonical: `${SITE_URL}/reset-password`,
  },
  // Utility authentication page - excluded from organic indexing; links remain followable.
  robots: { index: false, follow: true },
};

export default function ResetPasswordLayout({ children }) {
  return children;
}
