import axios from "axios";
import { readAuthToken } from "./authSession.js";

/** Trim .env quirks: spaces, accidental quotes, trailing slashes */
function normalizeUrl(v) {
  if (v == null || v === "") return "";
  return String(v)
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(/\/+$/, "");
}

const envBackend = normalizeUrl(import.meta.env.VITE_BACKEND_URL);
const isDev = import.meta.env.DEV;

/**
 * Dev: "" → requests go to the Vite dev server, which proxies /api → backend.
 * Prod / preview: full URL from env (set at build time).
 */
export const API_BASE = isDev
  ? ""
  : envBackend || "http://127.0.0.1:5000";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60s timeout to tolerate Render free-tier cold starts
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to all outgoing requests
api.interceptors.request.use((config) => {
  const token = readAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-retry cold-start timeouts and transient gateway errors for idempotent GET requests
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config.__isRetry) {
      return Promise.reject(error);
    }
    const isNetworkOrTimeout =
      error.code === "ECONNABORTED" ||
      error.code === "ERR_NETWORK" ||
      error.message === "Network Error" ||
      (error.response && error.response.status >= 502 && error.response.status <= 504);

    if (isNetworkOrTimeout && config.method?.toLowerCase() === "get") {
      config.__isRetry = true;
      console.warn(
        "[api] Backend cold-start or temporary network failure; retrying GET request in 2.5s...",
        config.url
      );
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return api(config);
    }
    return Promise.reject(error);
  }
);

/** Socket.io must match page origin in dev so the Vite /socket.io proxy is used. */
export function getSocketUrl() {
  if (isDev && typeof window !== "undefined") {
    return window.location.origin;
  }
  return envBackend || "http://127.0.0.1:5000";
}
