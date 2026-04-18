# Ollama Support Design

## Goal

Add Ollama as an AI provider in Zenku v2, allowing users to run local LLMs through Ollama's OpenAI-compatible API. Ollama appears as a provider option only when `OLLAMA_URL` is configured, and its model list is dynamically loaded from the running Ollama instance.

## Design Decision

**Approach: OpenAI SDK reuse** — `OllamaProvider` uses the OpenAI SDK pointed at `{OLLAMA_URL}/v1`, the same pattern as `OpenRouterProvider`. This minimizes new code and leverages Ollama's built-in OpenAI-compatibility layer, which supports tool calling.

## Architecture

### 1. Environment Configuration

- Add `OLLAMA_URL` to `.env` and `.env.example`
- Default value in code: `http://localhost:11434`
- If `OLLAMA_URL` is not set → Ollama provider is not available
- If set → Ollama appears in provider dropdown, models fetched dynamically

### 2. Shared Types (`packages/shared/src/types/ai-provider.ts`)

- Add `'ollama'` to `AIProvider` type union
- Add `ollama` key to `AI_MODELS` with a fallback static list (used only when dynamic fetch fails)
- `TOKEN_COSTS` entry for Ollama models is not needed (local = free)

### 3. Ollama Provider (`packages/server/src/ai/ollama-provider.ts`)

New class `OllamaProvider implements AIProvider`:

- Constructor takes `ollamaUrl: string`
- Creates `OpenAI` client with `baseURL: ${ollamaUrl}/v1` and `apiKey: 'ollama'` (Ollama doesn't require a key, but OpenAI SDK needs one)
- `chat()` method identical to `OpenRouterProvider.chat()` — same message mapping, tool mapping, response parsing
- Supports tool calling through OpenAI SDK (Ollama forwards tools to capable models)

### 4. Dynamic Model Fetching

**Server endpoint**: `GET /api/ai/ollama/models`

- Checks `OLLAMA_URL` env var exists, returns 404 if not configured
- Calls `${OLLAMA_URL}/api/tags` to get installed models
- Transforms response to `{ models: ModelOption[] }`
- Caches results for 5 minutes (avoid hitting Ollama on every request)
- Returns appropriate error if Ollama is unreachable
- Use a module-level cache variable with TTL

**How `getAvailableProviders()` changes**:
- When `OLLAMA_URL` is set, include `ollama` in available providers
- For model list: call the same fetch logic used by the endpoint (cache shared)
- `default_model`: first model from the fetched list, or `'llama3.2'` if fetch fails

### 5. Provider Registry (`packages/server/src/ai/index.ts`)

- Import `OllamaProvider`
- Add `case 'ollama'` to `createProvider()` switch
- Add `OLLAMA_URL` check to `getAvailableProviders()` — push ollama entry with dynamically fetched models
- Add `'ollama'` to valid provider list in `getDefaultProviderName()`

### 6. Frontend Changes

**`packages/web/src/api.ts`**:
- Add `getOllamaModels()` function that calls `GET /api/ai/ollama/models`
- Returns `{ models: ModelOption[] }`

**`packages/web/src/components/ChatPanel.tsx`**:
- Add `'ollama': 'Ollama'` to `PROVIDER_LABELS`
- When provider switches to `'ollama'`, call `getOllamaModels()` and use the response to populate the model dropdown
- For other providers, continue using static models from `getAIProviders()` response

### 7. Docker / Deployment

- Add `OLLAMA_URL` to `docker-compose.yml` environment section
- No API key needed for Ollama

## Files Changed

| File | Change |
|------|--------|
| `.env.example` | Add `OLLAMA_URL=http://localhost:11434` |
| `packages/shared/src/types/ai-provider.ts` | Add `'ollama'` to type union and `AI_MODELS` |
| `packages/server/src/ai/ollama-provider.ts` | New file — OllamaProvider class |
| `packages/server/src/ai/index.ts` | Register ollama in factory + discovery |
| `packages/server/src/routes/admin.ts` | Add `GET /ai/ollama/models` endpoint |
| `packages/web/src/api.ts` | Add `getOllamaModels()` |
| `packages/web/src/components/ChatPanel.tsx` | Dynamic model loading for Ollama + label |
| `docker-compose.yml` | Add `OLLAMA_URL` env var |

## Error Handling

- If Ollama URL is configured but server is unreachable: show Ollama as available provider but display "Could not connect to Ollama" error in model dropdown, with a retry option
- If dynamic model fetch fails: fall back to `AI_MODELS.ollama` static list
- If model list is empty: show "No models installed" message