'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGallery } from '@/contexts/GalleryContext';
import {
  getInvitationByToken,
  validateInvitation,
  INVALID_INVITATION_MESSAGE,
  createSession,
  getSession,
  updateInvitationAccess,
  updateSessionAccess,
  updateSessionInvitation,
} from '@/services/invitationService';
import { getImagesByIds } from '@/services/imageService';
import { getLikedImageIds } from '@/services/likeService';

interface UseInvitationResult {
  isLoading: boolean;
  error: string | null;
  isValid: boolean;
}

/** Extract filename from storagePath for sorting */
function extractSortName(storagePath: string): string {
  return (storagePath.split('/').pop() || '').toLowerCase();
}

export function useInvitation(token: string): UseInvitationResult {
  const { user, isLoading: authLoading, signIn } = useAuth();
  const { setInvitation, setAllImages, setLikedIds } = useGallery();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (authLoading || initializedRef.current) return;

    const initializeGallery = async () => {
      initializedRef.current = true;
      try {
        setIsLoading(true);
        setError(null);

        // 1. Sign in anonymously if not already
        let currentUser = user;
        if (!currentUser) {
          currentUser = await signIn();
        }

        // 2. Fetch invitation by token
        const invitation = await getInvitationByToken(token);
        if (!invitation) {
          // 「存在しない」と「無効・期限切れ」を区別しない。区別すると
          // トークンが実在するかどうかを第三者に伝えてしまう。
          setError(INVALID_INVITATION_MESSAGE);
          setIsValid(false);
          return;
        }

        // 3. Validate invitation
        const validation = validateInvitation(invitation);
        if (!validation.valid) {
          setError(validation.reason || INVALID_INVITATION_MESSAGE);
          setIsValid(false);
          setInvitation(invitation);
          return;
        }

        // 4. Create or update session
        const existingSession = await getSession(currentUser.uid);
        // 別の招待を開いた、または招待のドキュメント ID をトークンに移行した後で
        // 古い ID を持ったままのセッションは作り直す。お気に入りの読み取りは
        // セッションが持つ招待 ID を鍵にするため、ここがずれると読めなくなる。
        if (existingSession && existingSession.invitationId !== invitation.id) {
          try {
            await updateSessionInvitation(currentUser.uid, invitation.id);
          } catch (e) {
            console.warn('Failed to refresh session invitation:', e);
          }
        }
        if (!existingSession) {
          await createSession(currentUser.uid, invitation.id);
          try {
            await updateInvitationAccess(invitation.id);
          } catch (e) {
            console.warn('Failed to update invitation access count:', e);
          }
        } else {
          try {
            await updateSessionAccess(currentUser.uid);
          } catch (e) {
            console.warn('Failed to update session access:', e);
          }
        }

        // 5. Store token in localStorage for session recovery
        localStorage.setItem('gallery_token', token);

        // 6 & 7. Fetch all image metadata and liked status in parallel
        const [images, likedImageIds] = await Promise.all([
          getImagesByIds(invitation.imageIds),
          // お気に入りは招待に紐づく。匿名 UID ではない。
          // UID を鍵にすると、同じ招待リンクでもブラウザとアプリで別人扱いになり、
          // クライアントがブラウザで選んだお気に入りがアプリで消える。
          getLikedImageIds(invitation.id),
        ]);

        // Sort by filename (storagePath)
        images.sort((a, b) => {
          const nameA = extractSortName(a.storagePath);
          const nameB = extractSortName(b.storagePath);
          return nameA.localeCompare(nameB, 'ja');
        });

        const likedSet = new Set(likedImageIds.filter((id) => invitation.imageIds.includes(id)));

        // 8. Update context
        setInvitation(invitation);
        setAllImages(images);
        setLikedIds(likedSet);
        setIsValid(true);
      } catch (err) {
        console.error('Failed to initialize gallery:', err);
        setError('ギャラリーの読み込みに失敗しました。');
        setIsValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeGallery();
  }, [authLoading, user, token, signIn, setInvitation, setAllImages, setLikedIds]);

  return { isLoading: isLoading || authLoading, error, isValid };
}
