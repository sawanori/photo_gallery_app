import { apiClient, retryWithExponentialBackoff } from './config';
import { Image, ApiResponse, PaginationResponse } from '../types';

export const imagesApi = {
  async getImages(page: number = 1, limit: number = 20): Promise<PaginationResponse<Image>> {
    const response = await retryWithExponentialBackoff(() =>
      apiClient.get<ApiResponse<Image[]>>('/images', {
        params: { page, limit },
      })
    );
    
    const images = response.data.data || [];
    return {
      data: images,
      page,
      limit,
      total: images.length,
      hasMore: images.length === limit,
    };
  },

  async toggleLike(imageId: string, isLiked: boolean): Promise<void> {
    if (isLiked) {
      await apiClient.delete(`/images/${imageId}/likes`);
    } else {
      await apiClient.post(`/images/${imageId}/likes`);
    }
  },

  async getLikedImages(): Promise<Image[]> {
    const response = await apiClient.get<ApiResponse<Image[]>>('/users/me/likes');
    return response.data.data || [];
  },

  async getShareUrl(imageId: string, platform: 'twitter' | 'facebook'): Promise<string> {
    const response = await apiClient.get<ApiResponse<{ url: string }>>(`/images/${imageId}/share`, {
      params: { platform },
    });
    
    if (response.data.data?.url) {
      return response.data.data.url;
    }
    
    throw new Error('シェアURLの取得に失敗しました');
  },
};