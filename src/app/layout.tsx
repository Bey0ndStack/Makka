import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "مكة | Makkah", template: "%s | مكة" },
  description: "منصة مكة لإدارة العمليات المالية والتجارية",
  icons: { icon: "/app/favicon.svg" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
