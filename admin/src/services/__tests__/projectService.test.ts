import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleProject, sampleImage, sampleInvitation } from '../../test/fixtures';

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
  Timestamp: mockFirestore.Timestamp,
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
}));

// imageServiceとinvitationServiceをモック
const mockGetImagesByProject = vi.fn();
const mockDeleteImage = vi.fn();
const mockGetInvitationsByProject = vi.fn();
const mockDeleteInvitation = vi.fn();

vi.mock('../imageService', () => ({
  getImagesByProject: (...args: unknown[]) => mockGetImagesByProject(...args),
  deleteImage: (...args: unknown[]) => mockDeleteImage(...args),
}));

vi.mock('../invitationService', () => ({
  getInvitationsByProject: (...args: unknown[]) => mockGetInvitationsByProject(...args),
  deleteInvitation: (...args: unknown[]) => mockDeleteInvitation(...args),
}));

let projectService: typeof import('../projectService');

beforeEach(async () => {
  vi.clearAllMocks();
  projectService = await import('../projectService');
});

describe('projectService', () => {
  describe('createProject', () => {
    it('Firestoreにドキュメントを作成する', async () => {
      const mockDocRef = { id: 'new-project-id' };
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-project-id', {
          ...sampleProject,
          shootingDate: { toDate: () => new Date('2025-06-15') },
        })
      );

      await projectService.createProject({
        name: '田中様 結婚式',
        clientName: '田中太郎',
        createdBy: 'admin-uid',
      });

      expect(mockFirestore.addDoc).toHaveBeenCalled();
    });

    it('status=active, imageCount=0で初期化する', async () => {
      const mockDocRef = { id: 'new-project-id' };
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-project-id', {
          ...sampleProject,
          status: 'active',
          imageCount: 0,
          shootingDate: { toDate: () => new Date('2025-06-15') },
        })
      );

      await projectService.createProject({
        name: '田中様 結婚式',
        clientName: '田中太郎',
        createdBy: 'admin-uid',
      });

      expect(mockFirestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'active',
          imageCount: 0,
        })
      );
    });

    it('作成したProjectオブジェクトを返す', async () => {
      const mockDocRef = { id: 'new-project-id' };
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.addDoc.mockResolvedValue(mockDocRef);
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-project-id', {
          name: '田中様 結婚式',
          clientName: '田中太郎',
          status: 'active',
          imageCount: 0,
          createdBy: 'admin-uid',
          shootingDate: { toDate: () => new Date('2025-06-15') },
        })
      );

      const result = await projectService.createProject({
        name: '田中様 結婚式',
        clientName: '田中太郎',
        createdBy: 'admin-uid',
        shootingDate: new Date('2025-06-15'),
      });

      expect(result.id).toBe('new-project-id');
      expect(result.name).toBe('田中様 結婚式');
    });
  });

  describe('getProjects', () => {
    it('全プロジェクトをcreatedAt降順で返す', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'project-1',
            data: {
              ...sampleProject,
              shootingDate: { toDate: () => new Date('2025-06-15') },
            },
          },
          {
            id: 'project-2',
            data: {
              ...sampleProject,
              name: '鈴木様 七五三',
              shootingDate: { toDate: () => new Date('2025-07-01') },
            },
          },
        ])
      );

      const result = await projectService.getProjects();

      expect(mockFirestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(result).toHaveLength(2);
    });

    it('statusでフィルタできる', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'project-1',
            data: {
              ...sampleProject,
              status: 'active',
              shootingDate: { toDate: () => new Date('2025-06-15') },
            },
          },
        ])
      );

      await projectService.getProjects('active');

      expect(mockFirestore.where).toHaveBeenCalledWith('status', '==', 'active');
    });

    it('空の結果で空配列を返す', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('projects-collection');
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot([]));

      const result = await projectService.getProjects();

      expect(result).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('指定IDのプロジェクトを返す', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('project-1', {
          ...sampleProject,
          shootingDate: { toDate: () => new Date('2025-06-15') },
        })
      );

      const result = await projectService.getProject('project-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('project-1');
      expect(result!.name).toBe('田中様 結婚式');
    });

    it('存在しない場合nullを返す', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDoc.mockResolvedValue(createMockDocSnapshot('nonexistent', null));

      const result = await projectService.getProject('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('指定フィールドのみ更新する', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);

      await projectService.updateProject('project-1', { name: '新しい名前' });

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ name: '新しい名前' })
      );
    });

    it('updatedAtが自動更新される', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);

      await projectService.updateProject('project-1', { name: '新しい名前' });

      expect(mockFirestore.updateDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ updatedAt: expect.anything() })
      );
    });
  });

  describe('deleteProject（カスケード）', () => {
    it('getImagesByProjectで全画像を取得する', async () => {
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await projectService.deleteProject('project-1');

      expect(mockGetImagesByProject).toHaveBeenCalledWith('project-1');
    });

    it('各画像のdeleteImageを呼び出す', async () => {
      mockGetImagesByProject.mockResolvedValue([
        { ...sampleImage, id: 'image-1' },
        { ...sampleImage, id: 'image-2' },
      ]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockDeleteImage.mockResolvedValue(undefined);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await projectService.deleteProject('project-1');

      expect(mockDeleteImage).toHaveBeenCalledWith('image-1');
      expect(mockDeleteImage).toHaveBeenCalledWith('image-2');
    });

    it('getInvitationsByProjectで全招待を取得する', async () => {
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await projectService.deleteProject('project-1');

      expect(mockGetInvitationsByProject).toHaveBeenCalledWith('project-1');
    });

    it('各招待のdeleteInvitationを呼び出す', async () => {
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([
        { id: 'invitation-1', ...sampleInvitation },
      ]);
      mockDeleteInvitation.mockResolvedValue(undefined);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await projectService.deleteProject('project-1');

      expect(mockDeleteInvitation).toHaveBeenCalledWith('invitation-1');
    });

    it('プロジェクトドキュメントを削除する', async () => {
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await projectService.deleteProject('project-1');

      expect(mockFirestore.deleteDoc).toHaveBeenCalledWith('doc-ref');
    });
  });

  describe('エラーハンドリング', () => {
    it('name未指定でcreateProject時にエラーをスローする', async () => {
      await expect(
        projectService.createProject({
          name: '',
          clientName: '田中太郎',
          createdBy: 'admin-uid',
        })
      ).rejects.toThrow();
    });

    it('画像削除が部分失敗してもプロジェクト削除を続行する', async () => {
      mockGetImagesByProject.mockResolvedValue([
        { id: 'image-1', ...sampleImage },
        { id: 'image-2', ...sampleImage },
      ]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockDeleteImage
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      // Should not throw
      await projectService.deleteProject('project-1');

      // Project document should still be deleted
      expect(mockFirestore.deleteDoc).toHaveBeenCalled();
    });
  });

  describe('docToProject', () => {
    it('shootingDateのTimestampをDateに変換する', async () => {
      const shootingDate = new Date('2025-06-15');
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('project-1', {
          ...sampleProject,
          shootingDate: { toDate: () => shootingDate },
        })
      );

      const result = await projectService.getProject('project-1');

      expect(result!.shootingDate).toEqual(shootingDate);
    });

    it('オプショナルフィールドがない場合も動作する', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('project-1', {
          name: '最小プロジェクト',
          clientName: '田中',
          status: 'active',
          imageCount: 0,
          createdBy: 'admin-uid',
        })
      );

      const result = await projectService.getProject('project-1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('最小プロジェクト');
      expect(result!.shootingDate).toBeUndefined();
    });
  });
});
