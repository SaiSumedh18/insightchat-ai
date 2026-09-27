export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    credentials: 'same-origin',
    headers:
      options.body instanceof FormData
        ? options.headers
        : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'The server could not be reached.' }));
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(body.error ?? 'Request failed.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export type Stat = {
  name: string;
  type: string;
  missing: number;
  unique: number;
  sum?: number;
  mean?: number;
  min?: number;
  max?: number;
};
export type Analytics = {
  rowCount: number;
  columnCount: number;
  missingCells: number;
  numericColumns: string[];
  categoryColumns: string[];
  stats: Stat[];
};
export type Dataset = {
  id: string;
  name: string;
  analytics: Analytics;
  created_at?: string;
  columns?: string[];
  preview?: Record<string, string>[];
};
export type Message = { id: string; role: 'user' | 'assistant'; content: string };
