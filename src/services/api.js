import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor — attach JWT when available ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('civicfix_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor — normalise error shape ─────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Unwrap Axios error into a plain message string so components
    // can simply catch(err) and display err.message without digging
    // into error.response.data every time
    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong. Please try again.';

    return Promise.reject(new Error(message));
  }
);

export default api;
