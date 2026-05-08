# Zenku 系統文件目錄（繁體中文）

> **定位：** 本目錄為 Zenku 的官方繁體中文技術文件，存放於 `docs/zh-TW/`。
> 涵蓋概念說明、架構設計、功能規格與開發紀錄。所有文件皆以「已完成的設計決策」為基礎，忠實記錄現行系統的樣貌。

---

## 現有文件

### 01-概念與願景

- [01-zenku-concept.md](01-概念與願景/01-zenku-concept.md) — 產品定位、核心概念、與 iRAF 的差異
- [02-design-philosophy.md](01-概念與願景/02-design-philosophy.md) — 關鍵設計決策與取捨原則

### 02-架構設計

- [01-system-overview.md](02-架構設計/01-system-overview.md) — 系統全貌：Monorepo 架構、技術棧、目錄結構
- [02-multi-agent-architecture.md](02-架構設計/02-multi-agent-architecture.md) — 多智能體協作架構：Orchestrator + Specialist Agents
- [03-dynamic-ui-rendering.md](02-架構設計/03-dynamic-ui-rendering.md) — 資料驅動 UI 渲染機制詳解
- [04-database-design.md](02-架構設計/04-database-design.md) — 系統表設計、業務表生命週期、遷移策略
- [05-development-environment.md](02-架構設計/05-development-environment.md) — 開發環境配置、本地啟動指引

### 03-功能規格

- [01-view-and-field-types.md](03-功能規格/01-view-and-field-types.md) — 視圖與欄位控制項完整規格
- [02-actions-and-conditional-ui.md](03-功能規格/02-actions-and-conditional-ui.md) — 視圖動作與條件式 UI 規則
- [03-business-rules-engine.md](03-功能規格/03-business-rules-engine.md) — 商業規則引擎：觸發時機與動作
- [04-design-journal-undo.md](03-功能規格/04-design-journal-undo.md) — 設計日誌與 Undo 回滾機制
- [05-security-and-i18n.md](03-功能規格/05-security-and-i18n.md) — 安全模型、多語言與系統限制

### 04-AI-代理系統

- [01-orchestrator-and-agents.md](04-AI-代理系統/01-orchestrator-and-agents.md) — 調度器職責與專職 Agent 架構
- [02-agent-tools.md](04-AI-代理系統/02-agent-tools.md) — Agent 工具箱與 JSON Schema 規範

### 05-整合與部署

- [01-integration-and-deployment.md](05-整合與部署/01-integration-and-deployment.md) — 多 AI Provider 支援、API Key、Docker 部署
- [02-n8n-integration-guide.md](05-整合與部署/02-n8n-integration-guide.md) — Webhook 整合與 n8n 工作流串接

### 07-開發歷程

- [01-current-status.md](07-開發歷程/01-current-status.md) — 系統當前狀態與功能快照
- [02-known-issues.md](07-開發歷程/02-known-issues.md) — 已知問題與技術債（含修復狀態）
- [03-architecture-decisions.md](07-開發歷程/03-architecture-decisions.md) — 架構決策紀錄（ADR）

### 08-參考資料

- [01-shared-type-dictionary.md](08-參考資料/01-shared-type-dictionary.md) — @zenku/shared 完整型別字典
- [02-glossary.md](08-參考資料/02-glossary.md) — 術語表（中英對照）

---

## 待補文件

以下文件尚未撰寫，依優先級排列：

| 優先級 | 路徑 | 說明 |
| :--- | :--- | :--- |
| 高 | `04-AI-代理系統/03-agent-permissions.md` | Agent 權限矩陣與角色存取控制 |
| 高 | `05-整合與部署/03-api-key-auth.md` | API Key 認證機制完整說明 |
| 高 | `06-認證與權限/01-authentication.md` | 登入機制（Email + Password）、Session |
| 高 | `06-認證與權限/02-rbac.md` | 角色權限控制（admin / builder / user）|
| 中 | `08-參考資料/02-api-reference.md` | REST API 端點完整清單 |
| 中 | `08-參考資料/03-system-tables-reference.md` | 系統資料表 Schema 完整參考 |
| 低 | `05-整合與部署/04-chat-history.md` | 對話歷程管理三表設計 |
| 低 | `05-整合與部署/05-ai-observability.md` | Token 統計、成本追蹤、延遲監控 |
| 低 | `07-開發歷程/01-poc-to-mvp.md` | 從 PoC 到 MVP 的演進紀錄 |

---

## 撰寫原則

1. **現在式描述**：文件描述的是「系統現在如何運作」，不是「計劃要做什麼」。
2. **設計決策留存**：重要的取捨與設計決策要記錄原因（Why），不只是 What。
3. **程式碼範例優先**：使用實際的型別定義和程式碼範例，不用模糊的文字描述。
4. **中英術語並列**：首次出現的專業術語在括號內附上英文原文，並對齊 [術語表](08-參考資料/02-glossary.md)。
5. **互相連結**：文件之間要有清楚的相互引用。

---

*最後更新：2026-05-08 (Batch 6 - docs governance)*
