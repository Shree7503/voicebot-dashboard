import { redirect } from "next/navigation";

// proxy.ts has already sent anyone who isn't signed in to /login
export default function RootPage() {
  redirect("/overview");
}
