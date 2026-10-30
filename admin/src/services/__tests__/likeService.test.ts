import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFirestore } from '../../test/mocks/firebase';

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockFirestore.collection(...args),
  getDocs: (...args: unknown[]) => mockFirestore.getDocs(...args),
  query: (...args: unknown[]) => mockFirestore.query(...args),
  where: (...args: unknown[]) => mockFirestore.where(...args),
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
}));

import { getLikeSummaryByInvitation } from '../likeService';

const like = (imageId: unknown, userId: unknown) => ({ data: () => ({ imageId, userId }) });

describe('getLikeSummaryByInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('招待で絞り、画像ごとの件数と重複を除いた端末数を返す', async () => {
    mockFirestore.getDocs.mockResolvedValue({
      docs: [like('img-1', 'uid-a'), like('img-1', 'uid-b'), like('img-2', 'uid-a')],
    });

    const summary = await getLikeSummaryByInvitation('inv-1');

    expect(mockFirestore.where).toHaveBeenCalledWith('invitationId', '==', 'inv-1');
    expect(summary).toEqual({
      counts: [
        { imageId: 'img-1', count: 2 },
        { imageId: 'img-2', count: 1 },
      ],
      deviceCount: 2,
    });
  });

  it('いいねが無ければ空を返す', async () => {
    mockFirestore.getDocs.mockResolvedValue({ docs: [] });

    await expect(getLikeSummaryByInvitation('inv-1')).resolves.toEqual({
      counts: [],
      deviceCount: 0,
    });
  });

  it('imageId が文字列でない文書は数えない', async () => {
    mockFirestore.getDocs.mockResolvedValue({ docs: [like(123, 'uid-a')] });

    await expect(getLikeSummaryByInvitation('inv-1')).resolves.toEqual({
      counts: [],
      deviceCount: 0,
    });
  });
});
