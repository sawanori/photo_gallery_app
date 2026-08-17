import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Photo Gallery",
  description: "Photo delivery gallery",
  /**
   * サイト全体を検索対象から外す。
   *
   * このサイトに一般公開するページは無い。トップページは招待リンクへの案内だけで、
   * それ以外はすべて招待トークンで守られた納品用のギャラリーである。
   * 検索結果に出ると、招待リンクで配る前提そのものが崩れる。
   *
   * robots.txt でクロールを禁止する方法は採らない。クロールを止めると
   * この noindex 自体が読まれず、外部からリンクされた場合に URL だけが
   * 索引に残ることがある。クロールは許し、noindex で拒否する。
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://photo-gallery-app-20251204.firebasestorage.app" />
        <link rel="dns-prefetch" href="https://photo-gallery-app-20251204.firebasestorage.app" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600&family=Noto+Sans+JP:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
