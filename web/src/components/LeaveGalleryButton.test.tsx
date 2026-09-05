import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * アプリでギャラリーから出る導線。
 *
 * アプリは一度開いたトークンを iOS のキーチェーンに残し、起動のたびに
 * そのギャラリーへ直行する。出口が無いため、別の案件のリンクを持たない
 * 利用者は入口画面へ戻れず、アプリを削除しても状態が残る。
 *
 * UI は web に置く（アプリは UI を持たない方針）。したがって、
 * **ブラウザで開いているときは何も描かないこと**がこの部品の要件になる。
 */

vi.mock('../contexts/GalleryContext', () => ({
  useGallery: () => ({
    invitation: { id: 'inv1', token: 'tok-123', clientName: 'テスト' },
  }),
}));

import { BRIDGE_VERSION, type NativeCapabilities } from '../lib/nativeBridge';
import LeaveGalleryButton from './LeaveGalleryButton';

const REAL_UA = navigator.userAgent;

function injectCapabilities(supports: NativeCapabilities['supports']) {
  window.__NATIVE_GALLERY__ = {
    bridgeVersion: BRIDGE_VERSION,
    supports,
    platform: 'ios',
    appVersion: '1.0.1',
    nonce: 'test-nonce',
  };
}

let postMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  postMessage = vi.fn();
  window.ReactNativeWebView = { postMessage };
});

afterEach(() => {
  delete window.__NATIVE_GALLERY__;
  delete window.ReactNativeWebView;
  Object.defineProperty(navigator, 'userAgent', {
    value: REAL_UA,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('LeaveGalleryButton', () => {
  it('通常のブラウザでは何も描かない', () => {
    delete window.ReactNativeWebView;
    const { container } = render(<LeaveGalleryButton />);
    expect(container).toBeEmptyDOMElement();
  });

  // ストアに出ている 1.0.0 (6) には leaveGallery が無い
  it('leaveGallery を持たない古いアプリでは描かない', () => {
    injectCapabilities(['saveImage', 'saveImages', 'cancelSave', 'openSettings']);
    const { container } = render(<LeaveGalleryButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('対応しているアプリではボタンを出す', () => {
    injectCapabilities(['saveImage', 'leaveGallery']);
    render(<LeaveGalleryButton />);
    expect(screen.getByLabelText('別のギャラリーを開く')).toBeInTheDocument();
  });

  // 押し間違いで見ている写真から放り出されないよう、一段挟む
  it('押しただけでは何も送らず、確認を出す', async () => {
    injectCapabilities(['leaveGallery']);
    render(<LeaveGalleryButton />);

    await userEvent.click(screen.getByLabelText('別のギャラリーを開く'));

    expect(screen.getByText('別のギャラリーを開きますか')).toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('確認してはじめて leaveGallery を送る', async () => {
    injectCapabilities(['leaveGallery']);
    render(<LeaveGalleryButton />);

    await userEvent.click(screen.getByLabelText('別のギャラリーを開く'));
    await userEvent.click(screen.getByRole('button', { name: '開く画面に戻る' }));

    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      v: BRIDGE_VERSION,
      type: 'leaveGallery',
      token: 'tok-123',
      nonce: 'test-nonce',
    });
  });

  it('キャンセルすれば何も送らずに閉じる', async () => {
    injectCapabilities(['leaveGallery']);
    render(<LeaveGalleryButton />);

    await userEvent.click(screen.getByLabelText('別のギャラリーを開く'));
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText('別のギャラリーを開きますか')).not.toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });

  /**
   * 送れなかったときに黙って閉じると、押したのに何も起きなかったように見える。
   * ネイティブが受け取れば画面ごと入口に切り替わるので、この文言は本来出ない。
   */
  it('送信に失敗したらその旨を出す', async () => {
    injectCapabilities(['leaveGallery']);
    postMessage.mockImplementation(() => {
      throw new Error('bridge gone');
    });
    render(<LeaveGalleryButton />);

    await userEvent.click(screen.getByLabelText('別のギャラリーを開く'));
    await userEvent.click(screen.getByRole('button', { name: '開く画面に戻る' }));

    expect(
      screen.getByText('いま操作できませんでした。アプリを開き直してからお試しください。')
    ).toBeInTheDocument();
  });
});
