import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "gitCity",
  description:
    "Turn a GitHub contribution history into a 3D daylight skyline. Not affiliated with GitHub.",
};

/**
 * Without this, mobile browsers lay the page out at a ~980px virtual
 * width and scale the result down, so everything renders tiny.
 *
 * `viewportFit: "cover"` lets the scene run under the notch and home
 * indicator; the chrome pads itself back out with env(safe-area-inset-*).
 * Zoom is deliberately left unrestricted -- pinch-to-zoom is an
 * accessibility affordance, not a nuisance to be disabled.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Microsoft Clarity project. Public by design: the tag ships to every
 * visitor, so there is nothing to keep out of the repo. */
const CLARITY_PROJECT_ID = "ya563wbgwm";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}

        {/*
          A plain script element, not next/script. React 19 hoists
          <script> into <head>, so this renders as a real executing tag
          in the served HTML — which is what Clarity's "paste into
          <head>" instruction actually asks for.

          Both next/script strategies failed to do that here.
          `afterInteractive` emits no markup at all: the tag ships inside
          the React flight payload and is injected by Next's loader
          during hydration. `beforeInteractive` emits only a
          <link rel="preload">, which fetches but does not run. Either
          way nothing in the HTML executes on its own.

          The src form rather than Clarity's inline loader: that snippet
          only builds this exact tag, plus a queue stub for calling
          `clarity()` before it loads, which nothing here does.
        */}
        <script async src={`https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`} />
      </body>
    </html>
  );
}
