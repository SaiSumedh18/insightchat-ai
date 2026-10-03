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

export async function streamMessage(
  path: string,
  question: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api' + path + '/stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    const body = await response.json().catch(() => ({ error: 'Unable to start the response.' }));
    throw new Error(body.error);
  }
  if (!response.body) throw new Error('Streaming is unavailable.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    complete: string | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const event = frame
          .split('\n')
          .find((line) => line.startsWith('event: '))
          ?.slice(7);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n');
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === 'delta') onDelta(payload.delta);
        else if (event === 'done') complete = payload.content;
        else if (event === 'error') throw new Error(payload.error);
      }
      if (done) break;
    }
    if (complete === undefined) throw new Error('The response was interrupted. Please try again.');
    return complete;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
