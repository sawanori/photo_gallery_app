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
- **Authentication**: Email/Password authentication
- **Firestore**: NoSQL database for users, images, likes
- **Storage**: Image file storage
- **Hosting**: Admin panel hosting (optional)

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
npm run lint                   # ESLint
```

### Firebase CLI
```bash
firebase deploy --only firestore:rules    # Deploy Firestore rules
firebase deploy --only storage:rules      # Deploy Storage rules
firebase deploy --only hosting            # Deploy Admin panel
firebase deploy                           # Deploy all
```

## Architecture

### Firebase Configuration
- **Config Files**:
  - `firebase.json` - Firebase project config
  - `firestore.rules` - Firestore security rules
  - `storage.rules` - Storage security rules
  - `firestore.indexes.json` - Firestore indexes

### Frontend (`/front`)
- **Firebase Config**: `front/src/config/firebase.ts`
- **Services**: `front/src/services/`
  - `authService.ts` - Authentication (signIn, signUp, signOut)
  - `imageService.ts` - Image CRUD operations
  - `likeService.ts` - Like/unlike functionality
- **Contexts**: `AuthContext` (Firebase Auth state)
- **Screens**: `front/src/screens/` - Login, Images (masonry grid), LikedImages

### Admin Panel (`/admin`)
- **Firebase Config**: `admin/src/lib/firebase.ts`
- **Services**: `admin/src/services/`
  - `authService.ts` - Admin authentication (admin role required)
  - `imageService.ts` - Image management
  - `userService.ts` - User management
- **Contexts**: `admin/src/contexts/AuthContext.tsx`
- **Routes**: `/admin/dashboard`, `/admin/images`, `/admin/users`
- **UI**: Ant Design components

### Native Shell (`/mobile`)

The mobile app deliberately owns **no UI**. It loads the deployed `/web` gallery in a
`react-native-webview` and adds the one thing a browser cannot do on iOS: writing images straight
into the device photo library. Keeping the UI in one place means `/web` changes reach the app
without an app release.

- **Config**: `mobile/app.config.ts` (scheme, universal links, permissions). `mobile/src/config.ts`
  holds the allowed image origins and the batch limits. The gallery origin comes from
  `EXPO_PUBLIC_WEB_ORIGIN`.
- **Bridge**: `mobile/src/bridge/` implements a versioned `postMessage` protocol. The web side lives
  in `web/src/lib/nativeBridge.ts` — **keep the two in sync**; the web deploys instantly while app
  binaries lag, so the web must feature-detect via `supports` and fall back to browser behaviour.
- **Detection is deliberately triple-redundant**: injected `window.__NATIVE_GALLERY__`, a custom
  User-Agent suffix (`PhotoGalleryApp/<version>`), and `window.ReactNativeWebView`. Android's
  `injectedJavaScriptBeforeContentLoaded` is experimental and does not always arrive.
- **Saving**: `mobile/src/save/`. Every URL from the web is re-validated natively (exact origin
  match, Storage path prefix, filename sanitising) before download. Permission is **write-only**
  (`requestPermissionsAsync(true)`), so the app never gains read access to the user's photos.
- **Expo SDK 57 gotchas**: `saveToLibraryAsync` must be imported from `expo-media-library/legacy`
  (the main entry throws at runtime), and `expo-file-system`'s `File.downloadFileAsync` needs an
  explicit `File` destination plus `{ idempotent: true }`.
- **Plan and review**: `docs/native-app/`.

## Firestore Schema

```
users/{userId}
  - email: string
  - role: 'user' | 'admin'
  - createdAt: timestamp
  - updatedAt: timestamp

images/{imageId}
  - url: string
  - storagePath: string
  - title: string
  - description: string
  - userId: string
  - likeCount: number
  - createdAt: timestamp
  - updatedAt: timestamp

likes/{odUserId_imageId}
  - userId: string
  - imageId: string
  - createdAt: timestamp
```

## Storage Structure

```
/images/{userId}/{filename}    # User uploaded images
/profiles/{userId}/{filename}  # Profile images
```

## Quick Start

1. Enable Firebase services in console:
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/firestore (Create database, asia-northeast1)
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/storage (Get started)
   - https://console.firebase.google.com/project/photo-gallery-app-20251204/authentication (Enable Email/Password)

2. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules,storage:rules
   ```

3. Start development:
   ```bash
   # Admin Panel
   cd admin && npm install && npm run dev

   # Mobile App
   cd front && npm install && npm start
   ```

## Creating Admin User

1. Create user via Firebase Console or app signup
2. In Firestore, find user document in `users` collection
3. Change `role` field from `'user'` to `'admin'`

## Security Rules

### Firestore Rules (`firestore.rules`)
- Users can read all users, but only modify their own
- Images are publicly readable, authenticated users can create
- Only image owner or admin can update/delete
- Likes require authentication, users can only manage their own

### Storage Rules (`storage.rules`)
- Images are publicly readable
- Only authenticated users can upload to their own folder
- Max file size: 10MB for images, 5MB for profiles

## Authentication Flow

- **Mobile**: Firebase Auth with AsyncStorage persistence
- **Admin**: Firebase Auth, requires `role: 'admin'` in Firestore user document
- **Session**: Managed by Firebase SDK (auto token refresh)
