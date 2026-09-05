import type { Metadata } from "next";
import { Instrument_Serif, Noto_Sans_JP, Outfit } from "next/font/google";
import "./globals.css";

/**
 * フォントは next/font で**自ホストする**。
 *
 * 以前は `<link href="https://fonts.googleapis.com/...">` を直接置いていたが、
 * これだと (1) CSS を取りに行ってから初めて本体を取りに行く 2 往復になり、
 * (2) 訪問者の IP が Google に渡る。next/font はビルド時に実体を取り込んで
 * 同一オリジンから配り、`<link rel=preload>` も自動で付ける。
 *
 * `subsets` は**プリロードする範囲**の指定であって、取り込む範囲の指定ではない。
 * Noto Sans JP の日本語グリフ（unicode-range で 100 以上に分割されている）は
 * subsets に無くてもすべて自ホストされ、必要な塊だけブラウザが取りに行く。
 * ここで latin だけを preload するのは、初期表示に必要なのが英字だから。
 */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "フォトギャラリー",
  description: "写真納品用のギャラリーです。",
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
    <html
      lang="ja"
      className={`${instrumentSerif.variable} ${outfit.variable} ${notoSansJp.variable}`}
    >
      <head>
        {/* 写真は Storage から来る。接続の確立だけ先に済ませておく。 */}
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://photo-gallery-app-20251204.firebasestorage.app" />
        <link rel="dns-prefetch" href="https://photo-gallery-app-20251204.firebasestorage.app" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
