import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Chat', 
  description: "A Multi Modal AI agent that diagnoses health conditions by sequentially analysing patient symptoms, chest X-ray images, and structured clinical records — then triages and books appropriate specialist appointments.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function ChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
    </>
  );
}