import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleInvitation } from '../../test/fixtures';

// --- Firebase モック ---
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockFirestore.collection(...args),
  doc: (...args: unknown[]) => mockFirestore.doc(...args),
  addDoc: (...args: unknown[]) => mockFirestore.addDoc(...args),
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
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
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

      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
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
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
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

    it('isActive=true, accessCount=0で初期化する', async () => {
      const mockDocRef = { id: 'new-invitation-id' };
      mockFirestore.collection.mockReturnValue('invitations-collection');
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
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

      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
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
