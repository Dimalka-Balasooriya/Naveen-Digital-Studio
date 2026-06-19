import axios from 'axios';

const isLocalBrowser =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const apiBaseUrl = isLocalBrowser
  ? import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`
  : '/api';

export const api = axios.create({
  baseURL: apiBaseUrl
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nds_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('nds_token');
      localStorage.removeItem('nds_user');
      localStorage.removeItem('nds_attendance_log_id');
      window.dispatchEvent(new Event('nds-auth-cleared'));
    }
    return Promise.reject(error);
  }
);
