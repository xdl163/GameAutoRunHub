import { API_BASE } from "./config.js";

export async function apiFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  return fetch(url, {
    credentials: "include",
    ...options,
  });
}
