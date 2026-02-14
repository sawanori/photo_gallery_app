'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGallery } from '@/contexts/GalleryContext';
import {
  getInvitationByToken,
  validateInvitation,
  createSession,
  getSession,
  updateInvitationAccess,
  updateSessionAccess,
} from '@/services/invitationService';
import { getImagesByIds } from '@/services/imageService';
import { getLikedImageIds } from '@/services/likeService';

interface UseInvitationResult {
  isLoading: boolean;
  error: string | null;
  isValid: boolean;
}

export function useInvitation(token: string): UseInvitationResult {
  const { user, isLoading: authLoading, signIn } = useAuth();
  const { setInvitation, setImages, setLikedIds } = useGallery();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const initializeGallery = useCallback(async () => {
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
        setError('招待リンクが見つかりません。');
        setIsValid(false);
        return;
      }

      // 3. Validate invitation
      const validation = validateInvitation(invitation);
      if (!validation.valid) {
        setError(validation.reason || '無効なリンクです。');
        setIsValid(false);
        setInvitation(invitation);
        return;
      }

      // 4. Create or update session
      const existingSession = await getSession(currentUser.uid);
      if (!existingSession) {
        await createSession(currentUser.uid, invitation.id);
        await updateInvitationAccess(invitation.id);
      } else {
        await updateSessionAccess(currentUser.uid);
      }

      // 5. Store token in localStorage for session recovery
      localStorage.setItem('gallery_token', token);

      // 6 & 7. Fetch images and liked status in parallel (async-parallel)
      const [images, likedImageIds] = await Promise.all([
        getImagesByIds(invitation.imageIds),
        getLikedImageIds(currentUser.uid),
      ]);
      const likedSet = new Set(likedImageIds.filter((id) => invitation.imageIds.includes(id)));

      // 8. Update context
      setInvitation(invitation);
      setImages(images);
      setLikedIds(likedSet);
      setIsValid(true);
    } catch (err) {
      console.error('Failed to initialize gallery:', err);
      setError('ギャラリーの読み込みに失敗しました。');
      setIsValid(false);
    } finally {
      setIsLoading(false);
    }
  }, [token, user, signIn, setInvitation, setImages, setLikedIds]);

  useEffect(() => {
    if (!authLoading) {
      initializeGallery();
    }
  }, [authLoading, initializeGallery]);

  return { isLoading: isLoading || authLoading, error, isValid };
}
