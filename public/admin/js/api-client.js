const DEFAULT_BASE_URL = "/api/admin";

export function createAdminApi({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Se necesita una implementación de fetch.");
  }

  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const options = { method, headers: { ...headers } };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetchImpl(`${baseUrl}${path}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `La solicitud falló (HTTP ${response.status}).`);
    }
    return payload;
  }

  return {
    request,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body }),
    put: (path, body) => request(path, { method: "PUT", body }),
    delete: (path, body) => request(path, { method: "DELETE", body }),
  };
}

export const adminApi = createAdminApi();
