'use client';

import dynamic from 'next/dynamic';

/**
 * `dynamic()` はモジュールの読み込み時に1回だけ呼ぶ。
 * レンダー中に呼ぶと**毎回別のコンポーネント型**が生まれ、React は中身を
 * 作り直す（＝入力中のフォームの状態が消える）。
 */
const LoginForm = dynamic(() => import('./LoginForm'), {
  ssr: false,
  loading: () => <p>Loading…</p>,
});

export default function LoginFormLoader() {
  return <LoginForm />;
}
