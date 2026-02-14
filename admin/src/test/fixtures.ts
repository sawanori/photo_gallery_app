// 実際のFirestoreドキュメント形状を再現
export const createMockDocSnapshot = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () =>
    data
      ? {
          ...data,
          createdAt: data.createdAt ?? { toDate: () => new Date('2025-01-01') },
          updatedAt: data.updatedAt ?? { toDate: () => new Date('2025-01-01') },
        }
      : undefined,
  ref: { id },
});

export const createMockQuerySnapshot = (docs: Array<{ id: string; data: Record<string, unknown> }>) => ({
  empty: docs.length === 0,
  size: docs.length,
  docs: docs.map((d) => createMockDocSnapshot(d.id, d.data)),
});

export const sampleProject = {
  id: 'project-1',
  name: '田中様 結婚式',
  clientName: '田中太郎',
  clientEmail: 'tanaka@example.com',
  shootingDate: new Date('2025-06-15'),
  shootingLocation: '東京',
  description: '結婚式の撮影',
  status: 'active' as const,
  imageCount: 5,
  createdBy: 'admin-uid',
};

export const sampleImage = {
  id: 'image-1',
  projectId: 'project-1',
  url: 'https://example.com/img.jpg',
  storagePath: 'images/admin-uid/12345-abc',
  title: 'サンプル画像',
  description: '',
  userId: 'admin-uid',
  likeCount: 0,
};

export const sampleInvitation = {
  id: 'invitation-1',
  token: 'abc123def456ghi789012',
  projectId: 'project-1',
  clientName: '田中太郎',
  clientEmail: 'tanaka@example.com',
  createdBy: 'admin-uid',
  imageIds: ['image-1'],
  expiresAt: new Date('2025-12-31'),
  isActive: true,
  accessCount: 0,
};
