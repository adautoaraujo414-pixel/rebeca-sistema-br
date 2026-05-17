import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/soft`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request: injeta token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: trata 401 → logout
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth endpoints
export const authApi = {
  login:  (email, senha) =>
    api.post('/auth/login', { email, senha }).then(r => r.data.dados),
  perfil: () =>
    api.get('/auth/perfil').then(r => r.data.dados),
  logout: () =>
    api.post('/auth/logout').catch(() => {}),
};
