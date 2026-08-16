/**
 * 招待ドキュメントの ID を token の値に移行する。
 *
 * なぜ必要か:
 *   現在 web は `where('token','==',token)` のコレクションクエリで招待を引いている。
 *   これは Firestore の list 操作にあたるため、`invitations` の list を禁止すると
 *   ギャラリーが開かなくなる。一方 list を許可したままだと、匿名認証しただけの第三者が
 *   招待を全件列挙して token（実質的なアクセス鍵）を平文で収穫できる
 *   （2026-08-17 に実際に列挙できることを確認した）。
 *
 *   ドキュメント ID を token にすれば、web は単一ドキュメント取得（get）で引けるようになり、
 *   list を管理者のみに制限してもギャラリーは動く。
 *
 * 使い方:
 *   node scripts/migrate-invitation-ids.mjs            # 複製のみ（既定。安全）
 *   node scripts/migrate-invitation-ids.mjs --delete-old  # 複製後に旧ドキュメントを削除
 *
 *   Firebase の設定は web/.env.local から自動で読む。
 *   環境変数（FIREBASE_API_KEY 等）が設定されていればそちらを優先する。
 *   実行時に管理者のメールアドレスとパスワードを尋ねる（invitations の一覧取得と
 *   書き込みには管理者権限が必要なため）。
 *
 * 冪等性:
 *   ドキュメント ID が既に token と一致しているものは移行済みとして飛ばす（削除もしない）。
 *   複製先が既に存在する場合は上書きしない。--delete-old のときは、
 *   複製が前回の実行で作られていても旧ドキュメントを削除する。
 *   何度実行しても安全。
 *
 * 削除の安全確認:
 *   削除の前に複製先を読み直し、token が一致し、imageIds の件数も一致することを
 *   確かめてから消す。取り違えて別の招待を消さないため。
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const webModules = resolve(repoRoot, 'web', 'node_modules');

const require = createRequire(resolve(webModules, '_placeholder.js'));

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} = require('firebase/firestore');

const DELETE_OLD = process.argv.includes('--delete-old');

// --- Firebase の設定を集める ---
function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const webEnv = loadEnvFile(resolve(repoRoot, 'web', '.env.local'));

function conf(name) {
  return process.env[`FIREBASE_${name}`] || webEnv[`NEXT_PUBLIC_FIREBASE_${name}`];
}

const firebaseConfig = {
  apiKey: conf('API_KEY'),
  authDomain: conf('AUTH_DOMAIN'),
  projectId: conf('PROJECT_ID'),
  storageBucket: conf('STORAGE_BUCKET'),
  messagingSenderId: conf('MESSAGING_SENDER_ID'),
  appId: conf('APP_ID'),
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase の設定が見つかりません。');
  console.error('web/.env.local を用意するか、FIREBASE_API_KEY などの環境変数を設定してください。');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function prompt(question, { mask = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolvePrompt) => {
    if (mask) {
      // パスワードを画面に残さない
      const onData = (char) => {
        if (['\n', '\r', ''].includes(char.toString())) {
          process.stdin.removeListener('data', onData);
        } else {
          process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
        }
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (mask) process.stdout.write('\n');
      resolvePrompt(answer);
    });
  });
}

async function main() {
  console.log(`対象プロジェクト: ${firebaseConfig.projectId}`);
  console.log(`モード: ${DELETE_OLD ? '複製したうえで旧ドキュメントを削除' : '複製のみ（旧ドキュメントは残す）'}`);
  console.log('');

  const email = await prompt('管理者のメールアドレス: ');
  const password = await prompt('パスワード: ', { mask: true });

  await signInWithEmailAndPassword(auth, email, password);
  console.log('サインインしました。');
  console.log('');

  const snapshot = await getDocs(collection(db, 'invitations'));
  console.log(`招待ドキュメント: ${snapshot.size} 件`);
  console.log('');

  let migrated = 0;
  let already = 0;
  let skipped = 0;
  let failed = 0;
  let deleted = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const token = data.token;
    const label = `${docSnap.id} (${data.clientName ?? '名前なし'})`;

    if (typeof token !== 'string' || token.length === 0) {
      console.log(`  移行不可 ${label}: token フィールドが無い`);
      skipped += 1;
      continue;
    }

    // これは既に移行後のドキュメント。絶対に削除しない。
    if (docSnap.id === token) {
      console.log(`  移行済み ${label}`);
      already += 1;
      continue;
    }

    // 招待の作成は Firestore ルールで projectId を必須にしている。
    // 持たない古い招待は複製を作れないため、最初から試みない。
    if (typeof data.projectId !== 'string' || data.projectId.length === 0) {
      console.log(`  移行不可 ${label}: projectId が無いためルール上コピーを作成できない`);
      skipped += 1;
      continue;
    }

    try {
      const target = doc(db, 'invitations', token);
      const existing = await getDoc(target);

      if (!existing.exists()) {
        await setDoc(target, data);
        console.log(`  複製   ${label} → ${token}`);
        migrated += 1;
      } else {
        console.log(`  複製済 ${label} → ${token}`);
      }

      if (!DELETE_OLD) continue;

      // 削除の前に、複製先が本当に同じ招待かを確かめる。
      // 取り違えて別の招待を消さないための保険。
      const copy = (await getDoc(target)).data();
      const sameToken = copy?.token === token;
      const sameCount = (copy?.imageIds ?? []).length === (data.imageIds ?? []).length;
      if (!sameToken || !sameCount) {
        console.log(`  削除中止 ${label}: 複製先の内容が一致しない（token=${sameToken} 枚数=${sameCount}）`);
        failed += 1;
        continue;
      }

      await deleteDoc(doc(db, 'invitations', docSnap.id));
      console.log(`  旧削除 ${docSnap.id}`);
      deleted += 1;
    } catch (error) {
      console.log(`  失敗   ${label}: ${error.code ?? error.message}`);
      failed += 1;
    }
  }

  console.log('');
  console.log('--- 結果 ---');
  console.log(`複製      : ${migrated} 件`);
  console.log(`移行済み  : ${already} 件`);
  console.log(`スキップ  : ${skipped} 件`);
  console.log(`失敗      : ${failed} 件`);
  if (DELETE_OLD) console.log(`旧削除    : ${deleted} 件`);

  if (!DELETE_OLD && migrated > 0) {
    console.log('');
    console.log('旧ドキュメントは残してあります。新しいリンクで表示を確認したあと、');
    console.log('node scripts/migrate-invitation-ids.mjs --delete-old で削除してください。');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('');
  console.error(`エラー: ${error.code ?? error.message}`);
  process.exit(1);
});
