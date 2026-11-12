import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboarded) redirect("/dashboard");
  return <OnboardingWizard name={user.name} />;
}
