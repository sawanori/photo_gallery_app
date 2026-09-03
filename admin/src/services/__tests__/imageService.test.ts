import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore, mockStorage, mockTransaction, mockBatch } from '../../test/mocks/firebase';
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
  writeBatch: (...args: unknown[]) => mockFirestore.writeBatch(...args),
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

    // mobile の一括保存が「1枚 5MB」と推定して 410 枚で誤って弾いていた。
    // 実測値を保存し、web の manifest が bytes として載せる。
    it('原本の bytes を size として保存する', async () => {
      const mockFile = new File(['0123456789'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();

      const result = await imageService.uploadImageFile(
        'project-1', 'admin-uid', mockFile, [], 'テスト'
      );

      expect(mockFirestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ size: mockFile.size })
      );
      expect(result.size).toBe(mockFile.size);
    });
  });

  // --- アップロード途中失敗時の後始末 ---
  // 原本を上げたあとの工程で失敗すると、どの画像ドキュメントからも参照されない
  // ファイルが Storage に残る。画面には「N枚失敗」としか出ないので誰も気付かない。
  describe('uploadImageFile の後始末', () => {
    it('サムネイルのアップロードに失敗したら原本を削除して元の例外を投げ直す', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();
      mockStorage.ref.mockImplementation((_storage: unknown, path: string) => `ref:${path}`);
      mockStorage.uploadBytes.mockImplementation(async (ref: string) =>
        ref.startsWith('ref:thumbnails/')
          ? Promise.reject(new Error('thumb upload failed'))
          : {}
      );
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await expect(
        imageService.uploadImageFile('project-1', 'admin-uid', mockFile, THUMBS, 'テスト')
      ).rejects.toThrow('thumb upload failed');

      // 原本だけが上がっている状態なので、消すのも原本だけ
      expect(mockStorage.deleteObject).toHaveBeenCalledTimes(1);
      expect(mockStorage.deleteObject).toHaveBeenCalledWith(
        expect.stringContaining('ref:images/admin-uid/')
      );
      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
    });

    it('setDoc に失敗したら原本とサムネイルを削除して元の例外を投げ直す', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();
      mockStorage.ref.mockImplementation((_storage: unknown, path: string) => `ref:${path}`);
      mockFirestore.setDoc.mockRejectedValue(new Error('permission-denied'));
      mockStorage.deleteObject.mockResolvedValue(undefined);

      await expect(
        imageService.uploadImageFile('project-1', 'admin-uid', mockFile, THUMBS, 'テスト')
      ).rejects.toThrow('permission-denied');

      // 原本 + サムネイル2枚
      expect(mockStorage.deleteObject).toHaveBeenCalledTimes(3);
    });

    it('後始末に失敗しても元の例外を隠さない', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      setupStorage();
      mockFirestore.setDoc.mockRejectedValue(new Error('permission-denied'));
      mockStorage.deleteObject.mockRejectedValue(new Error('cleanup failed'));

      await expect(
        imageService.uploadImageFile('project-1', 'admin-uid', mockFile, [], 'テスト')
      ).rejects.toThrow('permission-denied');
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
  // 削除の順序は Storage → お気に入り → 画像ドキュメント。
  // 以前は Storage 削除とお気に入り検索がトランザクションのコールバック内にあった。
  // トランザクションは競合すると丸ごと再実行されるため、中に外部への副作用を
  // 置くと Storage の削除が何度も走る。
  const setupDelete = (
    data: Record<string, unknown> = { ...sampleImage, storagePath: 'images/admin-uid/12345-abc' },
    likeIds: string[] = []
  ) => {
    const imageDoc = createMockDocSnapshot('image-1', data);
    mockFirestore.doc.mockReturnValue('doc-ref');
    mockFirestore.getDoc.mockResolvedValue(imageDoc);
    mockFirestore.getDocs.mockResolvedValue(
      createMockQuerySnapshot(likeIds.map((id) => ({ id, data: { imageId: 'image-1' } })))
    );
    mockFirestore.deleteDoc.mockResolvedValue(undefined);
    mockTransaction.get.mockResolvedValue(imageDoc);
    mockStorage.ref.mockReturnValue('storageRef');
    mockStorage.deleteObject.mockResolvedValue(undefined);
    return imageDoc;
  };

  describe('deleteImage', () => {
    it('transaction.deleteで画像ドキュメントを削除する', async () => {
      setupDelete();

      await imageService.deleteImage('image-1');

      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('transaction.updateでプロジェクトのimageCountを-1する', async () => {
      setupDelete({
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

      await imageService.deleteImage('image-1');

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          imageCount: expect.anything(), // increment(-1)
        })
      );
    });

    it('Storageからファイルを削除する', async () => {
      setupDelete();

      await imageService.deleteImage('image-1');

      expect(mockStorage.deleteObject).toHaveBeenCalledWith('storageRef');
    });

    it('サムネイルも削除する', async () => {
      setupDelete({
        ...sampleImage,
        storagePath: 'images/admin-uid/12345-abc',
        thumbnailPaths: [
          'thumbnails/admin-uid/12345-abc_384.webp',
          'thumbnails/admin-uid/12345-abc_640.webp',
        ],
      });

      await imageService.deleteImage('image-1');

      // 原本 + サムネイル2枚
      expect(mockStorage.deleteObject).toHaveBeenCalledTimes(3);
    });

    it('Storageの削除を画像ドキュメントの削除より先に行う', async () => {
      // 逆順にすると storagePath を失い、Storage 削除に失敗したファイルが
      // 永久に孤児として残る。
      setupDelete();

      await imageService.deleteImage('image-1');

      expect(mockStorage.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        mockTransaction.delete.mock.invocationCallOrder[0]
      );
    });

    it('Storage削除とお気に入り検索をトランザクションの外で行う', async () => {
      setupDelete({ ...sampleImage, storagePath: 'images/admin-uid/12345-abc' }, ['like-1']);

      await imageService.deleteImage('image-1');

      const transactionStart = mockFirestore.runTransaction.mock.invocationCallOrder[0];
      for (const order of mockStorage.deleteObject.mock.invocationCallOrder) {
        expect(order).toBeLessThan(transactionStart);
      }
      for (const order of mockFirestore.getDocs.mock.invocationCallOrder) {
        expect(order).toBeLessThan(transactionStart);
      }
    });

    it('画像に紐づくお気に入りを削除する', async () => {
      setupDelete({ ...sampleImage, storagePath: 'images/admin-uid/12345-abc' }, [
        'inv-1_image-1',
        'inv-2_image-1',
      ]);

      await imageService.deleteImage('image-1');

      expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
    });

    it('成功したら deletedCount 1 を返す', async () => {
      setupDelete();

      await expect(imageService.deleteImage('image-1')).resolves.toEqual({
        deletedCount: 1,
        failed: [],
      });
    });

    it('お気に入りの削除に失敗したら例外を投げる', async () => {
      // 2026-08-17 から 2026-08-22 まで、ルールの権限漏れでこれが
      // permission-denied になっていたのに try-catch で握り潰されていた。
      setupDelete({ ...sampleImage, storagePath: 'images/admin-uid/12345-abc' }, ['like-1']);
      mockFirestore.deleteDoc.mockRejectedValue(new Error('permission-denied'));

      await expect(imageService.deleteImage('image-1')).rejects.toThrow('permission-denied');
      expect(mockTransaction.delete).not.toHaveBeenCalled();
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
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDoc.mockResolvedValue(createMockDocSnapshot('nonexistent', null));

      await expect(imageService.deleteImage('nonexistent')).rejects.toThrow();
    });

    it('Storage削除に失敗したら画像ドキュメントを残し、失敗を戻り値で返す', async () => {
      // ドキュメントを消すと storagePath を失い、そのファイルは二度と回収できない。
      // 以前は警告を出すだけで消していたため、孤児が溜まり続けていた。
      setupDelete({
        ...sampleImage,
        storagePath: 'images/admin-uid/12345-abc',
        thumbnailPaths: ['thumbnails/admin-uid/12345-abc_384.webp'],
      });
      mockStorage.deleteObject.mockRejectedValue(new Error('Storage delete failed'));

      const result = await imageService.deleteImage('image-1');

      expect(result).toEqual({
        deletedCount: 0,
        failed: [
          {
            imageId: 'image-1',
            paths: [
              'images/admin-uid/12345-abc',
              'thumbnails/admin-uid/12345-abc_384.webp',
            ],
          },
        ],
      });
      expect(mockTransaction.delete).not.toHaveBeenCalled();
      expect(mockFirestore.deleteDoc).not.toHaveBeenCalled();
    });
  });

  // --- 招待同期 ---
  describe('招待同期（画像削除時）', () => {
    it('削除した画像IDが関連する招待からarrayRemoveで除去される', async () => {
      setupDelete({
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

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
      setupDelete({
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

      mockGetInvitationsByProject.mockRejectedValue(new Error('Firestore error'));

      // Should not throw
      await imageService.deleteImage('image-1');
      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('projectIdがない画像の削除時は同期をスキップする', async () => {
      setupDelete({
        ...sampleImage,
        projectId: undefined,
        storagePath: 'images/admin-uid/12345-abc',
      });

      await imageService.deleteImage('image-1');

      expect(mockGetInvitationsByProject).not.toHaveBeenCalled();
    });
  });

  // --- deleteImagesForProject ---
  // プロジェクトごと消す経路。1枚ずつの deleteImage とは別物である。
  describe('deleteImagesForProject', () => {
    const makeImages = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...sampleImage,
        id: `image-${i}`,
        storagePath: `images/admin-uid/file-${i}`,
        thumbnailPaths: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    const setupBulk = (likeDocs: Array<{ id: string; data: Record<string, unknown> }> = []) => {
      mockFirestore.doc.mockImplementation((_db: unknown, coll: string, id: string) => `${coll}/${id}`);
      mockFirestore.getDocs.mockResolvedValue(createMockQuerySnapshot(likeDocs));
      mockStorage.ref.mockReturnValue('storageRef');
      mockStorage.deleteObject.mockResolvedValue(undefined);
    };

    it('画像ドキュメントをバッチで削除する', async () => {
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(mockBatch.delete).toHaveBeenCalledTimes(3);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('招待同期を呼ばない', async () => {
      // 招待は deleteProject が先に消している。1枚ごとに呼ぶと
      // 700枚で700回の招待取得になり、これが遅さの主因だった。
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(mockGetInvitationsByProject).not.toHaveBeenCalled();
    });

    it('imageCountをまとめて減算する', async () => {
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(mockFirestore.increment).toHaveBeenCalledWith(-3);
      expect(mockBatch.update).toHaveBeenCalledTimes(1);
    });

    it('Storageの削除を画像ドキュメントの削除より先に行う', async () => {
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(mockStorage.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        mockBatch.delete.mock.invocationCallOrder[0]
      );
    });

    it('お気に入りも同じバッチで削除する', async () => {
      setupBulk([
        { id: 'inv-1_image-0', data: { imageId: 'image-0' } },
        { id: 'inv-1_image-1', data: { imageId: 'image-1' } },
      ]);

      await imageService.deleteImagesForProject('project-1', makeImages(3));

      // 画像3件 + お気に入り2件
      expect(mockBatch.delete).toHaveBeenCalledTimes(5);
    });

    it('お気に入りの検索は in で30件ずつまとめる', async () => {
      // 1枚ごとにクエリを投げると700枚で700往復になる。
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(70));

      expect(mockFirestore.getDocs).toHaveBeenCalledTimes(3); // 30 + 30 + 10
    });

    it('操作数が500を超えるとバッチを分ける', async () => {
      // 上限はドキュメント数ではなく操作数。1バッチには
      // 画像の削除 499 件 + imageCount の更新 1 件しか入らない。
      setupBulk();

      await imageService.deleteImagesForProject('project-1', makeImages(600));

      expect(mockBatch.commit).toHaveBeenCalledTimes(2);
      expect(mockBatch.delete).toHaveBeenCalledTimes(600);
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
    });

    it('バッチのcommitが失敗したら例外を投げる', async () => {
      setupBulk();
      mockBatch.commit.mockRejectedValue(new Error('permission-denied'));

      await expect(
        imageService.deleteImagesForProject('project-1', makeImages(3))
      ).rejects.toThrow('permission-denied');
    });

    it('お気に入りの検索に失敗したら例外を投げる', async () => {
      // 引けなかった分を黙って飛ばすと、お気に入りだけが孤児として残る。
      mockFirestore.doc.mockReturnValue('doc-ref');
      mockFirestore.getDocs.mockRejectedValue(new Error('permission-denied'));

      await expect(
        imageService.deleteImagesForProject('project-1', makeImages(3))
      ).rejects.toThrow();
      expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    });

    it('Storageの削除に失敗した画像はドキュメントを残す', async () => {
      // 消すと storagePath ごと失われ、ファイルは永久に孤児になる。
      setupBulk();
      mockStorage.deleteObject.mockRejectedValue(new Error('Storage delete failed'));

      const result = await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(mockBatch.delete).not.toHaveBeenCalled();
      expect(mockBatch.commit).not.toHaveBeenCalled();
      expect(result.deletedCount).toBe(0);
      expect(result.failed).toEqual([
        { imageId: 'image-0', paths: ['images/admin-uid/file-0'] },
        { imageId: 'image-1', paths: ['images/admin-uid/file-1'] },
        { imageId: 'image-2', paths: ['images/admin-uid/file-2'] },
      ]);
    });

    it('Storageの削除に成功した画像だけを消し、失敗分は失敗として返す', async () => {
      setupBulk();
      mockStorage.ref.mockImplementation((_storage: unknown, path: string) => path);
      mockStorage.deleteObject.mockImplementation(async (path: string) =>
        path === 'images/admin-uid/file-1'
          ? Promise.reject(new Error('Storage delete failed'))
          : undefined
      );

      const result = await imageService.deleteImagesForProject('project-1', makeImages(3));

      // 3枚のうち成功した2枚だけ消える
      expect(mockBatch.delete).toHaveBeenCalledTimes(2);
      expect(mockFirestore.increment).toHaveBeenCalledWith(-2);
      expect(result.deletedCount).toBe(2);
      expect(result.failed).toEqual([
        { imageId: 'image-1', paths: ['images/admin-uid/file-1'] },
      ]);
    });

    it('すべて成功したら failed は空', async () => {
      setupBulk();

      const result = await imageService.deleteImagesForProject('project-1', makeImages(3));

      expect(result).toEqual({ deletedCount: 3, failed: [] });
    });

    it('進捗を通知する', async () => {
      setupBulk();
      const onProgress = vi.fn();

      await imageService.deleteImagesForProject('project-1', makeImages(3), onProgress);

      expect(onProgress).toHaveBeenLastCalledWith({ completed: 3, total: 3 });
    });

    it('画像が0枚なら何もしない', async () => {
      setupBulk();

      await imageService.deleteImagesForProject('project-1', []);

      expect(mockFirestore.getDocs).not.toHaveBeenCalled();
      expect(mockBatch.commit).not.toHaveBeenCalled();
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
      setupDelete({
        ...sampleImage,
        projectId: 'project-1',
        storagePath: 'images/admin-uid/12345-abc',
      });

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
