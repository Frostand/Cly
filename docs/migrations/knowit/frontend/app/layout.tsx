import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Field Mapper",
  description: "Local-first research field mapping workflow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
