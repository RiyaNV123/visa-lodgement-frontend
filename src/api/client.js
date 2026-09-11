import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const client = axios.create({ baseURL: API_BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// FastAPI's error `detail` is usually a plain string (our own HTTPException
// calls), but on a 422 validation error it's an ARRAY of {loc, msg, type}
// objects instead -- rendering that directly as a React child crashes the
// page ("Objects are not valid as a React child"). Always go through this
// helper rather than reading `err.response.data.detail` directly.
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg || (typeof item === "string" ? item : null)).filter(Boolean);
    return messages.length ? messages.join(" ") : fallback;
  }
  return fallback;
}

export default client;
