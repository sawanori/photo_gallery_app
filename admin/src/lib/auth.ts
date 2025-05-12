// src/lib/auth.ts
import { jwtDecode } from 'jwt-decode';

export function saveToken(token: string) {
  localStorage.setItem('accessToken', token);
}

export function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

export function getUserRole(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    const { role } = jwtDecode<{ role: string }>(t);
    return role;
  } catch {
    return null;
  }
}