import "@/styles/globals.css";
import { Nunito_Sans } from "next/font/google";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";

import wakeSpaces from "@/lib/wake_spaces";

export const metadata: Metadata = {
  title: { 
    default: "Health Pilot",
    template: "%s | Health Pilot"
  }, 
  description: "A Multi Modal AI agent that diagnoses health conditions by sequentially analysing patient symptoms, chest X-ray images, and structured clinical records — then triages and books appropriate specialist appointments.",
  icons: {
    icon: "/images/logo.png",
    shortcut: "/images/logo.png",
    apple: "/images/logo.png",
  },
};

// wake the huggingface spaces for diagnostic models on app load, so that the first user doesn't have to wait for them to wake up
await wakeSpaces().then((results) => {console.log("[wake] All Spaces woken:", results);}).catch((err) => {console.error("[wake] wakeSpaces failed:", err);});

// const geist = Geist({
//   subsets: ["latin"],
//   variable: "--font-geist-sans",
// });

// Configure the font
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nunito-sans",
  // Nunito Sans is a variable font, so we don't need to specify weights, 
  // it will automatically support 200-1000.
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${nunitoSans.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
