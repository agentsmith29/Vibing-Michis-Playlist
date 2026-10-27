export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener = () => {};

export function setUnauthorizedHandler(listener: UnauthorizedListener) {
  onUnauthorized = listener;
}

function getCookie(name: string): string {
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

/** Turn a DRF error payload into one readable sentence. */
function describe(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  for (const value of Object.values(record)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return fallback;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body !== undefined || options.form ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-CSRFToken"] = getCookie("csrftoken");

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  });
  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data: unknown = isJson ? await response.json() : null;
  if (!response.ok) {
    const message = describe(data, `Request failed (${response.status})`);
    if (response.status === 403 && /credentials|authenticat/i.test(message)) onUnauthorized();
    throw new ApiError(response.status, data, message);
  }
  return data as T;
}

/** Multipart upload with progress reporting (fetch cannot report upload progress). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api${path}`);
    request.setRequestHeader("X-CSRFToken", getCookie("csrftoken"));
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        /* not JSON (e.g. proxy error page) */
      }
      if (request.status >= 200 && request.status < 300) resolve(data as T);
      else if (request.status === 413) reject(new ApiError(413, data, "The file is too large"));
      else reject(new ApiError(request.status, data, describe(data, `Upload failed (${request.status})`)));
    };
    request.onerror = () => reject(new ApiError(0, null, "Network error during upload"));
    request.send(form);
  });
}
