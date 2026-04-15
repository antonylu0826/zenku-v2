import type { ViewDefinition, SSEChunk } from './types';

const BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('zenku-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface TableQuery {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  /** Filter by specific field values: { field_name: value } */
  filters?: Record<string, string | number>;
}

export interface TableQueryResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getViews(): Promise<{ definition: ViewDefinition }[]> {
  const res = await fetch(`${BASE}/views`, { headers: authHeaders() });
  return parseJsonOrThrow<{ definition: ViewDefinition }[]>(res);
}

export async function getTableData(table: string, query: TableQuery): Promise<TableQueryResult> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.search) params.set('search', query.search);
  if (query.filters) {
    for (const [key, value] of Object.entries(query.filters)) {
      params.set(`filter[${key}]`, String(value));
    }
  }

  const res = await fetch(`${BASE}/data/${table}?${params.toString()}`, { headers: authHeaders() });
  return parseJsonOrThrow<TableQueryResult>(res);
}

export async function getRecord(table: string, id: string | number): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}/${id}`, { headers: authHeaders() });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function createRow(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function updateRow(table: string, id: unknown, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function deleteRow(table: string, id: unknown): Promise<void> {
  const res = await fetch(`${BASE}/data/${table}/${id}`, { method: 'DELETE', headers: authHeaders() });
  await parseJsonOrThrow<{ success: boolean }>(res);
}

export async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ sql }),
  });
  return parseJsonOrThrow<Record<string, unknown>[]>(res);
}

export interface AIProviderInfo {
  name: string;
  models: string[];
  default_model: string;
}

export async function getAIProviders(): Promise<AIProviderInfo[]> {
  const res = await fetch(`${BASE}/ai/providers`, { headers: authHeaders() });
  return parseJsonOrThrow<AIProviderInfo[]>(res);
}

export interface SessionSummary {
  id: string;
  title: string | null;
  provider: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  tool_events: {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_output: { success: boolean; message: string };
  }[];
}

export async function getSessions(limit = 20): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE}/sessions?limit=${limit}`, { headers: authHeaders() });
  return parseJsonOrThrow<SessionSummary[]>(res);
}

export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`, { headers: authHeaders() });
  return parseJsonOrThrow<SessionMessage[]>(res);
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  await parseJsonOrThrow<{ success: boolean }>(res);
}

export async function archiveSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/archive`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  await parseJsonOrThrow<{ success: boolean }>(res);
}

export async function* sendChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  options?: { provider?: string; model?: string; session_id?: string }
): AsyncGenerator<SSEChunk> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, history, provider: options?.provider, model: options?.model, session_id: options?.session_id }),
  });

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6).trim();
        if (json) {
          try {
            yield JSON.parse(json) as SSEChunk;
          } catch {
            // skip malformed
          }
        }
      }
    }
  }
}
