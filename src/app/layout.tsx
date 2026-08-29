import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
          next/script rather than a raw tag in <head>. The App Router
          controls the document head, and an inline script written there
          is not guaranteed to survive or to run once; `afterInteractive`
          hands it to Next's loader, which injects it after hydration and
          deduplicates it across client navigations.

          Production only, so a dev server does not file sessions
          alongside real ones. Preview deploys still count -- they build
          with NODE_ENV=production -- which is usually what you want.
        */}
        {process.env.NODE_ENV === "production" ? (
          <Script id="clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
