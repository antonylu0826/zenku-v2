# Ollama Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ollama as an AI provider that dynamically loads available models from a configurable local Ollama server.

**Architecture:** OllamaProvider uses the OpenAI SDK pointed at `{OLLAMA_URL}/v1`, same pattern as OpenRouterProvider. A new server endpoint `GET /api/ai/ollama/models` fetches models dynamically from Ollama's `/api/tags` with 5-minute caching. The frontend loads models dynamically when Ollama is selected.

**Tech Stack:** TypeScript, Express, OpenAI SDK, React, shadcn/ui Select components

---

### Task 1: Shared types — Add `ollama` to AIProvider union and AI_MODELS

**Files:**
- Modify: `packages/shared/src/types/ai-provider.ts:1`

- [ ] **Step 1: Add `'ollama'` to the AIProvider type union**

In `packages/shared/src/types/ai-provider.ts`, change line 1:

```ts
export type AIProvider = 'claude' | 'openai' | 'gemini' | 'openrouter' | 'ollama';
```

- [ ] **Step 2: Add `ollama` fallback models to AI_MODELS**

In the same file, add the `ollama` key after the `openrouter` entry in `AI_MODELS` (after line 53):

```ts
  ollama: [
    { id: 'llama3.2' },
    { id: 'qwen2.5' },
  ],
```

- [ ] **Step 3: Verify shared package compiles**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/ai-provider.ts
git commit -m "feat: add ollama to AIProvider type and AI_MODELS"
```

---

### Task 2: Server — Create OllamaProvider

**Files:**
- Create: `packages/server/src/ai/ollama-provider.ts`

- [ ] **Step 1: Create the OllamaProvider class**

Create `packages/server/src/ai/ollama-provider.ts` with the following content (nearly identical to OpenRouterProvider but without custom headers and with configurable baseURL):

```ts
import OpenAI from 'openai';
import type { LLMMessage, LLMResponse, ToolCall } from '../types';
import type { AIProvider, ChatParams, ToolDefinition } from './types';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private client: OpenAI;

  constructor(ollamaUrl: string) {
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${ollamaUrl.replace(/\/+$/, '')}/v1`,
    });
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: [
        { role: 'system' as const, content: params.system },
        ...this.toOpenAIMessages(params.messages),
      ],
      tools: params.tools.map(t => this.toOpenAITool(t)),
    });

    const choice = response.choices[0];
    if (!choice) {
      return {
        content: '',
        tool_calls: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
        latency_ms: Date.now() - startTime,
      };
    }

    const tool_calls: ToolCall[] = (choice.message.tool_calls ?? [])
      .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      content: choice.message.content ?? '',
      tool_calls,
      stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      latency_ms: Date.now() - startTime,
    };
  }

  private toOpenAITool(t: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as OpenAI.FunctionParameters,
      },
    };
  }

  private toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      if (msg.tool_results && msg.tool_results.length > 0) {
        for (const r of msg.tool_results) {
          result.push({
            role: 'tool' as const,
            tool_call_id: r.tool_use_id,
            content: r.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const oaiMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content || null,
        };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          oaiMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }
        result.push(oaiMsg);
      } else if (msg.content_blocks && msg.content_blocks.length > 0) {
        const parts: OpenAI.ChatCompletionContentPart[] = msg.content_blocks.map(b => {
          if (b.type === 'image' && b.source) {
            return {
              type: 'image_url' as const,
              image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
            };
          }
          return { type: 'text' as const, text: b.text ?? `[Attachment: format ${b.source?.media_type ?? 'unknown'} not supported]` };
        });
        if (msg.content) parts.push({ type: 'text' as const, text: msg.content });
        result.push({ role: 'user' as const, content: parts });
      } else {
        result.push({ role: 'user' as const, content: msg.content });
      }
    }

    return result;
  }
}
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ai/ollama-provider.ts
git commit -m "feat: add OllamaProvider using OpenAI SDK"
```

---

### Task 3: Server — Dynamic model fetching with caching

**Files:**
- Create: `packages/server/src/ai/ollama-models.ts`

- [ ] **Step 1: Create the Ollama model fetching module**

Create `packages/server/src/ai/ollama-models.ts`:

```ts
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
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ai/ollama-models.ts
git commit -m "feat: add Ollama model fetching with 5-minute cache"
```

---

### Task 4: Server — Register Ollama in provider factory and discovery

**Files:**
- Modify: `packages/server/src/ai/index.ts`

- [ ] **Step 1: Add imports and update the provider registry**

In `packages/server/src/ai/index.ts`, make the following changes:

1. Add imports at the top (after line 9):

```ts
import { OllamaProvider } from './ollama-provider';
import { fetchOllamaModels } from './ollama-models';
```

2. Add `ollama` case to `createProvider` switch (after the `openrouter` case, before `default`):

```ts
    case 'ollama': {
      const url = process.env.OLLAMA_URL || 'http://localhost:11434';
      provider = new OllamaProvider(url);
      break;
    }
```

3. Add Ollama to `getAvailableProviders` (after the `openrouter` block and before `return available`):

```ts
  if (process.env.OLLAMA_URL) {
    const models = await fetchOllamaModels();
    available.push({
      name: 'ollama',
      models: models.length > 0 ? models : AI_MODELS.ollama,
      default_model: models.length > 0 ? models[0].id : 'llama3.2',
    });
  }
```

4. Change `getAvailableProviders` from sync to async:

```ts
export async function getAvailableProviders(): Promise<ProviderInfo[]> {
```

5. Add `'ollama'` to `getDefaultProviderName` valid providers (line 97):

```ts
  if (env && ['claude', 'openai', 'gemini', 'openrouter', 'ollama'].includes(env)) return env as AIProviderName;
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors (there will be a type error in admin.ts because `getAvailableProviders` is now async — this will be fixed in Task 5)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ai/index.ts
git commit -m "feat: register Ollama in provider factory and discovery"
```

---

### Task 5: Server — Update admin route for async providers + add models endpoint

**Files:**
- Modify: `packages/server/src/routes/admin.ts`

- [ ] **Step 1: Fix the async getAvailableProviders call and add Ollama models endpoint**

In `packages/server/src/routes/admin.ts`:

1. Change the providers endpoint to be async (line 12-13):

```ts
router.get('/ai/providers', requireAuth, async (_req, res) => {
  res.json(await getAvailableProviders());
});
```

2. Add import for `fetchOllamaModels` at the top (update line 6):

```ts
import { getAvailableProviders, fetchOllamaModels } from '../ai';
```

3. Add the Ollama models endpoint after the providers endpoint (after line 14):

```ts
router.get('/ai/ollama/models', requireAuth, async (_req, res) => {
  const models = await fetchOllamaModels();
  res.json({ models });
});
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/admin.ts
git commit -m "feat: add Ollama models endpoint, make providers async"
```

---

### Task 6: Server — Export fetchOllamaModels from ai/index.ts

**Files:**
- Modify: `packages/server/src/ai/index.ts`

- [ ] **Step 1: Add fetchOllamaModels to exports**

Add this line after the existing exports at the top of `packages/server/src/ai/index.ts` (after line 4):

```ts
export { fetchOllamaModels } from './ollama-models';
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ai/index.ts
git commit -m "feat: export fetchOllamaModels from ai module"
```

---

### Task 7: Config — Add OLLAMA_URL to .env.example and docker-compose.yml

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add OLLAMA_URL to .env.example**

In `.env.example`, add after line 5 (`OPENROUTER_API_KEY=`):

```
OLLAMA_URL=http://localhost:11434
```

Also update the DEFAULT_AI_PROVIDER comment (line 8) to include ollama:

```
# DEFAULT_AI_PROVIDER: claude | openai | gemini | openrouter | ollama
```

- [ ] **Step 2: Add OLLAMA_URL to docker-compose.yml**

In `docker-compose.yml`, add after line 11 (`- GEMINI_API_KEY=${GEMINI_API_KEY:-}`) and before line 12 (the DEFAULT_AI_PROVIDER line):

```yaml
      - OLLAMA_URL=${OLLAMA_URL:-}
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "feat: add OLLAMA_URL to env config and docker-compose"
```

---

### Task 8: Frontend — Add getOllamaModels API call and update ChatPanel

**Files:**
- Modify: `packages/web/src/api.ts`
- Modify: `packages/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: Add getOllamaModels to api.ts**

In `packages/web/src/api.ts`, add after the `getAIProviders` function (after line 141):

```ts
export async function getOllamaModels(): Promise<ModelOption[]> {
  const res = await fetch(`${BASE}/ai/ollama/models`, { headers: authHeaders() });
  const data = await parseJsonOrThrow<{ models: ModelOption[] }>(res);
  return data.models;
}
```

- [ ] **Step 2: Update ChatPanel.tsx — import getOllamaModels**

In `packages/web/src/components/ChatPanel.tsx`, update the import on line 6-7 to add `getOllamaModels`:

```ts
import {
  sendChat, getAIProviders, getOllamaModels, getSessions, getSessionMessages, updateSessionTitle, archiveSession,
  type AIProviderInfo, type SessionSummary, type SessionMessage,
} from '../api';
```

- [ ] **Step 3: Update ChatPanel.tsx — add Ollama label**

In `packages/web/src/components/ChatPanel.tsx`, update the `PROVIDER_LABELS` object (around line 566-571) to add Ollama:

```ts
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};
```

- [ ] **Step 4: Update ChatPanel.tsx — dynamic model loading for Ollama**

In `packages/web/src/components/ChatPanel.tsx`, add state for Ollama models and dynamic loading. Add this after the existing provider/model state declarations (after line 63):

```ts
const [ollamaModels, setOllamaModels] = useState<{ id: string; label?: string }[] | null>(null);
```

Then, update the `onProviderChange` handler in the `ProviderSelector` section (around line 417-420). Change:

```tsx
onProviderChange={(p) => {
  setSelectedProvider(p);
  const info = providers.find(x => x.name === p);
  if (info) setSelectedModel(info.default_model);
}}
```

to:

```tsx
onProviderChange={async (p) => {
  setSelectedProvider(p);
  if (p === 'ollama') {
    try {
      const models = await getOllamaModels();
      setOllamaModels(models);
      if (models.length > 0) {
        setSelectedModel(models[0].id);
      } else {
        setSelectedModel('llama3.2');
      }
    } catch {
      setOllamaModels(null);
      setSelectedModel('llama3.2');
    }
  } else {
    setOllamaModels(null);
    const info = providers.find(x => x.name === p);
    if (info) setSelectedModel(info.default_model);
  }
}}
```

- [ ] **Step 5: Update ProviderSelector to use ollamaModels**

In the `ProviderSelector` component, update the model selection to use `ollamaModels` when Ollama is selected. Change the `currentModels` computation (around line 586):

```tsx
const currentModels = providers.find(p => p.name === selectedProvider)?.models ?? [];
```

to:

```tsx
const currentModels = selectedProvider === 'ollama' && ollamaModels !== null
  ? ollamaModels
  : providers.find(p => p.name === selectedProvider)?.models ?? [];
```

Then update the `ProviderSelector` props type to include `ollamaModels`:

```tsx
function ProviderSelector({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  ollamaModels,
}: {
  providers: AIProviderInfo[];
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (p: string) => void;
  onModelChange: (m: string) => void;
  ollamaModels: { id: string; label?: string }[] | null;
})
```

And update the `ProviderSelector` usage (around line 413-424) to pass the new prop:

```tsx
{providers.length > 1 && (
  <ProviderSelector
    providers={providers}
    selectedProvider={selectedProvider}
    selectedModel={selectedModel}
    onProviderChange={async (p) => {
      setSelectedProvider(p);
      if (p === 'ollama') {
        try {
          const models = await getOllamaModels();
          setOllamaModels(models);
          if (models.length > 0) {
            setSelectedModel(models[0].id);
          } else {
            setSelectedModel('llama3.2');
          }
        } catch {
          setOllamaModels(null);
          setSelectedModel('llama3.2');
        }
      } else {
        setOllamaModels(null);
        const info = providers.find(x => x.name === p);
        if (info) setSelectedModel(info.default_model);
      }
    }}
    onModelChange={setSelectedModel}
    ollamaModels={ollamaModels}
  />
)}
```

- [ ] **Step 6: Verify frontend compiles**

Run: `npx tsc --noEmit -p packages/web/tsconfig.json`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/api.ts packages/web/src/components/ChatPanel.tsx
git commit -m "feat: add Ollama model selection in frontend with dynamic loading"
```

---

### Task 9: Fix any remaining callers of getAvailableProviders

**Files:**
- Modify: any file that calls `getAvailableProviders` (now async)

- [ ] **Step 1: Find all callers of getAvailableProviders**

Run: `rg "getAvailableProviders" packages/`

Review each call site and ensure it uses `await` since the function is now async.

- [ ] **Step 2: Fix any callers that need await**

The only caller should be in `packages/server/src/routes/admin.ts` which was already fixed in Task 5. If there are other callers, add `await` to them.

- [ ] **Step 3: Verify full project compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json && npx tsc --noEmit -p packages/web/tsconfig.json && npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit (if any changes were needed)**

```bash
git add -A
git commit -m "fix: ensure all getAvailableProviders callers handle async"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Start the server**

Run: `cd packages/server && npm run dev`

- [ ] **Step 2: Verify the /api/ai/providers endpoint works**

Without `OLLAMA_URL` set: Should return providers without ollama.
With `OLLAMA_URL=http://localhost:11434` set: Should include ollama if an Ollama server is running.

- [ ] **Step 3: Verify the /api/ai/ollama/models endpoint**

Without Ollama running: Should return empty models array (graceful fallback).
With Ollama running: Should return the list of installed models.

- [ ] **Step 4: Verify the frontend**

Open the app, check that:
- When OLLAMA_URL is not set: No Ollama in provider dropdown
- When OLLAMA_URL is set: Ollama appears in provider dropdown, models load dynamically when selected