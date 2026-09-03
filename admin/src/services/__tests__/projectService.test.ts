import { describe, it, expect, vi, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import { mockFirestore, mockBatch } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleProject, sampleImage, sampleInvitation } from '../../test/fixtures';
import type { Project, ProjectStatus } from '../projectService';

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
  increment: (n: number) => mockFirestore.increment(n),
  writeBatch: (...args: unknown[]) => mockFirestore.writeBatch(...args),
  Timestamp: mockFirestore.Timestamp,
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
}));

// imageServiceとinvitationServiceをモック
const mockGetImagesByProject = vi.fn();
const mockDeleteImagesForProject = vi.fn();
const mockGetInvitationsByProject = vi.fn();

vi.mock('../imageService', () => ({
  getImagesByProject: (...args: unknown[]) => mockGetImagesByProject(...args),
  deleteImagesForProject: (...args: unknown[]) => mockDeleteImagesForProject(...args),
}));

vi.mock('../invitationService', () => ({
  getInvitationsByProject: (...args: unknown[]) => mockGetInvitationsByProject(...args),
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
    const setupDelete = (
      images: unknown[] = [],
      invitations: unknown[] = [],
      sessions: Array<{ id: string; data: Record<string, unknown> }> = []
    ) => {
      mockGetImagesByProject.mockResolvedValue(images);
      mockGetInvitationsByProject.mockResolvedValue(invitations);
      mockDeleteImagesForProject.mockResolvedValue({
        deletedCount: images.length,
        failed: [],
      });
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);
      // 招待ごとに sessions を where('invitationId','==',id) で引く
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot(sessions));
    };

    it('getImagesByProjectで全画像を取得する', async () => {
      setupDelete();

      await projectService.deleteProject('project-1');

      expect(mockGetImagesByProject).toHaveBeenCalledWith('project-1');
    });

    it('画像はdeleteImagesForProjectにまとめて渡す', async () => {
      // 1枚ずつ deleteImage を呼ぶと、枚数分の招待取得と imageCount 更新が走る。
      // 招待は先に消えているのでどちらも無駄。
      const images = [
        { ...sampleImage, id: 'image-1' },
        { ...sampleImage, id: 'image-2' },
      ];
      setupDelete(images);

      await projectService.deleteProject('project-1');

      expect(mockDeleteImagesForProject).toHaveBeenCalledWith(
        'project-1',
        images,
        undefined
      );
    });

    it('getInvitationsByProjectで全招待を取得する', async () => {
      setupDelete();

      await projectService.deleteProject('project-1');

      expect(mockGetInvitationsByProject).toHaveBeenCalledWith('project-1');
    });

    it('招待をバッチで削除する', async () => {
      setupDelete([], [
        { id: 'invitation-1', ...sampleInvitation },
        { id: 'invitation-2', ...sampleInvitation },
      ]);

      await projectService.deleteProject('project-1');

      expect(mockBatch.delete).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('招待を画像より先に削除する', async () => {
      // 画像を先に消して途中で失敗すると、生きた招待リンクが空のギャラリーを
      // 指したまま残り、クライアントが「写真が消えた」画面を見ることになる。
      setupDelete(
        [{ ...sampleImage, id: 'image-1' }],
        [{ id: 'invitation-1', ...sampleInvitation }]
      );

      await projectService.deleteProject('project-1');

      expect(mockBatch.commit.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeleteImagesForProject.mock.invocationCallOrder[0]
      );
    });

    it('プロジェクトドキュメントを最後に削除する', async () => {
      setupDelete([{ ...sampleImage, id: 'image-1' }]);

      await projectService.deleteProject('project-1');

      expect(mockFirestore.deleteDoc).toHaveBeenCalledWith('doc-ref');
      expect(mockFirestore.deleteDoc.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockDeleteImagesForProject.mock.invocationCallOrder[0]
      );
    });

    it('進捗コールバックを画像削除へ渡す', async () => {
      const onProgress = vi.fn();
      setupDelete([{ ...sampleImage, id: 'image-1' }]);

      await projectService.deleteProject('project-1', onProgress);

      expect(mockDeleteImagesForProject).toHaveBeenCalledWith(
        'project-1',
        expect.anything(),
        onProgress
      );
    });

    // 招待だけ消すと、存在しない招待を指すセッションが残る。
    // そのセッションを持つ端末はルール上お気に入りの読み書きが通らない。
    it('招待に紐づく sessions を同じバッチで削除する', async () => {
      setupDelete(
        [],
        [{ id: 'invitation-1', ...sampleInvitation }],
        [
          { id: 'anon-uid-1', data: { invitationId: 'invitation-1' } },
          { id: 'anon-uid-2', data: { invitationId: 'invitation-1' } },
        ]
      );

      await projectService.deleteProject('project-1');

      expect(mockFirestore.where).toHaveBeenCalledWith(
        'invitationId',
        '==',
        'invitation-1'
      );
      // セッション2件 + 招待1件
      expect(mockBatch.delete).toHaveBeenCalledTimes(3);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('sessions が無ければ招待だけを削除する', async () => {
      setupDelete([], [{ id: 'invitation-1', ...sampleInvitation }]);

      await projectService.deleteProject('project-1');

      expect(mockBatch.delete).toHaveBeenCalledTimes(1);
    });

    // Storage に消し残しがあるのにプロジェクトを消すと、一覧から消えて
    // 再実行の入口が無くなり、課金され続けるファイルだけが残る。
    it('Storage の削除に失敗した画像があればプロジェクトを消さず、結果を返す', async () => {
      setupDelete([{ ...sampleImage, id: 'image-1' }]);
      mockDeleteImagesForProject.mockResolvedValue({
        deletedCount: 0,
        failed: [{ imageId: 'image-1', paths: ['images/admin-uid/12345-abc'] }],
      });

      const result = await projectService.deleteProject('project-1');

      expect(mockFirestore.deleteDoc).not.toHaveBeenCalled();
      expect(result.failed).toHaveLength(1);
    });

    it('すべて成功したらプロジェクトを消し、failed は空で返す', async () => {
      setupDelete([{ ...sampleImage, id: 'image-1' }]);

      const result = await projectService.deleteProject('project-1');

      expect(mockFirestore.deleteDoc).toHaveBeenCalledWith('doc-ref');
      expect(result).toEqual({ deletedCount: 1, failed: [] });
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

    it('画像削除が失敗したらプロジェクトドキュメントを消さない', async () => {
      // 以前は失敗を握り潰してプロジェクトを消していた。その結果、画像だけが
      // 残ったまま一覧から消え、再実行する手段が無くなっていた。
      // 残しておけば管理者がもう一度削除できる。
      mockGetImagesByProject.mockResolvedValue([
        { id: 'image-1', ...sampleImage },
        { id: 'image-2', ...sampleImage },
      ]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockDeleteImagesForProject.mockRejectedValue(new Error('Delete failed'));
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.deleteDoc.mockResolvedValue(undefined);

      await expect(projectService.deleteProject('project-1')).rejects.toThrow('Delete failed');

      expect(mockFirestore.deleteDoc).not.toHaveBeenCalled();
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

  describe('getProjectExpiryInfo', () => {
    const createProjectWithAge = (daysAgo: number, status: ProjectStatus = 'active'): Project => ({
      ...sampleProject,
      status,
      createdAt: dayjs().subtract(daysAgo, 'day').toDate(),
      updatedAt: new Date(),
    });

    it('6日前のプロジェクトは null を返す（警告なし）', () => {
      const project = createProjectWithAge(6);
      expect(projectService.getProjectExpiryInfo(project)).toBeNull();
    });

    it('7日前のプロジェクトは warning を返す', () => {
      const project = createProjectWithAge(7);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
      expect(result!.daysElapsed).toBe(7);
      expect(result!.daysRemaining).toBe(13);
    });

    it('13日前のプロジェクトは warning を返す', () => {
      const project = createProjectWithAge(13);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('warning');
    });

    it('14日前のプロジェクトは danger を返す', () => {
      const project = createProjectWithAge(14);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('danger');
      expect(result!.daysRemaining).toBe(6);
    });

    it('19日前のプロジェクトは danger を返す', () => {
      const project = createProjectWithAge(19);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('danger');
      expect(result!.daysRemaining).toBe(1);
    });

    it('20日前のプロジェクトは expired を返す', () => {
      const project = createProjectWithAge(20);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('expired');
      expect(result!.daysRemaining).toBe(0);
    });

    it('30日前のプロジェクトは expired を返す（daysRemaining は負数）', () => {
      const project = createProjectWithAge(30);
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('expired');
      expect(result!.daysRemaining).toBe(-10);
    });

    it('archived ステータスは null を返す（対象外）', () => {
      const project = createProjectWithAge(25, 'archived');
      expect(projectService.getProjectExpiryInfo(project)).toBeNull();
    });

    it('delivered ステータスは期限管理の対象', () => {
      const project = createProjectWithAge(15, 'delivered');
      const result = projectService.getProjectExpiryInfo(project);
      expect(result!.level).toBe('danger');
    });

    it('createdAt がない場合は null を返す', () => {
      const project = { ...sampleProject, createdAt: undefined as unknown as Date };
      expect(projectService.getProjectExpiryInfo(project)).toBeNull();
    });

    it('作成直後（0日前）のプロジェクトは null を返す', () => {
      const project = createProjectWithAge(0);
      expect(projectService.getProjectExpiryInfo(project)).toBeNull();
    });
  });
});
