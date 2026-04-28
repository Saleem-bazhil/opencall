import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenCall Daily Call Plan",
  description: "Daily Call Plan operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
