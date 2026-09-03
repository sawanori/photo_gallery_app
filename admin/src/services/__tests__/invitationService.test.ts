import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockFirestore } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleInvitation } from '../../test/fixtures';

// --- Firebase モック ---
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockFirestore.collection(...args),
  doc: (...args: unknown[]) => mockFirestore.doc(...args),
  addDoc: (...args: unknown[]) => mockFirestore.addDoc(...args),
  setDoc: (...args: unknown[]) => mockFirestore.setDoc(...args),
  getDoc: (...args: unknown[]) => mockFirestore.getDoc(...args),
  getDocs: (...args: unknown[]) => mockFirestore.getDocs(...args),
  updateDoc: (...args: unknown[]) => mockFirestore.updateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockFirestore.deleteDoc(...args),
  query: (...args: unknown[]) => mockFirestore.query(...args),
  where: (...args: unknown[]) => mockFirestore.where(...args),
  orderBy: (...args: unknown[]) => mockFirestore.orderBy(...args),
  serverTimestamp: () => mockFirestore.serverTimestamp(),
  getCountFromServer: (...args: unknown[]) => mockFirestore.getCountFromServer(...args),
  Timestamp: mockFirestore.Timestamp,
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'abc123def456ghi789012',
  // createInvitation はトークンをドキュメント ID にするため customAlphabet を使う
  customAlphabet: () => () => 'abc123def456ghi789012',
}));

let invitationService: typeof import('../invitationService');

beforeEach(async () => {
  vi.clearAllMocks();
  invitationService = await import('../invitationService');
});

describe('invitationService（projectId対応）', () => {
  describe('createInvitation', () => {
    it('projectIdフィールドを含むドキュメントを作成する', async () => {
      const mockDocRef = { id: 'new-invitation-id' };
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.doc.mockReturnValue(mockDocRef);
      mockFirestore.setDoc.mockResolvedValue(undefined);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-invitation-id', {
          ...sampleInvitation,
          projectId: 'project-1',
          token: 'abc123def456ghi789012',
          expiresAt: { toDate: () => new Date('2025-12-31') },
        })
      );

      await invitationService.createInvitation({
        projectId: 'project-1',
        clientName: '田中太郎',
        createdBy: 'admin-uid',
        imageIds: ['image-1'],
        expiresAt: new Date('2025-12-31'),
      });

      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-1',
          clientName: '田中太郎',
        })
      );
    });

    it('21文字のtokenを生成する', async () => {
      const mockDocRef = { id: 'new-invitation-id' };
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.doc.mockReturnValue(mockDocRef);
      mockFirestore.setDoc.mockResolvedValue(undefined);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-invitation-id', {
          ...sampleInvitation,
          token: 'abc123def456ghi789012',
          expiresAt: { toDate: () => new Date('2025-12-31') },
        })
      );

      const result = await invitationService.createInvitation({
        projectId: 'project-1',
        clientName: 'テスト',
        createdBy: 'admin-uid',
        imageIds: ['image-1'],
        expiresAt: new Date('2025-12-31'),
      });

      expect(result.token).toHaveLength(21);
    });

    // ドキュメント ID をトークンにする設計の回帰防止。
    // ここが addDoc（自動採番）に戻ると web は招待をコレクションクエリでしか引けなくなり、
    // list を許可せざるを得なくなる。list を許可すると匿名認証しただけの第三者が
    // 招待を全件列挙してトークンを平文で収穫できる。
    it('ドキュメントIDにトークンを使う（自動採番しない）', async () => {
      const mockDocRef = { id: 'abc123def456ghi789012' };
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.doc.mockReturnValue(mockDocRef);
      mockFirestore.setDoc.mockResolvedValue(undefined);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('abc123def456ghi789012', {
          ...sampleInvitation,
          token: 'abc123def456ghi789012',
          expiresAt: { toDate: () => new Date('2025-12-31') },
        })
      );

      const result = await invitationService.createInvitation({
        projectId: 'project-1',
        clientName: 'テスト',
        createdBy: 'admin-uid',
        imageIds: ['image-1'],
        expiresAt: new Date('2025-12-31'),
      });

      expect(mockFirestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'invitations',
        'abc123def456ghi789012'
      );
      expect(mockFirestore.addDoc).not.toHaveBeenCalled();
      expect(result.id).toBe(result.token);
    });

    it('isActive=true, accessCount=0で初期化する', async () => {
      const mockDocRef = { id: 'new-invitation-id' };
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.doc.mockReturnValue(mockDocRef);
      mockFirestore.setDoc.mockResolvedValue(undefined);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-invitation-id', {
          ...sampleInvitation,
          expiresAt: { toDate: () => new Date('2025-12-31') },
        })
      );

      await invitationService.createInvitation({
        projectId: 'project-1',
        clientName: 'テスト',
        createdBy: 'admin-uid',
        imageIds: ['image-1'],
        expiresAt: new Date('2025-12-31'),
      });

      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isActive: true,
          accessCount: 0,
        })
      );
    });
  });

  describe('getInvitationsByProject', () => {
    it('where(projectId)でフィルタする', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'invitation-1',
            data: {
              ...sampleInvitation,
              expiresAt: { toDate: () => new Date('2025-12-31') },
            },
          },
        ])
      );

      const result = await invitationService.getInvitationsByProject('project-1');

      expect(mockFirestore.where).toHaveBeenCalledWith('projectId', '==', 'project-1');
      expect(result).toHaveLength(1);
    });

    it('createdAt降順でソートされる', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot([]));

      await invitationService.getInvitationsByProject('project-1');

      expect(mockFirestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('空の結果で空配列を返す', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot([]));

      const result = await invitationService.getInvitationsByProject('project-1');

      expect(result).toEqual([]);
    });
  });

  describe('getActiveInvitationsByProject', () => {
    it('isActive=trueかつ指定projectIdの招待のみ返す', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'invitation-1',
            data: {
              ...sampleInvitation,
              isActive: true,
              expiresAt: { toDate: () => new Date('2025-12-31') },
            },
          },
        ])
      );

      const result = await invitationService.getActiveInvitationsByProject('project-1');

      expect(mockFirestore.where).toHaveBeenCalledWith('projectId', '==', 'project-1');
      expect(mockFirestore.where).toHaveBeenCalledWith('isActive', '==', true);
      expect(result).toHaveLength(1);
    });
  });

  /**
   * 未設定時に `window.location.origin.replace(':3001', ':3002')` へ落としていたため、
   * ポートを持たない本番（Vercel）では置換が効かず、管理画面のドメインを指す
   * 404 のリンクを黙って発行していた。
   */
  describe('getGalleryUrl', () => {
    const originalLocation = window.location;

    const setLocation = (href: string) => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: new URL(href),
      });
    };

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
      vi.unstubAllEnvs();
    });

    it('NEXT_PUBLIC_WEB_URL があればそれを使う', () => {
      vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://gallery.example.com');
      setLocation('https://admin.example.com/admin');

      expect(invitationService.getGalleryUrl('token-1')).toBe(
        'https://gallery.example.com/gallery/token-1'
      );
    });

    it('未設定でも localhost なら 3002 番に読み替える', () => {
      vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
      setLocation('http://localhost:3001/admin');

      expect(invitationService.getGalleryUrl('token-1')).toBe(
        'http://localhost:3002/gallery/token-1'
      );
    });

    it('未設定で localhost 以外なら例外を投げる', () => {
      vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
      setLocation('https://admin.example.com/admin');

      expect(() => invitationService.getGalleryUrl('token-1')).toThrow(
        /NEXT_PUBLIC_WEB_URL/
      );
    });

    it('127.0.0.1 も開発機として扱う', () => {
      vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
      setLocation('http://127.0.0.1:3001/admin');

      expect(invitationService.getGalleryUrl('token-1')).toBe(
        'http://127.0.0.1:3002/gallery/token-1'
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('空のimageIdsで作成時にエラーをスローする', async () => {
      await expect(
        invitationService.createInvitation({
          projectId: 'project-1',
          clientName: 'テスト',
          createdBy: 'admin-uid',
          imageIds: [],
          expiresAt: new Date('2025-12-31'),
        })
      ).rejects.toThrow();
    });
  });
});
