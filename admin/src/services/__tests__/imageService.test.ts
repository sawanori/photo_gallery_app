import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore, mockStorage, mockTransaction } from '../../test/mocks/firebase';
import { createMockDocSnapshot, createMockQuerySnapshot, sampleImage, sampleInvitation } from '../../test/fixtures';

// --- invitationService モック ---
const mockGetInvitationsByProject = vi.fn();
const mockGetActiveInvitationsByProject = vi.fn();

vi.mock('../invitationService', () => ({
  getInvitationsByProject: (...args: unknown[]) => mockGetInvitationsByProject(...args),
  getActiveInvitationsByProject: (...args: unknown[]) => mockGetActiveInvitationsByProject(...args),
}));

// --- Firebase モック ---
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockFirestore.collection(...args),
  doc: (...args: unknown[]) => mockFirestore.doc(...args),
  addDoc: (...args: unknown[]) => mockFirestore.addDoc(...args),
  getDoc: (...args: unknown[]) => mockFirestore.getDoc(...args),
  getDocs: (...args: unknown[]) => mockFirestore.getDocs(...args),
  setDoc: (...args: unknown[]) => mockFirestore.setDoc(...args),
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
  arrayRemove: (...args: unknown[]) => mockFirestore.arrayRemove(...args),
  arrayUnion: (...args: unknown[]) => mockFirestore.arrayUnion(...args),
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
  mockGetInvitationsByProject.mockResolvedValue([]);
  mockGetActiveInvitationsByProject.mockResolvedValue([]);
  imageService = await import('../imageService');
});

describe('imageService（projectId対応）', () => {
  // --- uploadImageFile / assertProjectExists / finalizeUploadBatch ---
  // 以前は uploadImage が1関数で「Storage 保存 + 画像作成 + imageCount 加算 + 招待同期」を
  // すべて行っていた。同じドキュメントへの書き込みが枚数分集中して遅くなるため、
  // 1枚ごとの処理（uploadImageFile）とバッチ単位の処理（finalizeUploadBatch）に分離した。

  const THUMBS = [
    { name: 'small' as const, blob: new Blob(['s']), width: 384 },
    { name: 'medium' as const, blob: new Blob(['m']), width: 640 },
  ];

  const setupStorage = () => {
    mockStorage.ref.mockReturnValue('storageRef');
    mockStorage.uploadBytes.mockResolvedValue({});
    mockStorage.getDownloadURL.mockResolvedValue('https://example.com/image.jpg');
    mockFirestore.collection.mockReturnValue('images-collection');
    mockFirestore.doc.mockReturnValue({ id: 'new-image-id' });
    mockFirestore.setDoc.mockResolvedValue(undefined);
  };

  describe('uploadImageFile', () => {
    it('projectIdフィールドを含むドキュメントを作成する', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      await imageService.uploadImageFile(
        'project-1', 'admin-uid', mockFile, THUMBS, 'テスト画像', '説明'
      );

      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: 'project-1',
          title: 'テスト画像',
          description: '説明',
          userId: 'admin-uid',
          likeCount: 0,
        })
      );
    });

    it('StorageにファイルをアップロードしダウンロードURLを取得する', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();
      mockStorage.getDownloadURL.mockResolvedValue('https://example.com/uploaded.jpg');

      await imageService.uploadImageFile('project-1', 'admin-uid', mockFile, [], 'テスト');

      expect(mockStorage.uploadBytes).toHaveBeenCalledWith('storageRef', mockFile, {
        contentType: 'image/jpeg',
      });
      expect(mockStorage.getDownloadURL).toHaveBeenCalledWith('storageRef');
    });

    it('渡されたサムネイルをアップロードし、自前では生成しない', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      await imageService.uploadImageFile('project-1', 'admin-uid', mockFile, THUMBS, 'テスト');

      // 元画像1 + サムネイル2
      expect(mockStorage.uploadBytes).toHaveBeenCalledTimes(3);
      expect(mockStorage.uploadBytes).toHaveBeenCalledWith(
        'storageRef', THUMBS[0].blob, { contentType: 'image/webp' }
      );
    });

    // 分離の核心。ここで書くと同じドキュメントへの書き込みが枚数分集中する。
    it('projects と invitations には一切書き込まない', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      await imageService.uploadImageFile('project-1', 'admin-uid', mockFile, THUMBS, 'テスト');

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockFirestore.runTransaction).not.toHaveBeenCalled();
      expect(mockGetActiveInvitationsByProject).not.toHaveBeenCalled();
    });

    // 往復削減。書いたばかりのドキュメントを読み直さない。
    it('書き込み直後に getDoc で読み直さない', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      await imageService.uploadImageFile('project-1', 'admin-uid', mockFile, THUMBS, 'テスト');

      expect(mockFirestore.getDoc).not.toHaveBeenCalled();
    });

    it('作成したドキュメントIDを含む Image を返す', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      const result = await imageService.uploadImageFile(
        'project-1', 'admin-uid', mockFile, [], 'テスト'
      );

      expect(result.id).toBe('new-image-id');
      expect(result.projectId).toBe('project-1');
      expect(result.url).toBe('https://example.com/image.jpg');
    });
  });

  describe('assertProjectExists', () => {
    it('プロジェクトが存在すれば何も起きない', async () => {
      mockFirestore.doc.mockReturnValue('project-doc-ref');
      mockFirestore.getDoc.mockResolvedValue(
        createMockDocSnapshot('project-1', { imageCount: 5 })
      );

      await expect(imageService.assertProjectExists('project-1')).resolves.toBeUndefined();
    });

    it('プロジェクトが存在しなければ Project not found を投げる', async () => {
      mockFirestore.doc.mockReturnValue('project-doc-ref');
      mockFirestore.getDoc.mockResolvedValue(createMockDocSnapshot('nope', null));

      await expect(imageService.assertProjectExists('nope')).rejects.toThrow(
        'Project not found'
      );
    });
  });

  describe('finalizeUploadBatch', () => {
    it('imageCount を件数分まとめて1回だけ加算する', async () => {
      mockFirestore.doc.mockReturnValue('project-doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockResolvedValue([]);

      await imageService.finalizeUploadBatch('project-1', ['a', 'b', 'c']);

      expect(mockFirestore.increment).toHaveBeenCalledWith(3);
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(1);
    });

    it('IDが空なら何もしない', async () => {
      await imageService.finalizeUploadBatch('project-1', []);

      expect(mockFirestore.updateDoc).not.toHaveBeenCalled();
      expect(mockGetActiveInvitationsByProject).not.toHaveBeenCalled();
    });

    it('imageCount の更新に失敗しても招待同期は実行し、例外を投げない', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc
        .mockRejectedValueOnce(new Error('count failed'))
        .mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockResolvedValue([
        { ...sampleInvitation, id: 'inv-1' },
      ]);

      await expect(
        imageService.finalizeUploadBatch('project-1', ['a'])
      ).resolves.toBeUndefined();

      expect(mockGetActiveInvitationsByProject).toHaveBeenCalledWith('project-1');
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
        imageService.uploadImageFile('project-1', 'admin-uid', mockFile, [], 'テスト')
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

  // --- 招待同期 ---
  describe('招待同期（画像削除時）', () => {
    it('削除した画像IDが関連する招待からarrayRemoveで除去される', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      mockGetInvitationsByProject.mockResolvedValue([
        { ...sampleInvitation, id: 'inv-1' },
        { ...sampleInvitation, id: 'inv-2' },
      ]);
      mockFirestore.updateDoc.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockGetInvitationsByProject).toHaveBeenCalledWith('project-1');
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(2);
      expect(mockFirestore.arrayRemove).toHaveBeenCalledWith('image-1');
    });

    it('招待同期失敗でもdeleteImage自体は成功する', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      mockGetInvitationsByProject.mockRejectedValue(new Error('Firestore error'));

      // Should not throw
      await imageService.deleteImage('image-1');
      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('projectIdがない画像の削除時は同期をスキップする', async () => {
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        projectId: undefined,
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockGetInvitationsByProject).not.toHaveBeenCalled();
    });
  });

  describe('招待同期（画像アップロード時）', () => {
    // 同期の実行場所は uploadImage から finalizeUploadBatch へ移した。
    // 検証する観点は4つとも維持する:
    //   (1) アクティブ招待に同期される (2) 非アクティブは対象外
    //   (3) 失敗しても呼び出し元は成功扱い (4) 複数招待すべてに反映される
    const setupFinalize = (invitations: unknown[]) => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockResolvedValue(invitations);
    };

    it('アクティブな招待にarrayUnionで画像IDが追加される', async () => {
      setupFinalize([{ ...sampleInvitation, id: 'inv-1' }]);

      await imageService.finalizeUploadBatch('project-1', ['new-image-id']);

      expect(mockGetActiveInvitationsByProject).toHaveBeenCalledWith('project-1');
      expect(mockFirestore.arrayUnion).toHaveBeenCalledWith('new-image-id');
    });

    // 集約の効果。50枚でも招待1件あたり1回の書き込みで済むこと。
    it('複数IDをまとめて1回のarrayUnionで追加する', async () => {
      setupFinalize([{ ...sampleInvitation, id: 'inv-1' }]);
      const ids = Array.from({ length: 50 }, (_, i) => `img-${i}`);

      await imageService.finalizeUploadBatch('project-1', ids);

      expect(mockFirestore.arrayUnion).toHaveBeenCalledTimes(1);
      expect(mockFirestore.arrayUnion).toHaveBeenCalledWith(...ids);
      // imageCount 1回 + 招待1件1回
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(2);
    });

    it('300件を超えるIDは分割して追加する', async () => {
      setupFinalize([{ ...sampleInvitation, id: 'inv-1' }]);
      const ids = Array.from({ length: 700 }, (_, i) => `img-${i}`);

      await imageService.finalizeUploadBatch('project-1', ids);

      // 300 + 300 + 100 の3回
      expect(mockFirestore.arrayUnion).toHaveBeenCalledTimes(3);
    });

    it('複数のアクティブ招待すべてに反映される', async () => {
      setupFinalize([
        { ...sampleInvitation, id: 'inv-1' },
        { ...sampleInvitation, id: 'inv-2' },
      ]);

      await imageService.finalizeUploadBatch('project-1', ['img-a']);

      // imageCount 1回 + 招待2件
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(3);
    });

    it('アクティブな招待がない場合は招待へのupdateDocが呼ばれない', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockResolvedValue([]);

      await imageService.finalizeUploadBatch('project-1', ['img-a']);

      expect(mockGetActiveInvitationsByProject).toHaveBeenCalledWith('project-1');
      // imageCount の1回のみ
      expect(mockFirestore.updateDoc).toHaveBeenCalledTimes(1);
      expect(mockFirestore.arrayUnion).not.toHaveBeenCalled();
    });

    it('招待同期失敗でも finalizeUploadBatch は例外を投げない', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockRejectedValue(new Error('Firestore error'));

      await expect(
        imageService.finalizeUploadBatch('project-1', ['img-a'])
      ).resolves.toBeUndefined();
    });
  });

  describe('招待同期（アクティブ/非アクティブ区別）', () => {
    it('アップロード時はgetActiveInvitationsByProject、削除時はgetInvitationsByProjectが呼ばれる', async () => {
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.updateDoc.mockResolvedValue(undefined);
      mockGetActiveInvitationsByProject.mockResolvedValue([]);

      await imageService.finalizeUploadBatch('project-1', ['img-a']);

      expect(mockGetActiveInvitationsByProject).toHaveBeenCalledWith('project-1');
      expect(mockGetInvitationsByProject).not.toHaveBeenCalled();

      vi.clearAllMocks();
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockGetActiveInvitationsByProject.mockResolvedValue([]);

      // Delete
      const imageDoc = createMockDocSnapshot('image-1', {
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockTransaction.get.mockResolvedValueOnce(imageDoc);
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await imageService.deleteImage('image-1');

      expect(mockGetInvitationsByProject).toHaveBeenCalledWith('project-1');
      expect(mockGetActiveInvitationsByProject).not.toHaveBeenCalled();
    });
  });

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
