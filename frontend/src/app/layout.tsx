"use client";

import { Amplify } from "aws-amplify";
import amplifyConfig from "../amplify-config";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

Amplify.configure(amplifyConfig);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
