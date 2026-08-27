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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
