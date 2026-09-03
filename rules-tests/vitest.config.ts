import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // ルールテストは1つのエミュレータを共有し、テストごとに clearFirestore() する。
    // 並列に走らせると別ファイルのシードを消し合うため直列に固定する。
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
