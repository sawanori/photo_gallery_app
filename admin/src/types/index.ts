// ユーザー関連の型定義
export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  createdAt?: string;
  updatedAt?: string;
}

// 画像関連の型定義
export interface Image {
  id: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  user?: {
    id: string;
    email: string;
  };
  likes?: unknown[];
  views?: number;
  createdAt: string;
  updatedAt: string;
  // 以下は互換性のために残す
  filename?: string;
  filepath?: string;
  mimetype?: string;
  size?: number;
}

// 認証関連の型定義
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  exp: number;
  iat: number;
}

// API レスポンスの型定義
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
}

// ページネーション関連の型定義
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 画像アップロード関連の型定義
export interface ImageUploadRequest {
  file: File;
  title?: string;
  description?: string;
}

export interface ImageUploadResponse {
  id: string;
  filename: string;
  filepath: string;
  url: string;
}