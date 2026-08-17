import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // ユニバーサルリンクの設定ファイル。拡張子が無いため既定では
        // application/octet-stream で配信され、Apple はこれを受け付けない。
        // 明示的に application/json を指定する。
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
