# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photo gallery application with Firebase backend:
- **Frontend** (`/front`): React Native mobile app with Expo
- **Admin Panel** (`/admin`): Next.js web dashboard (Port 3001)
- **Backend**: Firebase (Authentication, Firestore, Storage)

## Firebase Project

- **Project ID**: `photo-gallery-app-20251204`
- **Console**: https://console.firebase.google.com/project/photo-gallery-app-20251204

### Firebase Services
- **Authentication**: Email/Password authentication
- **Firestore**: NoSQL database for users, images, likes
- **Storage**: Image file storage
- **Hosting**: Admin panel hosting (optional)

## Development Commands

### Frontend (Expo)
```bash
cd front
npm start                      # Expo dev server
npm run ios                    # iOS simulator
npm run android                # Android emulator
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
