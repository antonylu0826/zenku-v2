# Zenku 優化建議

## 1. index.ts 用 Express Router 拆分

`index.ts` 目前承載過多 admin 路由，可拆成獨立 router 檔案：

- `routes/admin-views.ts` — view CRUD、欄位屬性、外觀條件
- `routes/admin-schema.ts` — 表結構管理
- `routes/admin-rules.ts` — 業務規則
- `routes/data.ts` — 使用者資料讀寫
- `routes/views.ts` — view action 執行、資料查詢

`index.ts` 回歸純 `app.use()` 的分發角色。工作量約半天，可讀性提升最直接。

## 2. System Prompt 動態 Schema 注入

目前所有表結構全量注入，表數量增多後 token 壓力明顯。

做法：根據對話中提到的表名或 view，只注入相關的 schema 段落。沒有被提及的表不注入，或只注入表名清單讓 AI 按需查詢（可搭配新增 `get_schema` 工具）。

> 注意：工具操作指南（如「先 get_view 再 update_view」這類跨工具規則）必須保留在 system prompt 主體中，不要拆散到 handler description，否則 LLM 容易漏遵循。

## 3. 公式解析移至 packages/shared

`computed` 欄位的公式解析目前前後端可能各自實作。統一移到 `packages/shared` 可確保計算邏輯一致，也方便後續支援更複雜的函式。
