import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Process IQ CRM", template: "%s · Process IQ CRM" },
  description: "A simple CRM with built-in email and AI help, made for small and medium businesses.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f6fb" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
