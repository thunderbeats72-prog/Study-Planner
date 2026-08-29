import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./study-planner-refresh.css";
import "./pastel-ui-system.css";
import "./study-planner-redesign.css";
import "./practical-enhancements.css";
/* ui-polish.css is the single authoritative finish layer: task rows,
   the ⋮ menu, active/recording state, sliders and calendars are defined
   ONLY there. The old pass/landing/final-fixes sheets were consolidated
   into it on purpose — do not add a new override file. */
import "./ui-polish.css";

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-inter",
});

const jetBrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  display: "swap",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Study Planner Pro — AI Study Engine",
  description:
    "An AI study architect that turns any syllabus — school to PhD and competitive exams — into a lesson-by-lesson daily plan, with focus timer, spaced recall and a built-in tutor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#5B5CE2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body className="theme-default">{children}</body>
    </html>
  );
}
