import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore } from '../../test/mocks/firebase';

// --- Firebase モック ---
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockFirestore.collection(...args),
  doc: (...args: unknown[]) => mockFirestore.doc(...args),
  getDoc: (...args: unknown[]) => mockFirestore.getDoc(...args),
  getDocs: (...args: unknown[]) => mockFirestore.getDocs(...args),
  updateDoc: (...args: unknown[]) => mockFirestore.updateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockFirestore.deleteDoc(...args),
  serverTimestamp: () => mockFirestore.serverTimestamp(),
  getCountFromServer: (...args: unknown[]) => mockFirestore.getCountFromServer(...args),
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
}));

let userService: typeof import('../userService');

/**
 * users のドキュメント。
 *
 * 共有の `createMockDocSnapshot` は createdAt が無いときに既定値を埋めてしまうため、
 * ここでは使わない。**createdAt を本当に持たないドキュメント**を再現するのが要点。
 */
const userDoc = (
  id: string,
  data: Record<string, unknown>
): { id: string; data: () => Record<string, unknown> } => ({
  id,
  data: () => data,
});

const dated = (id: string, email: string, createdAt: Date) =>
  userDoc(id, {
    email,
    role: 'user',
    createdAt: { toDate: () => createdAt },
    updatedAt: { toDate: () => new Date('2026-01-01') },
  });

const querySnapshot = (docs: Array<ReturnType<typeof userDoc>>) => ({
  empty: docs.length === 0,
  size: docs.length,
  docs,
});

beforeEach(async () => {
  vi.clearAllMocks();
  mockFirestore.collection.mockReturnValue('users-collection');
  userService = await import('../userService');
});

describe('userService', () => {
  describe('getUsers', () => {
    /**
     * Firestore の orderBy はその項目を持たないドキュメントを結果から丸ごと落とす。
     * Console で手作りした管理者（createdAt 無し）が一覧に出てこなかった。
     */
    it('orderBy を使わない（createdAt が無いドキュメントを落とさないため）', async () => {
      mockFirestore.getDocs.mockResolvedValue(querySnapshot([]));

      await userService.getUsers();

      expect(mockFirestore.getDocs).toHaveBeenCalledWith('users-collection');
      expect(mockFirestore.orderBy).not.toHaveBeenCalled();
      expect(mockFirestore.query).not.toHaveBeenCalled();
    });

    it('createdAt の降順に並べる', async () => {
      mockFirestore.getDocs.mockResolvedValue(
        querySnapshot([
          dated('old', 'old@example.com', new Date('2026-01-01')),
          dated('new', 'new@example.com', new Date('2026-03-01')),
          dated('mid', 'mid@example.com', new Date('2026-02-01')),
        ])
      );

      const result = await userService.getUsers();

      expect(result.map((u) => u.id)).toEqual(['new', 'mid', 'old']);
    });

    it('createdAt が無いユーザーも落とさず、末尾に置く', async () => {
      mockFirestore.getDocs.mockResolvedValue(
        querySnapshot([
          // Console で手作りした管理者。createdAt を書き忘れている。
          userDoc('no-date', { email: 'console-admin@example.com', role: 'admin' }),
          dated('dated', 'dated@example.com', new Date('2026-01-01')),
        ])
      );

      const result = await userService.getUsers();

      expect(result.map((u) => u.id)).toEqual(['dated', 'no-date']);
      expect(result[1].createdAt).toBeUndefined();
    });
  });

  describe('getDashboardStats', () => {
    it('管理者の数を数える', async () => {
      mockFirestore.getDocs.mockResolvedValue(
        querySnapshot([
          userDoc('admin-1', { email: 'a@example.com', role: 'admin' }),
          userDoc('user-1', { email: 'b@example.com', role: 'user' }),
        ])
      );

      await expect(userService.getDashboardStats()).resolves.toEqual({
        totalUsers: 2,
        totalAdmins: 1,
      });
    });
  });
});
