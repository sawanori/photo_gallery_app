/**
 * 既存の画像に 1920px の WebP（thumbnails.large）を後追いで作る。
 *
 * 2026-09-06 より前にアップロードした画像には large が無い。web の拡大表示は
 * それが無いと原本を `/api/image?w=1920` に通し、CDN が冷えていると本番実測で
 * 1 枚あたり 4.5 秒かかる。写真を最初に開くのは納品先のクライアントなので、
 * 既存の案件ほどこの遅さを踏む。
 *
 * **既定は dry run。** 実際に書き込むには `--apply` を付ける。
 *
 *   node scripts/backfill-large-thumbnails.mjs <email>
 *   node scripts/backfill-large-thumbnails.mjs <email> --apply
 *   node scripts/backfill-large-thumbnails.mjs <email> --apply --token <招待トークン>
 *
 * パスワードは省略すると対話で聞く。**引数に書かないこと**（シェルの履歴に残る）。
 * Firebase の設定は web/.env.local から自動で読む。
 *
 * **注意: サムネイルは元画像の userId（アップロードした管理者の uid）配下に置く。**
 * storage.rules の create は `isAdmin() && request.auth.uid == userId` なので、
 * 元のアップロード者と同じ管理者アカウントでログインしないと拒否される。
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webModules = resolve(__dirname, '..', 'web', 'node_modules');
const require = createRequire(resolve(webModules, '_placeholder.js'));

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} = require('firebase/firestore');
const {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} = require('firebase/storage');
const sharp = require('sharp');

/**
 * 設定は `web/.env.local` から読む。
 *
 * 同じ値を FIREBASE_* として6個 export し直す運用にすると、写し間違いに気付かないまま
 * 別のプロジェクトへ書き込みかねない。環境変数が既にあればそちらを優先する。
 */
function loadEnvFile() {
  const path = resolve(__dirname, '..', 'web', '.env.local');
  const values = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return values;
  }
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const fileEnv = loadEnvFile();
const setting = (name) =>
  process.env[`FIREBASE_${name}`] ??
  process.env[`NEXT_PUBLIC_FIREBASE_${name}`] ??
  fileEnv[`NEXT_PUBLIC_FIREBASE_${name}`];

const firebaseConfig = {
  apiKey: setting('API_KEY'),
  authDomain: setting('AUTH_DOMAIN'),
  projectId: setting('PROJECT_ID'),
  storageBucket: setting('STORAGE_BUCKET'),
  messagingSenderId: setting('MESSAGING_SENDER_ID'),
  appId: setting('APP_ID'),
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Error: Firebase の設定が見つかりません。');
  console.error('web/.env.local に NEXT_PUBLIC_FIREBASE_* を置くか、');
  console.error('FIREBASE_API_KEY 等を環境変数で渡してください。');
  process.exit(1);
}

console.log(`Project: ${firebaseConfig.projectId}`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * admin/src/utils/prepareUpload.ts の large と同じ設定にする。
 * **片方だけ変えないこと。** 新規アップロードと後追い分で見え方が変わる。
 */
const LARGE_WIDTH = 1920;
const LARGE_QUALITY = 82;

/** admin/src/services/imageService.ts の STORAGE_CACHE_CONTROL と同じ。 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * パスワードを尋ねる。
 *
 * 端末に繋がっていない（エージェントのシェルやパイプ越しの）実行では、
 * プロンプトを出しても入力が返らず、空文字のまま認証に進んで
 * `auth/invalid-credential` になる。**原因が分からないエラーを出すより、
 * 何をすればよいかを言って止まる。**
 */
function prompt(question) {
  if (!process.stdin.isTTY) {
    console.error(`\n${question.trim()} を読み取れません（端末に繋がっていません）。`);
    console.error('ターミナルから直接実行するか、パスワードを標準入力に渡してください:');
    console.error('  node scripts/backfill-large-thumbnails.mjs <email> --apply < password.txt');
    process.exit(1);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** 標準入力がファイル・パイプなら、1行目をパスワードとして読む。 */
function readPasswordFromStdin() {
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, 'utf8').split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extractFilename(storagePath) {
  return storagePath.split('/').pop();
}

function parseArgs() {
  const args = { token: null, email: null, password: null, apply: false, limit: null };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--token' && process.argv[i + 1]) {
      args.token = process.argv[++i];
    } else if (arg === '--limit' && process.argv[i + 1]) {
      args.limit = Number(process.argv[++i]);
    } else if (!args.email) {
      args.email = arg;
    } else if (!args.password) {
      args.password = arg;
    }
  }
  return args;
}

async function loadImages(token) {
  if (!token) {
    const snapshot = await getDocs(collection(db, 'images'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  console.log(`Filtering by invitation token: ${token}`);
  const invSnap = await getDocs(
    query(collection(db, 'invitations'), where('token', '==', token))
  );
  if (invSnap.empty) {
    console.error('Invitation not found for token:', token);
    process.exit(1);
  }
  const imageIds = invSnap.docs[0].data().imageIds || [];
  console.log(`Invitation has ${imageIds.length} images`);

  const imageDocs = await Promise.all(
    imageIds.map((id) => getDoc(doc(db, 'images', id)))
  );
  return imageDocs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }));
}

async function backfillOne(img) {
  const imageBuffer = await downloadImage(img.url);
  const filename = extractFilename(img.storagePath);

  const resized = await sharp(imageBuffer)
    .resize({ width: LARGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: LARGE_QUALITY })
    .toBuffer();

  const thumbPath = `thumbnails/${img.userId}/${filename}_${LARGE_WIDTH}.webp`;
  const thumbRef = ref(storage, thumbPath);
  await uploadBytes(thumbRef, resized, {
    contentType: 'image/webp',
    cacheControl: CACHE_CONTROL,
  });
  const thumbUrl = await getDownloadURL(thumbRef);

  // 既存のパスは消さずに足す。消すと元の 384 / 640 が削除対象から漏れて
  // Storage に孤児が残る。
  const paths = Array.isArray(img.thumbnailPaths) ? img.thumbnailPaths : [];
  const thumbnailPaths = paths.includes(thumbPath) ? paths : [...paths, thumbPath];

  await updateDoc(doc(db, 'images', img.id), {
    thumbnails: { ...(img.thumbnails || {}), large: thumbUrl },
    thumbnailPaths,
    updatedAt: serverTimestamp(),
  });

  return { bytes: resized.length, originalBytes: imageBuffer.length };
}

async function main() {
  const args = parseArgs();

  const email = args.email || (await prompt('Admin email: '));
  const password =
    args.password || readPasswordFromStdin() || (await prompt('Admin password: '));

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('Authenticated as', email);
  } catch (err) {
    console.error('Auth failed:', err.message);
    process.exit(1);
  }

  const allImages = await loadImages(args.token);

  // small / medium すら無い画像は migrate-thumbnails.mjs の担当。ここでは触らない。
  const missingAll = allImages.filter((img) => !img.thumbnails);
  let toProcess = allImages.filter((img) => img.thumbnails && !img.thumbnails.large);
  if (args.limit) toProcess = toProcess.slice(0, args.limit);

  console.log(`Total images:            ${allImages.length}`);
  console.log(`Already have large:      ${allImages.length - toProcess.length - missingAll.length}`);
  console.log(`Need large:              ${toProcess.length}`);
  if (missingAll.length > 0) {
    console.log(
      `No thumbnails at all:    ${missingAll.length}  ← migrate-thumbnails.mjs を先に流すこと`
    );
  }

  if (!args.apply) {
    console.log('\nDry run. 実際に書き込むには --apply を付けて再実行してください。');
    process.exit(0);
  }

  if (toProcess.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const img = toProcess[i];
    const label = `[${i + 1}/${toProcess.length}] ${img.id}`;
    try {
      const { bytes, originalBytes } = await backfillOne(img);
      success++;
      console.log(
        `${label} OK  ${(originalBytes / 1024 / 1024).toFixed(2)}MB -> ${(bytes / 1024).toFixed(0)}KB`
      );
    } catch (err) {
      failed++;
      console.error(`${label} FAILED:`, err.message);
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${toProcess.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
