import { redirect } from "next/navigation";

// /signup is a legacy/unused address some visitors type directly.
// Forward it to the real signup page so it never 404s.
export default function SignupRedirectPage() {
  redirect("/register");
}
