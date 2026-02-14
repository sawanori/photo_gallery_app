import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { BACKEND_URL } from '@env';

const API_TIMEOUT = 30000;
const AUTH_TIMEOUT = 60000;

const finalBaseURL = BACKEND_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: finalBaseURL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.url?.includes('/auth/')) {
      config.timeout = AUTH_TIMEOUT;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('accessToken');
      throw new Error('認証エラー: ログインが必要です');
    }

    if (error.code === 'ECONNABORTED') {
      throw new Error('接続タイムアウト: ネットワークを確認してください');
    }

    if (error.message === 'Network Error') {
      throw new Error('ネットワークエラー: インターネット接続を確認してください');
    }

    throw error;
  }
);

export const retryWithExponentialBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: Error = new Error('Max retries exceeded');

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};
