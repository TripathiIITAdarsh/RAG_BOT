const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

export function createSession() {
  return request("/api/session", { method: "POST" });
}

export function deleteSession(sessionId) {
  return request(`/api/session/${sessionId}`, { method: "DELETE" });
}

export function uploadDocument(sessionId, file) {
  const formData = new FormData();

  // sessionId is appended first so it is present even for very large files.
  formData.append("sessionId", sessionId);
  formData.append("document", file);

  return request("/api/upload", { method: "POST", body: formData });
}

export function search(sessionId, query) {
  const params = new URLSearchParams({ q: query, sessionId });

  return request(`/api/search?${params}`);
}
