import axios from "axios";

// A trailing "/" in VITE_API_URL would produce "//api/v1/..." URLs, so strip it.
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const TOKEN_KEY = "thumbnail-optimizer-token";
const USER_KEY = "thumbnail-optimizer-user";

// withCredentials sends the httpOnly refresh-token cookie to /auth/refresh.
export const api = axios.create({ baseURL: `${API_URL}/api/v1`, withCredentials: true });

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
  clearOptimizeSession();
}

// The Optimize page's results (scored candidates + any test started from them),
// kept per browser tab so a refresh doesn't lose them or allow a duplicate test.
const OPTIMIZE_KEY = "thumbnail-optimizer-optimize";

export function getOptimizeSession() {
  try {
    return JSON.parse(sessionStorage.getItem(OPTIMIZE_KEY));
  } catch (err) {
    return null;
  }
}

export function setOptimizeSession(session) {
  try {
    sessionStorage.setItem(OPTIMIZE_KEY, JSON.stringify(session));
  } catch (err) {
    // storage full or blocked: the page still works, it just won't survive a refresh
  }
}

export function clearOptimizeSession() {
  try {
    sessionStorage.removeItem(OPTIMIZE_KEY);
  } catch (err) {
    // nothing to clear
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Ends the session on the server (deletes the refresh token) and locally.
export async function signOut() {
  try {
    await api.post("/auth/logout");
  } catch (err) {
    // offline or already signed out: clear locally anyway
  }
  clearToken();
  clearUser();
}

// Re-reads the signed-in user (live role, team, status) so the nav matches
// what the backend enforces (D-42).
export async function refreshUser() {
  try {
    const res = await api.get("/auth/me");
    setUser(res.data.user);
    return res.data.user;
  } catch (err) {
    return getUser();
  }
}

// One refresh at a time, shared by every request that hit an expired token.
let refreshing = null;
function refreshAccessToken() {
  if (!refreshing) {
    refreshing = api
      .post("/auth/refresh", null, { _skipRefresh: true })
      .then((res) => {
        setToken(res.data.token);
        setUser(res.data.user);
        return res.data.token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

const NO_REFRESH_PATHS = ["/auth/login", "/auth/signup", "/auth/google", "/auth/refresh", "/auth/logout"];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const code = response?.data?.code;

    if (response?.status === 403 && code === "ACCOUNT_DEACTIVATED") {
      clearToken();
      clearUser();
      if (window.location.pathname !== "/deactivated") window.location.assign("/deactivated");
      return Promise.reject(error);
    }

    // Expired access token: get a new one from the refresh cookie, retry once.
    const canRefresh =
      response?.status === 401 &&
      code === "TOKEN_INVALID" &&
      config &&
      !config._retried &&
      !config._skipRefresh &&
      !NO_REFRESH_PATHS.some((p) => config.url?.startsWith(p));
    if (canRefresh) {
      try {
        const token = await refreshAccessToken();
        config._retried = true;
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch (refreshError) {
        if (refreshError.response?.data?.code === "ACCOUNT_DEACTIVATED") {
          clearToken();
          clearUser();
          window.location.assign("/deactivated");
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
