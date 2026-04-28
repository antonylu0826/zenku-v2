# 整合與部署 (Integration & Deployment)

> Zenku 是一個開放的系統，透過標準化的 API、Webhook 與 Docker 支持，能輕易整合進現有的企業自動化流程（如 n8n）。

---

## 1. 外部 REST API (`/api/ext/`)

針對外部系統（如 n8n, Make, Zapier）提供的專用介面。所有請求必須在 Header 帶入 API Key。

*   **基礎路徑**：`http://localhost:3001/api/ext/data/`
*   **常用端點**：
    *   `GET /:table`：分頁查詢資料。
    *   `POST /:table`：新增紀錄，並自動觸發 `after_insert` 規則。
    *   `PATCH /:table/:id`：**資料回填 (Write-back)**。僅更新傳入的欄位，並自動觸發 `after_update` 規則。
*   **OpenAPI 規範**：系統會根據當前資料庫結構，動態生成並公開 `GET /api/ext/openapi.json`。

---

## 2. Webhook 整合 (Zenku → n8n)

Zenku 透過「商業規則引擎」主動將資料推送至外部系統。

### 運作流程範例：
1.  **觸發**：使用者在 Zenku 建立一筆「訂單」。
2.  **推送**：Zenku 觸發 `after_insert` Webhook，將資料 POST 到 n8n。
3.  **處理**：n8n 執行 AI 分析或 ERP 串接。
4.  **回填**：n8n 處理完後，透過 `PATCH` 請求將結果寫回 Zenku 欄位。

### Docker 網路注意事項：
若 n8n 運行於 Docker 而 Zenku 運行於宿主機，n8n 呼叫 Zenku 時必須使用 `http://host.docker.internal:3001`。

---

## 3. 多 AI 供應商適配 (Multi-Provider)

Zenku 抽象了一套統一的 AI Provider 介面，支援在環境變數中切換供應商：

*   **支援列表**：
    *   `anthropic` (Claude 3.5 Sonnet / Haiku)
    *   `openai` (GPT-4o / GPT-4o-mini)
    *   `gemini` (Gemini 1.5 Pro / Flash)
    *   `ollama` (本地 Llama 3 / DeepSeek)
    *   `openrouter` (聚合型供應商)
*   **特性**：支援 `Prompt Caching` 以大幅減少重複生成的成本與延遲。

---

## 4. MCP Server 存取

Zenku 原生支援 **Model Context Protocol (MCP)**。
*   **端點**：`POST /api/mcp`
*   **用途**：讓外部的 AI Agent（如 Claude Desktop 或自建 Agent）直接具備「控制 Zenku」的能力。
*   **安全性**：同樣受限於 API Key 的 Scopes。例如，擁有 `mcp:read` 權限的 Agent 僅能查詢資料，無法修改 Schema。

---

## 5. 部署架構 (Deployment)

*   **Docker 部署**：支援一鍵 `docker-compose up -d` 啟動前後端與資料庫。
*   **持久化**：
    *   **SQLite**：掛載 `zenku.db` 檔案卷。
    *   **Postgres / MSSQL**：透過環境變數連結外部實體。
*   **靜態資源**：前端 Vite 編譯後由後端 Express 靜態託管，或透過 Nginx 反向代理。

---

## 6. 系統限制與調整 (Limits & Tuning)

### 6.1 AI Chat 附件大小限制

Zenku 的 AI Chat 支援上傳圖片與文件作為對話附件。附件會以 base64 方式編碼後放在 JSON body 送出，因此存在**兩層限制**，需要同步調整：

| 層級 | 位置 | 預設值 | 說明 |
|---|---|---|---|
| **Client 端前置驗證** | `packages/web/src/components/ChatPanel.tsx` → `MAX_ATTACH_MB` | **4 MB** | 檔案選取後立即在瀏覽器端判斷；超過會顯示 toast 錯誤並阻止上傳。 |
| **Server 端 JSON body limit** | `packages/server/src/index.ts` → `express.json({ limit })` | **10 MB** (環境變數 `UPLOAD_MAX_MB`) | 由 Express 在接收請求時判斷；超過會回傳 HTTP 413。base64 編碼後體積約增加 33%，所以 Server 端限制應設為 Client 限制的 1.5 倍以上。 |

#### 調整步驟

1. **修改 `.env`（或 Docker 環境變數）**
   ```env
   UPLOAD_MAX_MB=20   # 例：允許更大的附件
   ```

2. **同步調整 Client 端常數**（若想放寬 Client 前置驗證）
   ```typescript
   // packages/web/src/components/ChatPanel.tsx
   const MAX_ATTACH_MB = 12;  // 配合 Server 端 20 MB，保留 base64 膨脹空間
   ```

> **注意**：若使用 Nginx 反向代理，還需同步調整 Nginx 的 `client_max_body_size`，否則 Nginx 會在 Express 之前攔截大請求並回傳 413。
> ```nginx
> client_max_body_size 25m;  # 略大於 UPLOAD_MAX_MB 即可
> ```
