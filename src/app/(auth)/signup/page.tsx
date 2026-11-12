import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignUpForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  return <SignUpForm />;
}
