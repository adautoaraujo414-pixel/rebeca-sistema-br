import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/soft';

export const api = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request — injeta token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('rebeca_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Response — trata 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rebeca_token');
      localStorage.removeItem('rebeca_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth API
export const authApi = {
  login:  (dados) => api.post('/auth/login',  dados).then(r => r.data),
  logout: ()      => api.post('/auth/logout').then(r => r.data),
};
