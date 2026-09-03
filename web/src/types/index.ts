export interface Image {
  id: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  userId: string;
  likeCount: number;
  /**
   * 原本のバイト数。アップロード時に保存する（admin 側）。
   * 2026-09 より前にアップロードした画像には無いため任意項目。
   * ネイティブの一括保存が空き容量を判定するのに使う。
   */
  size?: number;
  thumbnails?: {
    small: string;
    medium: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Invitation {
  id: string;
  token: string;
  clientName: string;
  clientEmail?: string;
  createdBy: string;
  imageIds: string[];
  expiresAt: Date;
  isActive: boolean;
  accessCount: number;
  lastAccessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** 作成日からの閲覧可能日数。未設定なら 7 日（utils/viewingWindow.ts） */
  viewingDays?: number;
}

export interface Session {
  invitationId: string;
  anonymousUid: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface Like {
  userId: string;
  imageId: string;
  createdAt: Date;
}
