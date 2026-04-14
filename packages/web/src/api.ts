import type { ViewDefinition, SSEChunk } from './types';

const BASE = '/api';

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
  const res = await fetch(`${BASE}/views`);
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

  const res = await fetch(`${BASE}/data/${table}?${params.toString()}`);
  return parseJsonOrThrow<TableQueryResult>(res);
}

export async function getRecord(table: string, id: string | number): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}/${id}`);
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function createRow(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function updateRow(table: string, id: unknown, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/data/${table}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function deleteRow(table: string, id: unknown): Promise<void> {
  const res = await fetch(`${BASE}/data/${table}/${id}`, { method: 'DELETE' });
  await parseJsonOrThrow<{ success: boolean }>(res);
}

export async function* sendChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<SSEChunk> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
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
