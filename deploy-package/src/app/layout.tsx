import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
/* One refinement layer. Ten historical patch sheets used to be imported one
   after the other, each quietly overriding the last; they are merged into
   ui-system.css in their original order (see the header there), so the
   cascade has exactly two steps: tokens/base, then the final word. */
import "./ui-system.css";

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-inter",
});

/* One universal typeface for the whole platform.
 *
 * The app used to pair Inter with a second local family (JetBrains Mono) for
 * every timer, chip, date and metric. Two families in one product read as two
 * redesigns stacked on top of each other, the mono file cost an extra 100 kB
 * download, and mono metrics made the numeric columns sit on a different
 * baseline from the labels above them. The `.mono` utility now means "tabular
 * figures, slightly open tracking" — the same Inter, so numerals still align in
 * columns but everything shares one voice. The font file is no longer loaded.
 */
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
    <html lang="en" className={inter.variable}>
      <body className="theme-default">{children}</body>
    </html>
  );
}
