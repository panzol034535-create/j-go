import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { clerkLocalization } from "@/lib/clerk-localization";
import { LOOKPICK_BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: LOOKPICK_BRAND.name,
  description: LOOKPICK_BRAND.description,
  openGraph: {
    title: LOOKPICK_BRAND.name,
    description: LOOKPICK_BRAND.description,
    images: [
      {
        url: LOOKPICK_BRAND.brandHeroSrc,
        alt: LOOKPICK_BRAND.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: LOOKPICK_BRAND.name,
    description: LOOKPICK_BRAND.description,
    images: [LOOKPICK_BRAND.brandHeroSrc],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        <ClerkProvider
          appearance={clerkAppearance}
          localization={clerkLocalization}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
