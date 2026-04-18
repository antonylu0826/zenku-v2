import type { ModelOption } from '../types';

interface CacheEntry {
  models: ModelOption[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchOllamaModels(): Promise<ModelOption[]> {
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) return [];

  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }

  try {
    const res = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/tags`);
    if (!res.ok) return cache?.models ?? [];

    const data = await res.json() as { models: { name: string }[] };
    const models: ModelOption[] = (data.models ?? []).map(m => ({
      id: m.name,
      label: m.name,
    }));

    cache = { models, fetchedAt: now };
    return models;
  } catch {
    return cache?.models ?? [];
  }
}