import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Technic — грузоперевозки и спецтехника",
  description: "Заказ грузоперевозок и спецтехники в Бишкеке: своя цена, торг, трекинг на карте",
  appleWebApp: { capable: true, title: "Technic", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F5F4EF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} antialiased`}>{children}</body>
    </html>
  );
}
