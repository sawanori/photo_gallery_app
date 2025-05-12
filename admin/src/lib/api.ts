// src/lib/api.ts
import axios from 'axios';
import { getToken } from './auth';

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  timeout: 10000, // 10秒のタイムアウト
});

// リクエストのデバッグログ
API.interceptors.request.use(request => {
  console.log('Starting Request:', {
    url: request.url,
    method: request.method,
    headers: request.headers,
    data: request.data
  });
  return request;
});

// レスポンスのデバッグログ
API.interceptors.response.use(
  response => {
    console.log('Response:', {
      status: response.status,
      data: response.data
    });
    return response;
  },
  error => {
    console.error('Request Error:', {
      message: error.message,
      config: error.config,
      response: error.response
    });
    return Promise.reject(error);
  }
);

// Authorization ヘッダーも自動で付くように
API.interceptors.request.use(cfg => {
  const token = getToken();
  if (token) cfg.headers!['Authorization'] = `Bearer ${token}`;
  return cfg;
});

export default API;
