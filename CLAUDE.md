# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photo gallery application with Firebase backend:
- **Client Gallery** (`/web`): Next.js invitation-based photo gallery (Port 3002, Tailwind CSS 4)
- **Native Shell** (`/mobile`): Expo app that displays `/web` in a WebView and adds photo-library saving
- **Admin Panel** (`/admin`): Next.js web dashboard (Port 3001, Ant Design)
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Legacy** (`/front`, `/back`): an older Expo app + NestJS API. `/front` does not currently run (its
  `package.json` is missing `firebase` and `@react-native-async-storage/async-storage`, which its
  source imports). It is unrelated to `/mobile` — do not confuse the two, and do not modify it.

## Firebase Project

- **Project ID**: `photo-gallery-app-20251204`
- **Console**: https://console.firebase.google.com/project/photo-gallery-app-20251204

### Firebase Services
- **Authentication**: two providers must be enabled. **Email/Password** for admins, and
  **Anonymous** for gallery visitors — `/web` calls `signInAnonymously()` on every gallery open
  (`web/src/services/authService.ts`), and `/web`'s Route Handlers sign in anonymously too
  (`web/src/lib/firebaseServer.ts`). With Anonymous disabled the gallery cannot load at all.
- **Firestore**: NoSQL database for projects, images, invitations, sessions, likes, users
- **Storage**: original images and generated WebP thumbnails
- **Hosting**: **not used.** `/admin` and `/web` are both deployed on Vercel, as two separate
  Vercel projects: `admin/.vercel/project.json` links the admin panel, and the repo-root
  `.vercel/project.json` links `/web`. Check which one you are in before running `vercel`.
  Firebase is used for rules and indexes only.

## Development Commands

### Client Gallery (Next.js)
```bash
cd web
npm run dev                    # Development (port 3002)
npm test                       # Vitest
npm run lint                   # ESLint
npm run build                  # Production build (also type-checks)
```

### Native Shell (Expo)
```bash
cd mobile
npm start                      # Expo dev server
npm run ios                    # iOS simulator
npm run android                # Android emulator
npm run typecheck              # tsc --noEmit
npm test                       # Jest (jest-expo)
npx expo prebuild --platform android --clean   # Inspect the generated AndroidManifest
```

### Admin Panel (Next.js)
```bash
cd admin
npm run dev                    # Development (port 3001)
npm run build && npm start     # Production
npm run lint                   # ESLint (`eslint .` — `next lint` no longer exists in Next 16)
npx vitest run                 # Vitest
```

### Security Rules Tests (`/rules-tests`)
```bash
cd rules-tests
npm install
npm run test:emu               # Boots auth/firestore/storage emulators, then runs vitest
npm test                       # vitest only — requires emulators already running
```
`rules-tests` is a standalone package (`@firebase/rules-unit-testing` + Vitest) that pins the
current `firestore.rules` / `storage.rules` behaviour for every client operation, on both the
allowed and the denied side. Run it after **any** rules edit. It pins its own `firebase-tools`
(14.x) as a devDependency because firebase-tools 15 refuses to start the emulators on JDK < 21.

### Firebase CLI
```bash
firebase deploy --only firestore:rules              # Deploy Firestore rules
firebase deploy --only storage:rules                # Deploy Storage rules
firebase deploy --only firestore:indexes            # Deploy Firestore indexes
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
```
Rules and indexes are the **only** things deployed to Firebase. There is no `hosting` target —
do not run `firebase deploy` without `--only`.

**`storage.rules` reads Firestore cross-service, and that needs an IAM role in production.** The
admin check calls `firestore.get()` on `users/{uid}`, which only works if the Cloud Storage service
agent holds `roles/firebaserules.firestoreServiceAgent`. Without it every admin upload fails with
`storage/unauthorized`. The emulators have no IAM layer, so `rules-tests` passes either way — a
green test run is **not** evidence that production works. `firebase deploy` normally offers to grant
the role, but skips the prompt silently in a non-TTY shell (CI, or an agent running the command),
which is how production upload broke on 2026-09-03. Grant it by hand and verify:
```bash
gcloud projects add-iam-policy-binding photo-gallery-app-20251204 \
  --member=serviceAccount:service-270044733802@gcp-sa-firebasestorage.iam.gserviceaccount.com \
  --role=roles/firebaserules.firestoreServiceAgent
gcloud projects get-iam-policy photo-gallery-app-20251204 --flatten="bindings[].members" \
  --filter="bindings.role:roles/firebaserules.firestoreServiceAgent" --format="value(bindings.members)"
```
IAM changes are eventually consistent, usually within about two minutes. After any rules change,
verify against production as a real admin rather than trusting the emulator run.

Storage CORS (needed by the bulk-ZIP download and LINE sharing, which `fetch()` the image URLs
from the browser). `cors.json` lives at the repo root; apply it with:
```bash
gsutil cors set cors.json gs://photo-gallery-app-20251204.firebasestorage.app
gsutil cors get gs://photo-gallery-app-20251204.firebasestorage.app   # verify
```

## Architecture

### Firebase Configuration
- **Config Files**:
  - `firebase.json` - Firebase project config
  - `firestore.rules` - Firestore security rules
  - `storage.rules` - Storage security rules
  - `firestore.indexes.json` - Firestore indexes

### Client Gallery (`/web`)
- **Firebase Config**: `web/src/lib/firebase.ts` (browser), `web/src/lib/firebaseServer.ts`
  (Route Handlers — a separate app instance so the server's anonymous sign-in never mixes with
  the browser's auth state)
- **Services**: `web/src/services/`
  - `authService.ts` - anonymous sign-in only (no sign-up, no password)
  - `invitationService.ts` - invitation lookup by token, session create/update, access counting
  - `imageService.ts` - image documents fetched one by one by ID (never a collection query)
  - `likeService.ts` - like/unlike, keyed by **invitation**, not by anonymous UID
  - `manifestService.ts` - authorises the native app's save requests
  - `downloadService.ts` - bulk ZIP download in the browser
- **Contexts**: `AuthContext` (anonymous Firebase Auth), `GalleryContext` (invitation + images)
- **Routes**: `/gallery/[token]`, `/liked`, `/privacy`, and two Route Handlers:
  `/api/image` (sharp resize proxy) and `/api/native/manifest` (native save authorisation)

**Image delivery.** The grid reads `thumbnails.small` / `.medium` and the lightbox reads
`thumbnails.large` — all straight from Storage. `/api/image` is only a fallback for images
uploaded before 2026-09-06 that have no `large`. It runs in `hnd1` (`preferredRegion`) because
the bucket is `ASIA1` and the default US region made a cold request take 4.5s against 0.35s for
a direct Storage fetch. It always returns WebP and sets **no `Vary` header**: Vercel keys its CDN
cache on the raw `Accept` string, so the previous AVIF/WebP/JPEG negotiation split the cache per
browser and almost never hit. Do not reintroduce `Vary: Accept` here.

### Admin Panel (`/admin`)
- **Firebase Config**: `admin/src/lib/firebase.ts`
- **Services**: `admin/src/services/`
  - `authService.ts` - Admin authentication (admin role required)
  - `projectService.ts` - Project CRUD and cascading delete
  - `imageService.ts` - Upload (original + WebP thumbnails), listing, deletion
  - `invitationService.ts` - Invitation issuing; the document ID **is** the token
  - `likeService.ts` - Reads the client's selection back per invitation
  - `userService.ts` - User management
- **Contexts**: `admin/src/contexts/AuthContext.tsx`
- **Routes**: `/` (login), `/admin/dashboard` (project list), `/admin/projects/new`,
  `/admin/projects/[projectId]`, `/admin/projects/[projectId]/images/upload`,
  `/admin/projects/[projectId]/invitations/create`,
  `/admin/projects/[projectId]/invitations/[id]`, `/admin/users`
- **UI**: Ant Design components

### Native Shell (`/mobile`)

The mobile app deliberately owns **no UI**. It loads the deployed `/web` gallery in a
`react-native-webview` and adds the one thing a browser cannot do on iOS: writing images straight
into the device photo library. Keeping the UI in one place means `/web` changes reach the app
without an app release.

- **Language**: the `expo-localization` plugin declares `supportedLocales: { ios: ['ja'] }`, which
  is what puts `CFBundleLocalizations` in the built `Info.plist`. Without it iOS treats the app as
  English and shows it that way in Settings, even though every string in the app is Japanese.
  Verify a config change with `npx expo config --type introspect | grep CFBundleLocalizations`.
- **Config**: `mobile/app.config.ts` (scheme, universal links, permissions). `mobile/src/config.ts`
  holds the allowed image origins and the batch limits. The gallery origin comes from
  `EXPO_PUBLIC_WEB_ORIGIN`.
- **Bridge**: `mobile/src/bridge/` implements a versioned `postMessage` protocol. The web side lives
  in `web/src/lib/nativeBridge.ts` — **keep the two in sync**; the web deploys instantly while app
  binaries lag, so the web must feature-detect via `supports` and fall back to browser behaviour.
- **Detection is deliberately triple-redundant**: injected `window.__NATIVE_GALLERY__`, a custom
  User-Agent suffix (`PhotoGalleryApp/<version>`), and `window.ReactNativeWebView`. Android's
  `injectedJavaScriptBeforeContentLoaded` is experimental and does not always arrive.
- **Leaving a gallery**: the app remembers the last token in `expo-secure-store` and opens straight
  into it, so without an explicit exit a viewer with no other link can never get back to the entry
  screen — and deleting the app does not clear the keychain. The web's `LeaveGalleryButton` sends
  `leaveGallery`, and the app forgets the token and shows `OpenByLinkScreen`. **The UI stays in the
  web**; the app owns no screen for it. Gate it with `useSupportsNativeFeature('leaveGallery')` and
  keep the feature out of `FALLBACK_FEATURES` — unlike saving, there is no browser behaviour to
  fall back to, so a button that cannot reach the app must not be drawn at all.
- **Saving**: `mobile/src/save/`. Every URL from the web is re-validated natively (exact origin
  match, Storage path prefix, filename sanitising) before download. Permission is **write-only**
  (`requestPermissionsAsync(true)`), so the app never gains read access to the user's photos.
- **Expo SDK 57 gotchas**: `saveToLibraryAsync` must be imported from `expo-media-library/legacy`
  (the main entry throws at runtime), and `expo-file-system`'s `File.downloadFileAsync` needs an
  explicit `File` destination plus `{ idempotent: true }`.
- **Plan and review**: `docs/native-app/`.

## Firestore Schema

```
users/{userId}                       # Admins only. Created by hand in the Console.
  - email: string
  - role: 'user' | 'admin'
  - createdAt: timestamp
  - updatedAt: timestamp

projects/{projectId}                 # One shoot / one client
  - name, clientName, clientEmail: string
  - shootingDate: timestamp
  - shootingLocation, description: string
  - status: 'active' | 'delivered' | 'archived'
  - coverImageUrl: string
  - imageCount: number
  - createdBy: string                # admin uid
  - createdAt, updatedAt: timestamp

images/{imageId}
  - projectId: string
  - url: string                      # getDownloadURL of the original (token-bearing)
  - storagePath: string              # images/{adminUid}/{filename}
  - title: string                    # original filename without extension
  - description: string
  - userId: string                   # uid of the admin who uploaded it
  - likeCount: number
  - size: number                     # bytes of the original
  - thumbnails: { small: string, medium: string, large?: string }  # WebP download URLs
                                     # large is the 1920px the lightbox shows. Images
                                     # uploaded before 2026-09-06 do not have it; the web
                                     # falls back to /api/image for those. Backfill with
                                     # scripts/backfill-large-thumbnails.mjs
  - thumbnailPaths: string[]         # thumbnails/{adminUid}/{filename}_{width}.webp
  - createdAt, updatedAt: timestamp

invitations/{token}                  # The document ID IS the invitation token (nanoid, 21 chars)
  - token: string                    # same value as the document ID
  - projectId: string
  - clientName, clientEmail: string
  - createdBy: string                # admin uid
  - imageIds: string[]               # the selection this client may see
  - expiresAt: timestamp
  - viewingDays: number              # viewing window from createdAt; default 7
  - isActive: boolean
  - accessCount: number
  - lastAccessedAt: timestamp
  - createdAt, updatedAt: timestamp

sessions/{anonymousUid}              # One per browser/WebView, rewritten when another link opens
  - invitationId: string             # which invitation this UID is currently viewing
  - anonymousUid: string
  - createdAt, lastAccessedAt: timestamp

likes/{invitationId}_{imageId}       # Keyed by INVITATION, not by UID, so the browser and the
  - invitationId: string             # native app share one selection for the same link
  - imageId: string
  - userId: string                   # last anonymous UID to touch it; audit only
  - createdAt: timestamp
```

## Storage Structure

```
/images/{adminUid}/{timestamp}-{random}                  # Originals, as uploaded
/thumbnails/{adminUid}/{timestamp}-{random}_{width}.webp # 384 (small), 640 (medium), 1920 (large)
```

The `{adminUid}` segment is the uid of the admin who uploaded the file, not the viewer's.
Images are served through the `getDownloadURL` token in `images/{imageId}.url`, which bypasses
Storage rules entirely — the `read` rule only governs SDK access.

The `{width}` in a thumbnail path is the **nominal** size (384 / 640 / 1920), not the pixel width
actually written. An original narrower than 1920 produces a smaller file under the `_1920` name.
Naming by real pixels would put `medium` and `large` on the same path for small originals, and the
two uploads (different quality) would overwrite each other.

**Every upload must set `cacheControl`.** Cloud Storage serves objects with `private, max-age=0`
when the metadata omits it, so the browser re-validates every thumbnail on each gallery visit.
`admin/src/services/imageService.ts` sets `public, max-age=31536000, immutable`; this is safe
because filenames are `${Date.now()}-${random}` and an object's bytes never change in place.
Objects uploaded before 2026-09-06 still carry the default and need a one-off
`gsutil setmeta -r -h "Cache-Control:public, max-age=31536000, immutable"` over the bucket.

## Quick Start

1. Enable Firebase services in console:
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/firestore (Create database, asia-northeast1)
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/storage (Get started)
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/authentication
     — enable **both** Email/Password (admins) and **Anonymous** (gallery visitors)

2. Deploy rules and indexes, and apply Storage CORS:
   ```bash
   firebase deploy --only firestore:rules,storage:rules,firestore:indexes
   gsutil cors set cors.json gs://photo-gallery-app-20251204.firebasestorage.app
   ```
   Storage uploads are admin-only, so after deploying, upload one image from the admin panel
   to confirm the rules still let the admin through.

3. Create the first admin (see "Creating Admin User" below) — there is no sign-up flow.

4. Start development:
   ```bash
   cd admin && npm install && npm run dev   # http://localhost:3001
   cd web   && npm install && npm run dev   # http://localhost:3002
   ```

## Creating Admin User

There is **no sign-up UI and no working script.** `users.create` is denied for every client
(`firestore.rules`), because anyone can obtain an anonymous session and would otherwise be able
to create their own `users/{uid}` document and promote themselves. `scripts/create-admin.mjs`
is kept for reference only and fails on the `setDoc` step.

Create admins by hand in the Firebase Console:

1. **Authentication → Users → Add user**: enter the email and password. Copy the generated UID.
2. **Firestore → Data → `users` collection → Add document**, with the copied UID as the
   **document ID** and these fields:
   - `email` (string) — the same address
   - `role` (string) — `admin`
   - `createdAt` (timestamp) — now
3. Sign in at `/` on the admin panel. `AuthContext` reads `users/{uid}` and rejects anyone
   whose `role` is not `admin`.

Repeat the same two steps for every additional admin. `userService.updateUserRole` exists but is
not wired to any screen — `/admin/users` only lists and deletes — so promotion is a Console edit
too. Only admins may write `users`.

## Security Rules

Every statement below is pinned by a test in `/rules-tests`. Change the rules and the tests
together.

### Firestore Rules (`firestore.rules`)
- **users**: `get` own or admin; `list` admin only; `create` denied outright; `update`/`delete`
  admin only.
- **projects**: admin only, all operations.
- **images**: `get` any authenticated user (the gallery fetches by ID); `list` admin only;
  `create`/`delete` admin only. `update` is admin, or a visitor changing **only** `likeCount`
  by exactly ±1 on an image that belongs to their session's still-valid invitation.
- **invitations**: `get` admin, or any authenticated user when `isActive` **and** not past
  `expiresAt`; `list` admin only (this is what keeps tokens from being harvested);
  `create`/`delete` admin only. Non-admin `update` may only bump `accessCount` by +1 and set
  `lastAccessedAt` to the server timestamp, on the invitation their own session points at.
- **sessions**: read/write own document only. `create` and any change of `invitationId` require
  the target invitation to be active and unexpired. `delete` admin only.
- **likes**: `get` any authenticated user; `list`/`create`/`delete` are scoped to the still-valid
  invitation the caller's session points at, and `create` additionally requires the `imageId` to
  be in that invitation's `imageIds` and the document ID to be `{invitationId}_{imageId}`.
  Admins may `list` and `delete` across invitations.
- The viewing window (`createdAt + viewingDays`) is **not** enforced by the rules — rules cannot
  add days to a timestamp. It is enforced by `web/src/utils/viewingWindow.ts` and by
  `/api/native/manifest`. `expiresAt` is the hard, server-enforced limit.

### Storage Rules (`storage.rules`)
- `read` on `/images` and `/thumbnails` requires authentication. Real delivery uses the
  `getDownloadURL` token in the image document, which does not go through these rules.
- `create` requires **admin** (`firestore.get()` on `users/{uid}.role`, a cross-service lookup),
  the path's uid segment to match the caller, an `image/*` content type, and < 50MB.
- `delete` requires admin — any admin, not just the uploader, so that deleting someone else's
  project does not orphan Storage files.
- There are no other paths. Anything outside `/images` and `/thumbnails` is denied.

## Authentication Flow

- **Client Gallery (`/web`)**: anonymous Firebase Auth, started on gallery open. The invitation
  token in the URL is the real credential; the anonymous UID only keys the `sessions` document.
- **Native Shell (`/mobile`)**: **no Firebase Auth at all.** It is a WebView around `/web`, so
  the web page holds the session. The app only receives image URLs (via
  `/api/native/manifest`) and writes them to the photo library.
- **Admin**: Firebase Auth (email/password), requires `role: 'admin'` in `users/{uid}`.
- **Session**: managed by the Firebase SDK (auto token refresh).
