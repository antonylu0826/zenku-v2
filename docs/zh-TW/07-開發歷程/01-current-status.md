# 系統當前狀態 (Current Status)

> 本文件記錄了 Zenku 截至目前為止已實現的核心功能與系統邊界，作為後續開發與維運的參考基準。

---

## 1. 核心開發里程碑 (Feature Milestones)

Zenku 已從最初的對話建表 PoC，演進為一個具備完整業務承載能力的低程式碼開發平台。

### A. 介面與交互 (UI/UX)
*   **響應式佈局**：支援側邊欄摺疊、可拖拽的 AI 對話面板，以及對行動端的初步適配。
*   **進階視圖**：除基礎 Table 外，已完整支援 **Master-Detail (主從表)**、**Kanban (看板)**、**Dashboard (圖表看板)** 與 **Calendar (行事曆)**。
*   **主題支援**：整合 shadcn/ui，提供深色/淺色模式切換。

### B. 資料建模能力 (Data Modeling)
*   **複雜型別**：支援 20+ 種欄位控制項，包含 **Relation (關聯)**、**Computed (計算)** 與 **Auto-Number (自動編號)**。
*   **資料表特徵**：支援 **State Machine (狀態機)**，自動實現單據審核生命週期、步進 UI (Stepper) 與操作權限鎖定。
*   **條件渲染**：支援基於 `appearance` 引擎的即時表單隱藏/唯讀/變色規則。
*   **資料一致性**：整合 `node:sqlite` 底層，支援外鍵約束與 CASCADE 刪除。

### C. AI 代理系統 (AI Agents)
*   **多代理協作**：實現了 Orchestrator 統一調度 Schema, UI, Logic, Query 專職代理人的架構。
*   **設計日誌**：所有 AI 的 DDL 變更皆會寫入 `_zenku_journal`，支援多步回退 (Undo)。
*   **可觀測性**：後端完整追蹤每一輪對話的 Token 消耗、費用與 Latency。

---

## 2. 功能矩陣 (Capability Matrix)

| 分類 | 已實現功能 | 系統限制 |
| :--- | :--- | :--- |
| **資料庫** | SQLite, 跨表關聯, 計算欄位, 狀態機特徵 | 尚未正式支援大數據量的 PostgreSQL 分區優化 |
| **AI 模型** | Claude, GPT-4, Gemini, Ollama | 視供應商 API 穩定性而定 |
| **安全性** | RBAC 角色管控, API Key (Scopes) | 尚未實作行級 (Row-level) 資料隔離 |
| **自動化** | Webhook, 商業規則引擎, 回調機制 | 規則複雜度受限於運算式引擎 (formula.ts) |

---

## 3. 系統邊界 (System Boundaries)

*   **資料容量**：建議在 SQLite 環境下保持單表資料量在 100 萬筆以內。
*   **附件存儲**：檔案預設存儲於本地磁碟，尚未支援 S3 等對象存儲適配。
*   **AI 頻率限制**：受限於底層 Rate Limiter 配置（預設 60 RPM）。
