import type { Metadata } from "next";
import "./globals.css";
import ParticleField from "@/components/particle-field";

export const metadata: Metadata = {
  title: {
    default: "StudyMaster — your adaptive study planner",
    template: "%s · StudyMaster",
  },
  description:
    "StudyMaster turns your syllabus into a realistic study plan: focus timer, adaptive roadmap, quizzes, spaced-repetition flashcards, a Gemini tutor and progress analytics.",
  applicationName: "StudyMaster",
  keywords: ["study planner", "pomodoro", "flashcards", "spaced repetition", "AI tutor"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="aurora-bg" aria-hidden="true" />
        <ParticleField />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
