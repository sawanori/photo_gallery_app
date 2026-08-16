import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/downloadService', () => ({
  downloadSingleImage: vi.fn(async () => undefined),
}));

// useNativeSave は招待トークンを GalleryContext から取る。
// DownloadButton 単体のテストなので Provider は張らずに最小の値を返す。
vi.mock('../contexts/GalleryContext', () => ({
  useGallery: () => ({ invitation: { token: 'tok123' } }),
}));

import DownloadButton from './DownloadButton';
import { downloadSingleImage } from '../services/downloadService';
import { BRIDGE_VERSION } from '../lib/nativeBridge';
import type { Image } from '../types';

const IMAGE: Image = {
  id: 'img1',
  url: 'https://firebasestorage.googleapis.com/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fuid%2Fa.jpg?alt=media',
  storagePath: 'images/uid/a.jpg',
  title: 'テスト',
  userId: 'uid',
  likeCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function enterNativeShell() {
  const postMessage = vi.fn();
  window.ReactNativeWebView = { postMessage };
  window.__NATIVE_GALLERY__ = {
    bridgeVersion: BRIDGE_VERSION,
    supports: ['saveImage', 'saveImages', 'cancelSave', 'openSettings'],
    platform: 'ios',
    appVersion: '1.0.0',
    nonce: 'test-nonce',
  };
  return postMessage;
}

describe('DownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete window.__NATIVE_GALLERY__;
    delete window.ReactNativeWebView;
    vi.restoreAllMocks();
  });

  it('ブラウザでは従来のダウンロード処理を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<DownloadButton image={IMAGE} />);

    await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

    expect(downloadSingleImage).toHaveBeenCalledWith(IMAGE);
  });

  it('ネイティブシェル内ではブリッジへ保存を送り、ブラウザ処理を呼ばない', async () => {
    const postMessage = enterNativeShell();
    const user = userEvent.setup();
    render(<DownloadButton image={IMAGE} />);

    await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

    expect(downloadSingleImage).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload.type).toBe('saveImage');
    expect(payload.nonce).toBe('test-nonce');
    expect(payload.token).toBe('tok123');
    expect(payload.imageId).toBe('img1');
    // URL は native に渡さない（認可はサーバーのマニフェスト API が行う）
    expect(JSON.stringify(payload)).not.toContain('firebasestorage');
  });

  // 古いアプリに新しい web が当たったケース。無反応にせずブラウザ挙動へ戻す。
  it('ネイティブが saveImage 未対応ならブラウザ処理にフォールバックする', async () => {
    const postMessage = enterNativeShell();
    window.__NATIVE_GALLERY__!.supports = ['openSettings'];

    const user = userEvent.setup();
    render(<DownloadButton image={IMAGE} />);

    await user.click(screen.getByRole('button', { name: 'ダウンロード' }));

    expect(postMessage).not.toHaveBeenCalled();
    expect(downloadSingleImage).toHaveBeenCalledWith(IMAGE);
  });

  it('マークアップはネイティブ判定で変わらない（hydration 対策）', () => {
    const { container: browserMarkup } = render(<DownloadButton image={IMAGE} />);
    const browserHtml = browserMarkup.innerHTML;

    enterNativeShell();
    const { container: nativeMarkup } = render(<DownloadButton image={IMAGE} />);

    expect(nativeMarkup.innerHTML).toBe(browserHtml);
  });
});
