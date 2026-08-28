import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./study-planner-refresh.css";
import "./study-planner-scene.css";
import "./pastel-ui-system.css";

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
    "An AI study architect that turns any syllabus — nursery to PhD to competitive exams — into a lesson-by-lesson daily plan, with focus timer, spaced recall and a built-in tutor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android soft keyboard resizes the layout instead of covering the chat
  // input; iOS sheets keep their safe-area padding.
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
