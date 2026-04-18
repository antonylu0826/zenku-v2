import { AI_MODELS } from '@zenku/shared';
import type { AIProvider as AIProviderName, ModelOption } from '../types';
import type { AIProvider } from './types';
export type { AIProvider, ToolDefinition, ChatParams } from './types';

import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OllamaProvider } from './ollama-provider';
import { fetchOllamaModels } from './ollama-models';

export { fetchOllamaModels } from './ollama-models';

// ── Singleton cache (one instance per provider name) ───────────────

const _cache = new Map<string, AIProvider>();

export function createProvider(name: AIProviderName): AIProvider {
  const cached = _cache.get(name);
  if (cached) return cached;

  let provider: AIProvider;

  switch (name) {
    case 'claude': {
      provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY);
      break;
    }
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY 未設定');
      provider = new OpenAIProvider(key);
      break;
    }
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY 未設定');
      provider = new GeminiProvider(key);
      break;
    }
    case 'openrouter': {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('OPENROUTER_API_KEY not set');
      provider = new OpenRouterProvider(key);
      break;
    }
    case 'ollama': {
      const url = process.env.OLLAMA_URL || 'http://localhost:11434';
      provider = new OllamaProvider(url);
      break;
    }
    default:
      throw new Error(`不支援的 AI provider：${name as string}`);
  }

  _cache.set(name, provider);
  return provider;
}

// ── Discovery: which providers are usable right now? ───────────────

export interface ProviderInfo {
  name: AIProviderName;
  models: ModelOption[];
  default_model: string;
}

export async function getAvailableProviders(): Promise<ProviderInfo[]> {
  const available: ProviderInfo[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    available.push({
      name: 'claude',
      models: AI_MODELS.claude,
      default_model: 'claude-sonnet-4-6',
    });
  }
  if (process.env.OPENAI_API_KEY) {
    available.push({
      name: 'openai',
      models: AI_MODELS.openai,
      default_model: 'gpt-4o',
    });
  }
  if (process.env.GEMINI_API_KEY) {
    available.push({
      name: 'gemini',
      models: AI_MODELS.gemini,
      default_model: 'gemini-2.5-flash',
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    available.push({
      name: 'openrouter',
      models: AI_MODELS.openrouter,
      default_model: 'deepseek/deepseek-chat-v3-1',
    });
  }
  if (process.env.OLLAMA_URL) {
    const models = await fetchOllamaModels();
    available.push({
      name: 'ollama',
      models: models.length > 0 ? models : AI_MODELS.ollama,
      default_model: models.length > 0 ? models[0].id : 'llama3.2',
    });
  }

  return available;
}

export async function getDefaultProviderName(): Promise<AIProviderName> {
  const env = process.env.DEFAULT_AI_PROVIDER;
  if (env && ['claude', 'openai', 'gemini', 'openrouter', 'ollama'].includes(env)) return env as AIProviderName;
  // Fall back to the first available
  const available = await getAvailableProviders();
  if (available.length === 0) return 'claude'; // will fail later if no key
  return available[0].name;
}

export async function getDefaultModel(providerName: AIProviderName): Promise<string> {
  const env = process.env.DEFAULT_AI_MODEL;
  if (env) return env;
  const info = (await getAvailableProviders()).find(p => p.name === providerName);
  return info?.default_model ?? 'claude-sonnet-4-6';
}
