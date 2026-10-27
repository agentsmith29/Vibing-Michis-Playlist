import { useConnectivity } from "@/store/connectivity";
import { authHeaders, useSession } from "@/store/session";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function describe(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const value of Object.values(record)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }
  return fallback;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Overrides the stored server address (used during login). */
  server?: string;
  auth?: boolean;
  timeoutMs?: number;
}

/** JSON request against the Michi Playlist API. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const server = options.server ?? useSession.getState().session?.server;
  if (!server) throw new ApiError(0, null, "Not connected to a server");
  const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.auth === false ? {} : authHeaders()),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  let response: Response;
  try {
    response = await fetch(`${server}/api${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    useConnectivity.getState().setServerReachable(false);
    throw new ApiError(0, null, "Server not reachable. Is the VPN connected?");
  } finally {
    clearTimeout(timer);
  }
  useConnectivity.getState().setServerReachable(true);

  if (response.status === 204) return undefined as T;
  const data: unknown = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    const message = describe(data, `Request failed (${response.status})`);
    // The token was revoked (e.g. on the web settings page): sign out locally.
    if ((response.status === 401 || response.status === 403) && options.auth !== false && /token|credentials/i.test(message)) {
      await useSession.getState().clear();
    }
    throw new ApiError(response.status, data, message);
  }
  return data as T;
}

/** Normalise user input like "10.8.0.1:4000" to "http://10.8.0.1:4000". */
export function normalizeServer(input: string): string {
  let value = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/api$/, "");
}
