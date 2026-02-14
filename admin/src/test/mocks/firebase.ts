import { vi } from 'vitest';

// Firestore mock transaction object
export const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Firestore mock functions
export const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
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
