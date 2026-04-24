/**
 * Fastify API client.
 *
 * All HTTP calls go through `api()` so error handling, auth, and SWR
 * integration live in one place.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFrom(res: Response, body: unknown): ApiError {
  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : res.statusText || `HTTP ${res.status}`;
  return new ApiError(res.status, message, body);
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseBody(res);
  if (!res.ok) throw errorFrom(res, body);
  return body as T;
}

export async function upload<T = unknown>(
  path: string,
  form: FormData,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form,
  });
  const body = await parseBody(res);
  if (!res.ok) throw errorFrom(res, body);
  return body as T;
}

export const apiBaseUrl = BASE_URL;

// SWR fetcher — the default.
export const fetcher = <T = unknown>(path: string) => api<T>(path);
