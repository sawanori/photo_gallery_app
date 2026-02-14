import { Timestamp } from 'firebase/firestore';

export interface Image {
  id: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  userId: string;
  likeCount: number;
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
