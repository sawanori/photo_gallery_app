import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';

import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "管理画面",
  description: "写真ギャラリー管理画面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={outfit.variable} style={{ fontFamily: "'Outfit', sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
