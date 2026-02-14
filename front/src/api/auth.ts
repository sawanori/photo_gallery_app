import { apiClient } from './config';
import { User, AuthTokens, ApiResponse } from '../types';
import * as SecureStore from 'expo-secure-store';

export const authApi = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await apiClient.post<AuthTokens>('/auth/login', {
      email,
      password,
    });
    
    if (response.data.accessToken && response.data.refreshToken) {
      await SecureStore.setItemAsync('accessToken', response.data.accessToken);
      await SecureStore.setItemAsync('refreshToken', response.data.refreshToken);
      console.log('[Auth API] Tokens saved successfully');
      return response.data;
    }
    
    throw new Error('ログインに失敗しました');
  },

  async register(email: string, password: string): Promise<AuthTokens> {
    const response = await apiClient.post<AuthTokens>('/auth/register', {
      email,
      password,
    });
    
    if (response.data.accessToken && response.data.refreshToken) {
      await SecureStore.setItemAsync('accessToken', response.data.accessToken);
      await SecureStore.setItemAsync('refreshToken', response.data.refreshToken);
      return response.data;
    }
    
    throw new Error('登録に失敗しました');
  },

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  },

  async getCurrentUser(): Promise<User> {
    console.log('[Auth API] Getting current user...');
    const response = await apiClient.get<User>('/users/me');
    console.log('[Auth API] User response:', response.data);
    
    if (response.data) {
      return response.data;
    }
    
    throw new Error('ユーザー情報の取得に失敗しました');
  },

  async validateToken(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      console.log('[Auth API] Validating token:', token ? 'Token exists' : 'No token');
      if (!token) return false;
      
      await this.getCurrentUser();
      return true;
    } catch (error) {
      console.error('[Auth API] Token validation error:', error);
      return false;
    }
  },
};