import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { NativeEvent } from '../lib/nativeBridge';
import type { Image } from '../types';

/**
 * ネイティブ保存の見張り。
 *
 * ネイティブが nonce 不一致でメッセージを捨てた、アプリが落ちた、といった場合
 * web には何も返ってこない。それでも `isSaving` を立てたままだったので、
 * ボタンは disabled、モーダルは 0/N のまま**永遠に終わらなかった**（監査 F3）。
 */

const postToNative = vi.fn();
const supportsFeature = vi.fn();
let emit: ((event: NativeEvent) => void) | null = null;

vi.mock('../lib/nativeBridge', () => ({
  postToNative: (...args: unknown[]) => postToNative(...args),
  supportsFeature: (...args: unknown[]) => supportsFeature(...args),
  subscribeToNative: (handler: (event: NativeEvent) => void) => {
    emit = handler;
    return () => {
      emit = null;
    };
  },
}));

vi.mock('../contexts/GalleryContext', () => ({
  useGallery: () => ({ invitation: { id: 'inv1', token: 'tok' } }),
}));

import { useNativeSave } from './useNativeSave';

const image = (id: string) => ({ id, url: `https://x/${id}.jpg` }) as Image;

function lastRequestId(): string {
  const call = postToNative.mock.calls.at(-1)?.[0] as { requestId: string };
  return call.requestId;
}

beforeEach(() => {
  vi.useFakeTimers();
  postToNative.mockReset().mockReturnValue(true);
  supportsFeature.mockReset().mockReturnValue(true);
  emit = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNativeSave / 送信できなかったとき', () => {
  // nonce が無いと postToNative は false を返す。isSaving を立てっぱなしにしない。
  it('postToNative が false なら保存中にしない', () => {
    postToNative.mockReturnValue(false);
    const { result } = renderHook(() => useNativeSave());

    let sent = true;
    act(() => {
      sent = result.current.saveMany([image('a')]);
    });

    expect(sent).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('ネイティブが機能に未対応なら送らない', () => {
    supportsFeature.mockReturnValue(false);
    const { result } = renderHook(() => useNativeSave());

    act(() => {
      result.current.saveMany([image('a')]);
    });

    expect(postToNative).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
  });
});

describe('useNativeSave / watchdog', () => {
  it('60 秒何も届かなければ save_failed にして保存中を解除する', () => {
    const { result } = renderHook(() => useNativeSave());

    act(() => {
      result.current.saveMany([image('a'), image('b')]);
    });
    expect(result.current.isSaving).toBe(true);

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current.isSaving).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.lastResult).toEqual({
      ok: false,
      savedCount: 0,
      failedCount: 2,
      errorCode: 'save_failed',
    });
  });

  it('進捗が届くたびに見張りを張り直す', () => {
    const { result } = renderHook(() => useNativeSave());

    act(() => {
      result.current.saveMany([image('a'), image('b')]);
    });
    const requestId = lastRequestId();

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    act(() => {
      emit?.({ v: 1, type: 'saveProgress', requestId, current: 1, total: 2 });
    });

    // 最初の 60 秒はとうに過ぎているが、進捗で張り直したのでまだ保存中
    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.progress).toEqual({ current: 1, total: 2, percentage: 50 });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastResult?.errorCode).toBe('save_failed');
  });

  it('結果が届いたら見張りを解除する（後から失敗にしない）', () => {
    const { result } = renderHook(() => useNativeSave());

    act(() => {
      result.current.saveMany([image('a')]);
    });
    const requestId = lastRequestId();

    act(() => {
      emit?.({
        v: 1,
        type: 'saveResult',
        requestId,
        ok: true,
        savedCount: 1,
        failedCount: 0,
      });
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastResult).toMatchObject({ ok: true, savedCount: 1 });
  });

  it('別リクエストの結果では解除しない', () => {
    const { result } = renderHook(() => useNativeSave());

    act(() => {
      result.current.saveOne(image('a'));
    });

    act(() => {
      emit?.({
        v: 1,
        type: 'saveResult',
        requestId: 'someone-else',
        ok: true,
        savedCount: 1,
        failedCount: 0,
      });
    });
    expect(result.current.isSaving).toBe(true);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current.lastResult?.errorCode).toBe('save_failed');
  });
});
