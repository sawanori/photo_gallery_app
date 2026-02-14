import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore, mockStorage, mockTransaction } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleImage } from '../../test/fixtures';

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
  limit: (...args: unknown[]) => mockFirestore.limit(...args),
  startAfter: (...args: unknown[]) => mockFirestore.startAfter(...args),
  serverTimestamp: () => mockFirestore.serverTimestamp(),
  increment: (n: number) => mockFirestore.increment(n),
  getCountFromServer: (...args: unknown[]) => mockFirestore.getCountFromServer(...args),
  Timestamp: mockFirestore.Timestamp,
  runTransaction: (...args: unknown[]) => mockFirestore.runTransaction(...args),
  DocumentSnapshot: vi.fn(),
  QueryDocumentSnapshot: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => mockStorage.ref(...args),
  uploadBytes: (...args: unknown[]) => mockStorage.uploadBytes(...args),
  getDownloadURL: (...args: unknown[]) => mockStorage.getDownloadURL(...args),
  deleteObject: (...args: unknown[]) => mockStorage.deleteObject(...args),
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
  storage: {},
}));

// テスト対象をモック後にインポート
let imageService: typeof import('../imageService');

beforeEach(async () => {
  vi.clearAllMocks();
  imageService = await import('../imageService');
});

describe('imageService（projectId対応）', () => {
  // --- uploadImage ---
  describe('uploadImage', () => {
    it('projectIdフィールドを含むドキュメントを作成する', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.uploadBytes.mockResolvedValue({});
      mockStorage.getDownloadURL.mockResolvedValue('https://example.com/image.jpg');

      mockFirestore.collection.mockReturnValue('images-collection');
      mockFirestore.doc.mockReturnValue('project-doc-ref');
      mockTransaction.get.mockResolvedValue(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      );

      // addDoc is no longer used, transaction.set is used instead
      // But we need the function to succeed
      mockFirestore.runTransaction.mockImplementation(async (_db: unknown, callback: (t: typeof mockTransaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      // getDoc after transaction to return created image
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-image-id', {
          projectId: 'project-1',
          url: 'https://example.com/image.jpg',
          storagePath: 'images/admin-uid/12345-abc',
          title: 'テスト画像',
          description: '説明',
          userId: 'admin-uid',
          likeCount: 0,
        })
      );

      await imageService.uploadImage('project-1', 'admin-uid', mockFile, 'テスト画像', '説明');

      // transaction.set が projectId を含むデータで呼ばれたことを確認
      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-1',
          title: 'テスト画像',
          description: '説明',
          userId: 'admin-uid',
        })
      );
    });

    it('StorageにファイルをアップロードしダウンロードURLを取得する', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.uploadBytes.mockResolvedValue({});
      mockStorage.getDownloadURL.mockResolvedValue('https://example.com/uploaded.jpg');
      mockFirestore.collection.mockReturnValue('images-collection');
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValue(
        createMockDocSnapshot('project-1', { imageCount: 0 })
      );
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-image-id', {
          projectId: 'project-1', url: 'https://example.com/uploaded.jpg',
          storagePath: 'images/admin-uid/x', title: 'テスト', userId: 'admin-uid', likeCount: 0,
        })
      );

      await imageService.uploadImage('project-1', 'admin-uid', mockFile, 'テスト');

      expect(mockStorage.uploadBytes).toHaveBeenCalledWith('storageRef', mockFile);
      expect(mockStorage.getDownloadURL).toHaveBeenCalledWith('storageRef');
    });

    it('トランザクション内でimageCountをインクリメントする', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.uploadBytes.mockResolvedValue({});
      mockStorage.getDownloadURL.mockResolvedValue('https://example.com/image.jpg');
      mockFirestore.collection.mockReturnValue('images-collection');
      mockFirestore.doc.mockReturnValue('project-doc-ref');
      mockTransaction.get.mockResolvedValue(
        createMockDocSnapshot('project-1', { imageCount: 3 })
      );
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('new-image-id', {
          projectId: 'project-1', url: 'https://example.com/image.jpg',
          storagePath: 'images/admin-uid/x', title: 'テスト', userId: 'admin-uid', likeCount: 0,
        })
      );

      await imageService.uploadImage('project-1', 'admin-uid', mockFile, 'テスト');

      // transaction.update で imageCount を +1 する
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          imageCount: expect.anything(), // increment(1)
        })
      );
    });
  });

  // --- getImagesByProject ---
  describe('getImagesByProject', () => {
    it('where(projectId)とorderBy(createdAt desc)でクエリする', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('images-collection');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'image-1',
            data: { ...sampleImage, projectId: 'project-1' },
          },
        ])
      );

      const result = await imageService.getImagesByProject('project-1');

      expect(mockFirestore.where).toHaveBeenCalledWith('projectId', '==', 'project-1');
      expect(mockFirestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('image-1');
    });

    it('空の結果で空配列を返す', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('images-collection');
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot([]));

      const result = await imageService.getImagesByProject('project-1');

      expect(result).toEqual([]);
    });
  });

  // --- deleteImage ---
  describe('deleteImage', () => {
    it('transaction.deleteで画像ドキュメントを削除する', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc); // get image
      mockTransaction.get.mockResolvedValueOnce(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      ); // get project
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('transaction.updateでプロジェクトのimageCountを-1する', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockTransaction.get.mockResolvedValueOnce(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      );
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          imageCount: expect.anything(), // increment(-1)
        })
      );
    });

    it('Storageからファイルを削除する', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockTransaction.get.mockResolvedValueOnce(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      );
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockStorage.deleteObject).toHaveBeenCalledWith('storageRef');
    });
  });

  // --- Error Path ---
  describe('エラーハンドリング', () => {
    it('Storage Upload失敗時にエラーをスローする', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.uploadBytes.mockRejectedValue(new Error('Upload failed'));

      await expect(
        imageService.uploadImage('project-1', 'admin-uid', mockFile, 'テスト')
      ).rejects.toThrow('Upload failed');
    });

    it('存在しない画像IDでdeleteImage時にエラーをスローする', async () => {
      const emptyDoc = createMockDocSnapshot('nonexistent', null);
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValue(emptyDoc);

      await expect(imageService.deleteImage('nonexistent')).rejects.toThrow();
    });

    it('Storage削除失敗でもFirestore削除は実行する', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockTransaction.get.mockResolvedValueOnce(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      );
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockRejectedValue(new Error('Storage delete failed'));

      // Should not throw even if storage delete fails
      await imageService.deleteImage('image-1');

      expect(mockTransaction.delete).toHaveBeenCalled();
    });
  });

  // --- docToImage 変換 ---
  describe('docToImage', () => {
    it('Timestamp.toDate()でDate型に変換する', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('images-collection');

      const mockDate = new Date('2025-06-15');
      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([
          {
            id: 'image-1',
            data: {
              ...sampleImage,
              createdAt: { toDate: () => mockDate },
              updatedAt: { toDate: () => mockDate },
            },
          },
        ])
      );

      const result = await imageService.getImagesByProject('project-1');

      expect(result[0].createdAt).toEqual(mockDate);
      expect(result[0].updatedAt).toEqual(mockDate);
    });

    it('オプショナルフィールド（description）がない場合も動作する', async () => {
      mockFirestore.query.mockReturnValue('query-ref');
      mockFirestore.where.mockReturnValue('where-clause');
      mockFirestore.orderBy.mockReturnValue('orderBy-clause');
      mockFirestore.collection.mockReturnValue('images-collection');

      const imageData = { ...sampleImage };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (imageData as any).description;

      mockFirestore.getDocs.mockResolvedValue(
        createMockQuerySnapshot([{ id: 'image-1', data: imageData }])
      );

      const result = await imageService.getImagesByProject('project-1');

      expect(result[0]).toBeDefined();
      expect(result[0].id).toBe('image-1');
    });
  });
});
