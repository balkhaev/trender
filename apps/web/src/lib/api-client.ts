/**
 * Единая конфигурация и клиент для API запросов
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(endpoint: string, params?: FetchOptions["params"]): string {
  let url = `${API_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Базовый API клиент с обработкой ошибок
 */
export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    credentials: "include",
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `Request failed: ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

/**
 * API клиент для получения Blob (видео, изображения)
 */
export async function apiClientBlob(
  endpoint: string,
  options: FetchOptions = {}
): Promise<Blob> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    credentials: "include",
    ...fetchOptions,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `Request failed: ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.blob();
}

/**
 * API клиент для POST запросов
 */
export async function apiPost<T>(
  endpoint: string,
  data?: unknown,
  options: Omit<FetchOptions, "body" | "method"> = {}
): Promise<T> {
  return apiClient<T>(endpoint, {
    ...options,
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * API клиент для DELETE запросов
 */
export async function apiDelete<T>(
  endpoint: string,
  options: Omit<FetchOptions, "method"> = {}
): Promise<T> {
  return apiClient<T>(endpoint, {
    ...options,
    method: "DELETE",
  });
}
