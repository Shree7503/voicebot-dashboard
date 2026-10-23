import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RakshakAI — Police Control Room",
  description:
    "Police control room dashboard for the RakshakAI voice bot. Monitor emergencies, review calls, and manage operations.",
  // the Maharashtra Police emblem: its round seal for the browser tab and phone home screen
  // (the full emblem's lettering is unreadable at tab size), the whole emblem elsewhere
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
