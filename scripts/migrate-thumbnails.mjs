import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webModules = resolve(__dirname, '..', 'web', 'node_modules');

// Use createRequire to load packages from web/node_modules
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

// --- Firebase config ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Error: Firebase environment variables not set.');
  console.error(
    'Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID'
  );
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Thumbnail config (matches admin/src/utils/thumbnailGenerator.ts) ---
const SIZES = [
  { name: 'small', width: 384 },
  { name: 'medium', width: 640 },
];
const QUALITY = 70;

// --- Helpers ---
function prompt(question) {
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

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extractFilename(storagePath) {
  return storagePath.split('/').pop();
}

async function generateAndUpload(imageBuffer, userId, filename) {
  const thumbnailData = { small: '', medium: '' };
  const thumbnailPaths = [];

  for (const size of SIZES) {
    const resized = await sharp(imageBuffer)
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    const thumbPath = `thumbnails/${userId}/${filename}_${size.width}.webp`;
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, resized, { contentType: 'image/webp' });
    const thumbUrl = await getDownloadURL(thumbRef);

    thumbnailData[size.name] = thumbUrl;
    thumbnailPaths.push(thumbPath);
  }

  return { thumbnailData, thumbnailPaths };
}

// --- CLI args ---
function parseArgs() {
  const args = { token: null, email: null, password: null };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--token' && process.argv[i + 1]) {
      args.token = process.argv[++i];
    } else if (!args.email) {
      args.email = process.argv[i];
    } else if (!args.password) {
      args.password = process.argv[i];
    }
  }
  return args;
}

// --- Main ---
async function main() {
  const args = parseArgs();

  const email = args.email || (await prompt('Admin email: '));
  const password = args.password || (await prompt('Admin password: '));

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('Authenticated as', email);
  } catch (err) {
    console.error('Auth failed:', err.message);
    process.exit(1);
  }

  let allImages;

  if (args.token) {
    console.log(`Filtering by invitation token: ${args.token}`);
    const invQ = query(
      collection(db, 'invitations'),
      where('token', '==', args.token)
    );
    const invSnap = await getDocs(invQ);
    if (invSnap.empty) {
      console.error('Invitation not found for token:', args.token);
      process.exit(1);
    }
    const invitation = invSnap.docs[0].data();
    const imageIds = invitation.imageIds || [];
    console.log(`Invitation has ${imageIds.length} images`);

    const imageDocs = await Promise.all(
      imageIds.map((id) => getDoc(doc(db, 'images', id)))
    );
    allImages = imageDocs
      .filter((d) => d.exists())
      .map((d) => ({ id: d.id, ...d.data() }));
  } else {
    const snapshot = await getDocs(collection(db, 'images'));
    allImages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const toProcess = allImages.filter((img) => !img.thumbnails);

  console.log(
    `Found ${allImages.length} images, ${toProcess.length} need thumbnails`
  );

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
      const imageBuffer = await downloadImage(img.url);
      const filename = extractFilename(img.storagePath);

      const { thumbnailData, thumbnailPaths } = await generateAndUpload(
        imageBuffer,
        img.userId,
        filename
      );

      await updateDoc(doc(db, 'images', img.id), {
        thumbnails: thumbnailData,
        thumbnailPaths,
        updatedAt: serverTimestamp(),
      });

      success++;
      console.log(`${label} OK`);
    } catch (err) {
      failed++;
      console.error(`${label} FAILED:`, err.message);
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${toProcess.length}`);

  process.exit(0);
}

main();
