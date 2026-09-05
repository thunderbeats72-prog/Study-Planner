import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./study-planner-refresh.css";
import "./pastel-ui-system.css";
import "./study-planner-redesign.css";
import "./practical-enhancements.css";
import "./ui-polish.css";
/* editorial.css is the authoritative art-direction layer of the “Study Orbit”
   redesign: brand tokens, editorial typography, spatial composition and the
   finish for every surface. It is imported last on purpose so it wins the
   cascade over the earlier iteration sheets. */
import "./editorial.css";

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

/* Fraunces — the editorial display serif of the brand. The “full” variable
   files carry opsz + wght + SOFT + WONK axes; optical size and softness are
   dialled per-element with font-variation-settings in editorial.css. */
const fraunces = localFont({
  src: "./fonts/fraunces-latin-variable.woff2",
  display: "swap",
  weight: "300 700",
  variable: "--font-fraunces",
});

const frauncesItalic = localFont({
  src: "./fonts/fraunces-latin-italic-variable.woff2",
  display: "swap",
  weight: "300 700",
  variable: "--font-fraunces-italic",
});

export const metadata: Metadata = {
  title: "Study Planner — A quiet place to learn",
  description:
    "An AI study architect that turns any syllabus — school to PhD and competitive exams — into a lesson-by-lesson daily plan, with focus timer, spaced recall and a built-in tutor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#F2EFE8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} ${fraunces.variable} ${frauncesItalic.variable}`}
    >
      <body className="theme-default">{children}</body>
    </html>
  );
}
