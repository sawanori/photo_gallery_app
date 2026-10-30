import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Invitation } from '../types';

/**
 * ギャラリーを開くときの一連の手続き。
 *
 * 監査（2026-09-02）で見つかった 2 点を固定する。
 *   F5  `updateInvitationAccess` をセッションが無いときだけ呼んでいたため、
 *       再訪も、同じ匿名 UID で開いた 2 つ目の招待も数えられず、
 *       管理画面のアクセス回数は「端末あたり最大 1」だった。
 *   F13 token 無しで /liked を開くと `doc(db,'invitations','')` が例外になり、
 *       「読み込みに失敗しました」（＝通信障害の文言）が出ていた。
 *
 * 加えて、`denied`（確定した無効）と `unavailable`（通信障害）で
 * ネイティブへの通知を撃ち分けることも固定する。ここを取り違えると、
 * 電波の悪い場所でアプリを開いただけで有効なトークンが端末から消える。
 */

// vi.mock のファクトリはファイル先頭へ巻き上げられるため、
// 参照する値も vi.hoisted で同じ位置へ持ち上げる。
const {
  signIn,
  lookupInvitation,
  getSession,
  createSession,
  updateSessionInvitation,
  updateSessionAccess,
  updateInvitationAccess,
  notifyInvitationInvalid,
  getImagesByIds,
  getLikedImageIds,
  setLikedIds,
  setLikesStatus,
  INVALID_INVITATION_MESSAGE,
} = vi.hoisted(() => ({
  setLikedIds: vi.fn(),
  setLikesStatus: vi.fn(),
  signIn: vi.fn(),
  lookupInvitation: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSessionInvitation: vi.fn(),
  updateSessionAccess: vi.fn(),
  updateInvitationAccess: vi.fn(),
  notifyInvitationInvalid: vi.fn(),
  getImagesByIds: vi.fn(),
  getLikedImageIds: vi.fn(),
  INVALID_INVITATION_MESSAGE: 'このリンクは無効か、有効期限が切れています。',
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'uid1' }, isLoading: false, signIn }),
}));

vi.mock('../contexts/GalleryContext', () => ({
  useGallery: () => ({
    setInvitation: vi.fn(),
    setAllImages: vi.fn(),
    setLikedIds,
    setLikesStatus,
  }),
}));

vi.mock('../services/invitationService', () => ({
  INVALID_INVITATION_MESSAGE,
  lookupInvitation: (...args: unknown[]) => lookupInvitation(...args),
  validateInvitation: (invitation: Invitation) =>
    invitation.isActive ? { valid: true } : { valid: false, reason: INVALID_INVITATION_MESSAGE },
  getSession: (...args: unknown[]) => getSession(...args),
  createSession: (...args: unknown[]) => createSession(...args),
  updateSessionInvitation: (...args: unknown[]) => updateSessionInvitation(...args),
  updateSessionAccess: (...args: unknown[]) => updateSessionAccess(...args),
  updateInvitationAccess: (...args: unknown[]) => updateInvitationAccess(...args),
}));

vi.mock('../services/imageService', () => ({
  getImagesByIds: (...args: unknown[]) => getImagesByIds(...args),
}));

vi.mock('../services/likeService', () => ({
  getLikedImageIds: (...args: unknown[]) => getLikedImageIds(...args),
}));

vi.mock('../lib/nativeBridge', () => ({
  notifyInvitationInvalid: (...args: unknown[]) => notifyInvitationInvalid(...args),
}));

import { useInvitation } from './useInvitation';

const invitation = {
  id: 'inv1',
  token: 'tok',
  clientName: '田中家',
  createdBy: 'admin',
  imageIds: ['img1'],
  expiresAt: new Date('2099-01-01'),
  isActive: true,
  accessCount: 0,
  createdAt: new Date('2026-08-30'),
  updatedAt: new Date('2026-08-30'),
} as Invitation;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  lookupInvitation.mockResolvedValue({ status: 'found', invitation, fromCache: false });
  getImagesByIds.mockResolvedValue([]);
  getLikedImageIds.mockResolvedValue([]);
  getSession.mockResolvedValue(null);
});

describe('useInvitation / お気に入りの一覧', () => {
  it('招待と匿名 UID を渡して読み、完了してから ready にする', async () => {
    getLikedImageIds.mockResolvedValue(['img1', 'not-in-invitation']);

    renderHook(() => useInvitation('tok'));

    await waitFor(() => expect(setLikesStatus).toHaveBeenLastCalledWith('ready'));
    expect(setLikesStatus).toHaveBeenCalledWith('loading');
    expect(getLikedImageIds).toHaveBeenCalledWith(invitation, 'uid1');
    expect(setLikedIds).toHaveBeenCalledWith(new Set(['img1']));
    expect(setLikedIds.mock.invocationCallOrder[0]).toBeLessThan(
      setLikesStatus.mock.invocationCallOrder.at(-1)!
    );
  });

  it('一覧が届くまで ready にしない（写真は先に表示する）', async () => {
    let resolveLikes: (ids: string[]) => void = () => {};
    getLikedImageIds.mockReturnValue(
      new Promise<string[]>((resolve) => {
        resolveLikes = resolve;
      })
    );

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isValid).toBe(true));

    expect(setLikesStatus).not.toHaveBeenCalledWith('ready');
    resolveLikes([]);
    await waitFor(() => expect(setLikesStatus).toHaveBeenLastCalledWith('ready'));
  });

  it('読み込み失敗は failed にする。空の一覧として扱わず、写真は見られる', async () => {
    getLikedImageIds.mockRejectedValue(new Error('denied'));

    const { result } = renderHook(() => useInvitation('tok'));

    await waitFor(() => expect(setLikesStatus).toHaveBeenLastCalledWith('failed'));
    expect(setLikedIds).not.toHaveBeenCalled();
    expect(result.current.isValid).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('再試行で、セッションの確保から読み直して ready になる', async () => {
    getLikedImageIds.mockRejectedValueOnce(new Error('denied'));
    getLikedImageIds.mockResolvedValue(['img1']);

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(setLikesStatus).toHaveBeenLastCalledWith('failed'));
    getSession.mockClear();

    await act(async () => {
      await result.current.retryLikes();
    });

    expect(getSession).toHaveBeenCalledWith('uid1');
    expect(setLikedIds).toHaveBeenCalledWith(new Set(['img1']));
    expect(setLikesStatus).toHaveBeenLastCalledWith('ready');
  });

  it('再試行も失敗したら failed に戻る', async () => {
    getLikedImageIds.mockRejectedValue(new Error('denied'));

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(setLikesStatus).toHaveBeenLastCalledWith('failed'));

    await act(async () => {
      await result.current.retryLikes();
    });

    expect(setLikesStatus).toHaveBeenLastCalledWith('failed');
  });
});

describe('useInvitation / アクセス回数', () => {
  it('初回はセッションを作ってから加算する', async () => {
    const { result } = renderHook(() => useInvitation('tok'));

    await waitFor(() => expect(result.current.isValid).toBe(true));

    expect(createSession).toHaveBeenCalledWith('uid1', 'inv1');
    expect(updateInvitationAccess).toHaveBeenCalledWith('inv1');
    // ルールが「有効なセッションを持つ者が +1 する」ことを要求するため順序が要る
    expect(createSession.mock.invocationCallOrder[0]).toBeLessThan(
      updateInvitationAccess.mock.invocationCallOrder[0]
    );
  });

  // 以前はここで加算せず、管理画面の値が「端末あたり最大 1」になっていた
  it('再訪（同じ招待のセッションが既にある）でも加算する', async () => {
    getSession.mockResolvedValue({ invitationId: 'inv1', anonymousUid: 'uid1' });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isValid).toBe(true));

    expect(createSession).not.toHaveBeenCalled();
    expect(updateSessionAccess).toHaveBeenCalledWith('uid1');
    expect(updateInvitationAccess).toHaveBeenCalledWith('inv1');
  });

  it('別の招待を開いたら invitationId を貼り替えてから加算する', async () => {
    getSession.mockResolvedValue({ invitationId: 'old-inv', anonymousUid: 'uid1' });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isValid).toBe(true));

    expect(updateSessionInvitation).toHaveBeenCalledWith('uid1', 'inv1');
    expect(updateSessionAccess).not.toHaveBeenCalled();
    expect(updateInvitationAccess).toHaveBeenCalledWith('inv1');
    expect(updateSessionInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      updateInvitationAccess.mock.invocationCallOrder[0]
    );
  });

  it('加算に失敗しても閲覧は続けられる', async () => {
    updateInvitationAccess.mockRejectedValue(new Error('permission-denied'));

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isValid).toBe(true));

    expect(result.current.error).toBeNull();
  });
});

describe('useInvitation / 無効な入り口', () => {
  it('token が空なら denied と同じ扱いにする（通信障害の文言を出さない）', async () => {
    const { result } = renderHook(() => useInvitation(''));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(INVALID_INVITATION_MESSAGE);
    expect(result.current.isValid).toBe(false);
    expect(lookupInvitation).not.toHaveBeenCalled();
    // 破棄させるトークンが無いのでネイティブへは何も送らない
    expect(notifyInvitationInvalid).not.toHaveBeenCalled();
  });

  it('denied ならネイティブに保存済みトークンを破棄させる', async () => {
    lookupInvitation.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(INVALID_INVITATION_MESSAGE);
    expect(notifyInvitationInvalid).toHaveBeenCalledWith('tok');
    expect(createSession).not.toHaveBeenCalled();
    expect(updateInvitationAccess).not.toHaveBeenCalled();
  });

  // 電波の悪い場所でアプリを開いただけで有効なトークンが消えるのを防ぐ
  it('unavailable ではネイティブへ通知しない', async () => {
    lookupInvitation.mockResolvedValue({ status: 'unavailable' });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('ギャラリーの読み込みに失敗しました。');
    expect(notifyInvitationInvalid).not.toHaveBeenCalled();
    expect(updateInvitationAccess).not.toHaveBeenCalled();
  });

  it('期限切れの招待ではセッションも作らず加算もしない', async () => {
    lookupInvitation.mockResolvedValue({
      status: 'found',
      invitation: { ...invitation, isActive: false },
      fromCache: false,
    });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isValid).toBe(false);
    expect(notifyInvitationInvalid).toHaveBeenCalledWith('tok');
    expect(createSession).not.toHaveBeenCalled();
    expect(updateInvitationAccess).not.toHaveBeenCalled();
  });

  it('キャッシュ由来の期限切れではネイティブへ通知しない', async () => {
    lookupInvitation.mockResolvedValue({
      status: 'found',
      invitation: { ...invitation, isActive: false },
      fromCache: true,
    });

    const { result } = renderHook(() => useInvitation('tok'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(notifyInvitationInvalid).not.toHaveBeenCalled();
  });
});
