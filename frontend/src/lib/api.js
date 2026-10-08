import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TOKEN_KEY = "thumbnail-optimizer-token";
const USER_KEY = "thumbnail-optimizer-user";

export const api = axios.create({ baseURL: `${API_URL}/api/v1` });

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// The user object returned alongside the token (id, email, role, name).
// Client-side only, for UI decisions like showing the "Close test" button -
// the backend re-checks every permission regardless of what's stored here.
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch (err) {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
