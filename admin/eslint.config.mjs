import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * `next lint` は Next 16 で削除された。`npm run lint` は `eslint .` を直接呼ぶ。
 *
 * `next lint` は app/ src/ などだけを見ていたが、`eslint .` はリポジトリ全体を見る。
 * ビルド生成物（.next / out / build）と Next が生成する next-env.d.ts は
 * eslint-config-next の既定でも無視されるが、globalIgnores を書くと既定を
 * **上書きしてしまう**ため、ここで明示的に列挙し直している。
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // eslint-config-next の既定の無視対象（上書きするので写す）
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // このリポジトリ固有
    'playwright-report/**',
    'test-results/**',
  ]),
]);

export default eslintConfig;
