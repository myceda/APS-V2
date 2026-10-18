import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
const thaiFont = localFont({ src: "./fonts/NotoSansThai.ttf", display: "swap", variable: "--font-thai", weight: "100 900" });

export const metadata: Metadata = {
  title: "APS · วางแผนการเรียนอย่างเข้าใจ",
  description:
    "เตรียมผลการเรียนเพื่อวางแผนรายเทอมสำหรับหลักสูตร CS2565 ทั้งโครงงานวิจัยและสหกิจศึกษา",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={thaiFont.variable}>
      <body>{children}</body>
    </html>
  );
}
