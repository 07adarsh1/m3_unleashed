import type { Metadata } from "next";
import { ReactNode } from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
  display: "swap",
});

// Production URL first, then Vercel's build-time URL, then local dev.
// Set NEXT_PUBLIC_SITE_URL in Vercel project settings when adding a custom domain.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:4173");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BMW M3 Competition — An Interactive Cinematic Experience",
  description:
    "M3 // UNLEASHED — a scroll-driven cinematic microsite. Your scroll is the throttle: drive the film frame by frame, forward and in reverse.",
  openGraph: {
    title: "BMW M3 Competition — An Interactive Cinematic Experience",
    description: "Scroll is the throttle. Drive the film, frame by frame.",
    images: ["/og/og-image.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BMW M3 Competition — An Interactive Cinematic Experience",
    description: "Scroll is the throttle. Drive the film, frame by frame.",
    images: ["/og/og-image.jpg"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "BMW M3 Competition — 4K Cinematic Short Film",
  description:
    "A cinematic short film featuring the BMW M3 Competition, presented as a scroll-interactive experience.",
  thumbnailUrl: `${siteUrl}/og/og-image.jpg`,
  uploadDate: "2026-08-21",
  duration: "PT33S",
  contentUrl: `${siteUrl}/video/master.mp4`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        <noscript>
          <style>{`.loading-screen,.boot-shade{display:none!important}`}</style>
        </noscript>
      </body>
    </html>
  );
}
