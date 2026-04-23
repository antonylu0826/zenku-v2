# Zenku External Integration Guide

This document covers what external systems need to know to communicate bidirectionally with Zenku. Examples use **n8n** as the external system, but the same patterns apply to any automation tool, third-party service, or AI agent (Zapier, Make, LangChain, etc.).

Topics: authentication, external REST API, outbound webhook payload format, write-back options, MCP server access, and common pitfalls.

---

## 1. Architecture Overview

```
┌──────────────┐   after_insert webhook   ┌──────────┐   PATCH /api/ext/data/:table/:id
│    Zenku     │  ───────────────────────► │   n8n    │  ────────────────────────────────►  Zenku
│  (host:3001) │                           │ (docker) │                                     (write-back)
└──────────────┘                           └──────────┘
       ▲                                        │
       │              MCP / REST API            │
       └────────────────────────────────────────┘
              AI agent (Claude, etc.)
```

- **Zenku** runs on the host machine (default port `3001`).
- **n8n** typically runs inside Docker. To reach Zenku from n8n, use `http://host.docker.internal:3001` — never `localhost`.
- An **AI agent** can control Zenku via the MCP server (`/api/mcp`) or the external REST API (`/api/ext/`).

---

## 2. Authentication

### API Key format

```
zk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are managed in Zenku's Settings → API Keys panel.

### How to send

All external API calls use HTTP Bearer authentication:

```
Authorization: Bearer zk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Scopes

| Scope | Grants |
|---|---|
| `read:*` | Read all tables via `/api/ext/data/` |
| `read:<table>` | Read a specific table only |
| `write:*` | Create / update all tables via `/api/ext/data/` |
| `write:<table>` | Write to a specific table only |
| `webhook:callback` | Use the `/api/ext/webhook/callback` write-back endpoint |
| `mcp:read` | MCP tools: `query_data`, `get_table_schema` |
| `mcp:write` | MCP tools above + `write_data` |
| `mcp:admin` | All MCP tools (schema, UI, rules, undo) |

> **Critical**: `/api/data/` requires a logged-in browser session. External agents must always use `/api/ext/` with an API key. Using the wrong path returns `401 Unauthorized`.

---

## 3. External REST API (`/api/ext/`)

Base URL: `http://host.docker.internal:3001` (from Docker) or `http://localhost:3001` (from host)

### List records

```http
GET /api/ext/data/:table
Authorization: Bearer zk_live_...

Query parameters:
  page    (integer, default 1)
  limit   (integer, default 20, max 100)
  sort    (field name)
  order   (asc | desc)
  search  (full-text across all text fields)
  filter[field]=value  (exact match filter)
```

Response:
```json
{
  "rows": [ { "id": 1, "title": "...", ... } ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### Get single record

```http
GET /api/ext/data/:table/:id
Authorization: Bearer zk_live_...
```

### Create record

```http
POST /api/ext/data/:table
Authorization: Bearer zk_live_...
Content-Type: application/json

{ "field1": "value1", "field2": "value2" }
```

Response: `201 Created` with the full record (including `id`, `created_at`).

`after_insert` rules fire automatically after a successful POST.

### Partial update (write-back)

```http
PATCH /api/ext/data/:table/:id
Authorization: Bearer zk_live_...
Content-Type: application/json

{ "status": "Completed", "result": "processed text" }
```

Only send the fields you want to change. Omitted fields are untouched. `after_update` rules fire after this call.

### OpenAPI spec

```http
GET /api/ext/openapi.json
```

No authentication required. Returns a live OpenAPI 3.0 spec that reflects the current database schema.

---

## 4. Webhook Automation (Zenku → n8n)

### Setting up a rule in Zenku

In Zenku Settings → Rules, create a rule on your table:

| Field | Value |
|---|---|
| Trigger | `after_insert` |
| Condition | e.g. `status eq Pending` |
| Action type | `webhook` |
| URL | your n8n Webhook Trigger URL |
| Method | `POST` |

### Webhook payload Zenku sends to n8n

```json
{
  "table": "my_tasks",
  "action": "insert",
  "data": {
    "id": 42,
    "title": "Example task",
    "payload": "raw text",
    "status": "Pending",
    "created_at": "2026-04-22T09:00:00.000Z",
    "updated_at": "2026-04-22T09:00:00.000Z"
  },
  "rule": "Notify n8n on insert"
}
```

The inserted record is under `body.data` in n8n's Webhook node. Access fields with expressions like `{{ $json.body.data.id }}`.

### n8n Webhook Trigger configuration

Set **Response Mode** to `responseNode` (not the default "Immediately"). This keeps the connection open until your last node responds, which prevents "Respond to Webhook" node failures.

---

## 5. Write-Back: n8n → Zenku

After n8n processes the data, write results back to Zenku using either method below.

### Method A: PATCH the record directly (recommended)

```http
PATCH http://host.docker.internal:3001/api/ext/data/my_tasks/{{ $json.body.data.id }}
Authorization: Bearer zk_live_...
Content-Type: application/json

{
  "status": "Completed",
  "processed_result": "{{ $('Process Data').item.json.result }}"
}
```

In n8n's HTTP Request node:
- **Authentication**: set to `Predefined Credential Type` → `httpBearerAuth`. Create a credential object with your `zk_live_` token. Do **not** add a manual `Authorization` header — this conflicts with the built-in auth.
- **URL field**: switch to **Expression mode** before pasting the URL, otherwise `{{ }}` is treated as literal text.
- **Method**: `PATCH`
- **Body**: JSON with only the fields to update.

### Method B: Webhook callback endpoint

Use this if you want a single semantic endpoint instead of constructing the table URL dynamically. Requires the `webhook:callback` scope on your API key.

```http
POST http://host.docker.internal:3001/api/ext/webhook/callback
Authorization: Bearer zk_live_...
Content-Type: application/json

{
  "table": "my_tasks",
  "record_id": 42,
  "updates": {
    "status": "Completed",
    "processed_result": "processed text"
  }
}
```

---

## 6. MCP Server

The MCP endpoint is available at:

```
POST /api/mcp
Authorization: Bearer zk_live_...  (scope: mcp:read or higher)
```

### Available tools by scope

| Scope | Tools |
|---|---|
| `mcp:read` | `query_data`, `get_table_schema`, `get_integration_guide` |
| `mcp:write` | above + `write_data` |
| `mcp:admin` | above + `manage_schema`, `manage_ui`, `manage_rules`, `assess_impact`, `undo_action` |

### Connecting from Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "zenku": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/api/mcp"],
      "env": {
        "MCP_BEARER_TOKEN": "zk_live_..."
      }
    }
  }
}
```

From Docker / n8n AI Agent node, replace `localhost` with `host.docker.internal`.

---

## 7. Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `ECONNREFUSED` connecting to `localhost` | n8n runs in Docker; `localhost` refers to the container, not the host | Use `http://host.docker.internal:3001` |
| `401 Unauthorized` | Wrong path or missing/invalid API key | Use `/api/ext/` (not `/api/data/`); check Bearer token |
| `403 ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE` | API key lacks the required scope | Add `write:*` for POST/PATCH, `webhook:callback` for the callback endpoint |
| `400 ERROR_RULE_VALIDATION` | A `before_insert`/`before_update` rule rejected the data | Check rule conditions in Zenku Settings → Rules |
| n8n URL field shows `{{` as literal text | Expression mode is not enabled on the URL field | Click the expression toggle button (curly braces icon) next to the URL field |
| `{{ $json.body.data.id }}` returns undefined | n8n webhook data nesting | Use `$json.body.data.id`; the inserted record is always nested under `body.data` |
| Respond to Webhook node fails | Webhook Trigger is set to respond immediately | Set Webhook Trigger **Response Mode** to `responseNode` |
| Auth conflict in HTTP Request node | Manual `Authorization` header + built-in auth both set | Remove manual header; use `Predefined Credential Type` → `httpBearerAuth` only |

---

## 8. End-to-End Walkthrough

1. **Create a table** in Zenku with fields: `title`, `status`, `processed_result`.
2. **Create a UI view** so you can add records and observe changes.
3. **Create an after_insert rule** on the table:
   - Condition: `status eq Pending`
   - Action: webhook to your n8n workflow URL
4. **In n8n**, create a workflow:
   - **Webhook Trigger** (Response Mode: `responseNode`) — receives `{ table, action, data, rule }`
   - **Code node** — reads `$json.body.data` and processes it
   - **HTTP Request node** — PATCHes `http://host.docker.internal:3001/api/ext/data/your_table/{{ $json.body.data.id }}` with `httpBearerAuth` credential
   - **Respond to Webhook node** — returns `{ "success": true }`
5. **Activate the n8n workflow**.
6. **Add a record** in Zenku with `status = Pending`.
7. Zenku fires the webhook → n8n processes → n8n PATCHes back → record updates automatically.
