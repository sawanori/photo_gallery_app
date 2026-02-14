export interface User {
  id: string;
  email: string;
  role?: string;
}

export interface Image {
  id: string;
  url: string;
  title: string;
  isLiked: boolean;
  width?: number;
  height?: number;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}