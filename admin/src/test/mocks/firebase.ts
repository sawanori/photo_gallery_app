import { vi } from 'vitest';

// Firestore mock transaction object
export const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

/**
 * writeBatch が返すバッチ。writeBatch() は毎回この同じオブジェクトを返すので、
 * delete / update の呼び出しは全バッチ分が積み上がる。
 * 「何回コミットされたか」は commit の呼び出し回数で見る。
 */
export const mockBatch = {
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(async () => undefined),
};

// Firestore mock functions
export const mockFirestore = {
  writeBatch: vi.fn(() => mockBatch),
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  increment: vi.fn((n: number) => n),
  getCountFromServer: vi.fn(),
  arrayRemove: vi.fn((val: unknown) => ({ _type: 'arrayRemove', value: val })),
  arrayUnion: vi.fn((...vals: unknown[]) => ({ _type: 'arrayUnion', values: vals })),
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
  // コールバックを実行してトランザクション内ロジックを検証可能にする
  runTransaction: vi.fn(async (_db: unknown, callback: (t: typeof mockTransaction) => Promise<unknown>) => {
    return callback(mockTransaction);
  }),
};

// Storage mock functions
export const mockStorage = {
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(() => 'https://example.com/image.jpg'),
  deleteObject: vi.fn(),
};
