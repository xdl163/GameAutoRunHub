import { getApiBase } from "./config.js";

export async function apiFetch(path, options = {}) {
  const apiBase = getApiBase();
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;

  return fetch(url, {
    credentials: "include",
    ...options,
  });
}
