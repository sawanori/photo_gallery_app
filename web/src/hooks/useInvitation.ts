'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGallery } from '@/contexts/GalleryContext';
import {
  lookupInvitation,
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
import { compareNatural, sortNameFromStoragePath } from '@/utils/naturalSort';
import { notifyInvitationInvalid } from '@/lib/nativeBridge';

/** 通信に失敗したときの文言。無効・期限切れとは区別する。 */
const LOAD_FAILED_MESSAGE = 'ギャラリーの読み込みに失敗しました。';

interface UseInvitationResult {
  isLoading: boolean;
  error: string | null;
  isValid: boolean;
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

        // 0. トークンが無いのは「拒否された」のと同じ扱いにする。
        //    以前は空文字のまま doc(db,'invitations','') に渡して例外になり、
        //    /liked?token= 無しで開くと「読み込みに失敗しました」と出ていた（監査 F13）。
        if (!token) {
          setError(INVALID_INVITATION_MESSAGE);
          setIsValid(false);
          return;
        }

        // 1. Sign in anonymously if not already
        let currentUser = user;
        if (!currentUser) {
          currentUser = await signIn();
        }

        // 2. Fetch invitation by token
        const lookup = await lookupInvitation(token);

        if (lookup.status === 'unavailable') {
          // サーバーに届かなかった。**ネイティブへ無効を通知してはいけない。**
          // 通知すると、電波の悪い場所でアプリを開いただけで
          // 有効なトークンが端末から消える。
          setError(LOAD_FAILED_MESSAGE);
          setIsValid(false);
          return;
        }

        if (lookup.status === 'denied') {
          // サーバーが明示的に拒否した。不存在・無効化・期限切れのいずれかで、
          // クライアントからは区別できない（区別するとトークンの実在が漏れる）。
          // これは確定した無効なので、ネイティブに保存済みトークンを破棄させる。
          notifyInvitationInvalid(token);
          setError(INVALID_INVITATION_MESSAGE);
          setIsValid(false);
          return;
        }

        const invitation = lookup.invitation;

        // 3. Validate invitation
        const validation = validateInvitation(invitation);
        if (!validation.valid) {
          // 閲覧期限は Firestore ルールが見ておらず、端末の時刻で判定している。
          // **キャッシュ由来のデータでは通知しない。** 古い内容で
          // 「期限切れ」と判断して有効なトークンを消さないため。
          if (!lookup.fromCache) {
            notifyInvitationInvalid(token);
          }
          setError(validation.reason || INVALID_INVITATION_MESSAGE);
          setIsValid(false);
          setInvitation(invitation);
          return;
        }

        // 4. Create or update session
        const existingSession = await getSession(currentUser.uid);
        if (!existingSession) {
          await createSession(currentUser.uid, invitation.id);
        } else if (existingSession.invitationId !== invitation.id) {
          // 別の招待を開いた、または招待のドキュメント ID をトークンに移行した後で
          // 古い ID を持ったままのセッション。お気に入りの読み取りは
          // セッションが持つ招待 ID を鍵にするため、ここがずれると読めなくなる。
          try {
            await updateSessionInvitation(currentUser.uid, invitation.id);
          } catch (e) {
            console.warn('Failed to refresh session invitation:', e);
          }
        } else {
          try {
            await updateSessionAccess(currentUser.uid);
          } catch (e) {
            console.warn('Failed to update session access:', e);
          }
        }

        // 5. アクセス回数は**開くたびに**加算する。
        //    以前はセッションが無いときだけ加算していたため、再訪も、同じ匿名 UID で
        //    開いた 2 つ目の招待も数えられず、管理画面の値は「端末あたり最大 1」だった（監査 F5）。
        //    Firestore ルールは「有効なセッションを持つ者が +1 する」ことを要求するので、
        //    **必ずセッションを確保した後に呼ぶ。**
        //    失敗しても閲覧の妨げにはしない（統計が 1 回抜けるだけ）。
        try {
          await updateInvitationAccess(invitation.id);
        } catch (e) {
          console.warn('Failed to update invitation access count:', e);
        }

        // 6. Store token in localStorage for session recovery
        localStorage.setItem('gallery_token', token);

        // 7 & 8. Fetch all image metadata and liked status in parallel
        const [images, likedImageIds] = await Promise.all([
          getImagesByIds(invitation.imageIds),
          // お気に入りは招待に紐づく。匿名 UID ではない。
          // UID を鍵にすると、同じ招待リンクでもブラウザとアプリで別人扱いになり、
          // クライアントがブラウザで選んだお気に入りがアプリで消える。
          getLikedImageIds(invitation.id),
        ]);

        // ファイル名の自然順に並べる。管理画面のアップロード画面と同じ規則。
        // localeCompare をそのまま使うと数字が文字として比較され、
        // DSC_10 が DSC_2 より前に来る。
        images.sort((a, b) =>
          compareNatural(
            sortNameFromStoragePath(a.storagePath),
            sortNameFromStoragePath(b.storagePath)
          )
        );

        const likedSet = new Set(likedImageIds.filter((id) => invitation.imageIds.includes(id)));

        // 9. Update context
        setInvitation(invitation);
        setAllImages(images);
        setLikedIds(likedSet);
        setIsValid(true);
      } catch (err) {
        // ここに来るのは招待の解決より後（画像の取得など）の失敗。
        // 招待そのものが無効だったわけではないので、**通知はしない。**
        console.error('Failed to initialize gallery:', err);
        setError(LOAD_FAILED_MESSAGE);
        setIsValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeGallery();
  }, [authLoading, user, token, signIn, setInvitation, setAllImages, setLikedIds]);

  return { isLoading: isLoading || authLoading, error, isValid };
}
