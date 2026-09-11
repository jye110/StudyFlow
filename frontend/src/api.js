let csrfToken = "";

export async function bootstrap() {
  const result = await api("/auth/csrf");
  csrfToken = result.csrf_token;
  return result.user;
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(
      data?.error || "Something went wrong. Please try again.",
    );
    error.fields = data?.fields || {};
    error.status = response.status;
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("session-expired"));
    }
    throw error;
  }
  if (data?.csrf_token) csrfToken = data.csrf_token;
  return data;
}
