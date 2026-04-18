import type { AIProvider as AIProviderName } from '../types';
import type { AIProvider } from './types';
export type { AIProvider, ToolDefinition, ChatParams } from './types';

import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';

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
    default:
      throw new Error(`不支援的 AI provider：${name as string}`);
  }

  _cache.set(name, provider);
  return provider;
}

// ── Discovery: which providers are usable right now? ───────────────

export interface ProviderInfo {
  name: AIProviderName;
  models: string[];
  default_model: string;
}

export function getAvailableProviders(): ProviderInfo[] {
  const available: ProviderInfo[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    available.push({
      name: 'claude',
      models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
      default_model: 'claude-sonnet-4-6',
    });
  }
  if (process.env.OPENAI_API_KEY) {
    available.push({
      name: 'openai',
      models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      default_model: 'gpt-4o',
    });
  }
  if (process.env.GEMINI_API_KEY) {
    available.push({
      name: 'gemini',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      default_model: 'gemini-2.5-flash',
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    available.push({
      name: 'openrouter',
      models: ['deepseek/deepseek-r1', 'deepseek/deepseek-chat', 'meta-llama/llama-4-maverick', 'mistralai/mistral-small-3.1', 'google/gemini-2.5-flash-preview', 'anthropic/claude-sonnet-4-6'],
      default_model: 'deepseek/deepseek-chat',
    });
  }

  return available;
}

export function getDefaultProviderName(): AIProviderName {
  const env = process.env.DEFAULT_AI_PROVIDER;
  if (env && ['claude', 'openai', 'gemini', 'openrouter'].includes(env)) return env as AIProviderName;
  // Fall back to the first available
  const available = getAvailableProviders();
  if (available.length === 0) return 'claude'; // will fail later if no key
  return available[0].name;
}

export function getDefaultModel(providerName: AIProviderName): string {
  const env = process.env.DEFAULT_AI_MODEL;
  if (env) return env;
  const info = getAvailableProviders().find(p => p.name === providerName);
  return info?.default_model ?? 'claude-sonnet-4-6';
}
