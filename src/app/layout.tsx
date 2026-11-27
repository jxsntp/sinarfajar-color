import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Color Studio · Inaura",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
