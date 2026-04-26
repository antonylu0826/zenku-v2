# Zenku 

[English](README.md)

<div align="center">
  <img src=".assets/light_theme.png" alt="Zenku Light Theme Screenshot" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
</div>

> **Zenku** 是一個由 AI 驅動的**無代碼 (No-Code) 動態應用程式建構平台**與企業管理引擎。

透過自然語言對話，系統背後的多智能體 (Multi-Agent) 架構會自動產生對應的資料庫綱要 (Schema)、動態使用者介面 (UI View) 以及商業邏輯規則 (Business Rules)，並實時渲染出功能完全、響應式的現代化 Web 應用程式。

## 🌟 核心亮點 (Key Features)

* **對話即開發 (Chat-to-App)**：只要透過聊天下達指令，即可完成「建立資料表 → 產生 CRUD 介面 → 資料查詢與圖表」的完整系統開發迴圈。
* **企業級多資料庫支援**：內建抽象資料適配層，完美支援 **SQLite**、**PostgreSQL** 與 **Microsoft SQL Server (MSSQL)**。
* **全能視圖系統 (Multi-View)**：除了標準表格，更支援 **看板 (Kanban)**、**行事曆 (Calendar)**、**甘特圖 (Gantt)**、**時間軸 (Timeline)**、**樹狀結構 (Tree)** 與 **畫廊 (Gallery)**。
* **進階控制項 (Advanced Controls)**：支援 **Markdown** 編輯器、**JSON** 編輯器、**自動編號 (Auto-Number)**、星級評分、顏色選擇器及貨幣格式化。
* **條件式即時渲染 (Conditional Appearance)**：支援客戶端即時判斷條件。在輸入瞬間即可觸發其他欄位的隱藏、顏色改變、防呆唯讀等動態效果。
* **事件驅動規則引擎 (Logic Engine)**：支援生命週期鉤子 (`before_insert`, `after_update`)，可自動撰寫扣抵庫存、驗證資料或觸發外部 Webhook (如 n8n) 的業務邏輯。
* **MCP 生態整合 (Model Context Protocol)**：支援 MCP 標準，讓外部 AI 工具（如 Claude Desktop）能直接與 Zenku 通訊，達成跨平台的數據操控與分析。
* **AI 安全護欄與還原**：
  * **Test Agent**：破壞性操作前會自動進行影響評估並預警。
  * **Undo 時光機**：完整記錄所有架構變更，支援一鍵還原至任意歷史狀態。

## 🏗️ 系統架構 (Architecture)

本專案採用 Monorepo (`npm workspaces`) 架構：

### 1. `@zenku/server` (後端大腦)
* **核心技術**：Node.js + Express + TypeScript
* **資料庫層**：具備強大的 Adapter 模式，可靈活切換不同生產級資料庫。
* **Orchestrator**：協調多個專業 LLM 工具代理，包含：
  * `schema-agent` (DDL 與建表)
  * `ui-agent` (視圖定義與佈局)
  * `query-agent` (自然語言轉 SQL)
  * `logic-agent` (自動化規則與防護)

### 2. `@zenku/web` (前端解譯器)
* **核心技術**：React 19 + Vite + Tailwind CSS + shadcn/ui
* **動態渲染**：由 `TableView`, `FormView`, `GanttView` 等高度抽象的元件構成，完全依據 JSON 定義即時產生成品。

### 3. `@zenku/shared` (共用生態)
* 嚴謹維護的 TypeScript 定義、公式計算引擎 (Formula) 與條件語意解析器。

## 🚀 快速入門 (Quick Start)

### 1. 開發者啟動步驟

1. **安裝依賴**：
   ```bash
   git clone https://github.com/antonylu0826/zenku-v2.git
   cd zenku
   npm install
   ```

2. **配置環境**：
   將 `.env.example` 複製為 `.env`，填入您的 API Key 與資料庫連接資訊：
   ```bash
   # 範例：切換為 MSSQL
   DB_TYPE=mssql
   DB_HOST=localhost
   DB_USER=sa
   DB_PASSWORD=YourPassword
   ```

3. **啟動系統**：
   ```bash
   npm run dev
   ```
   造訪 `http://localhost:5173` 開始體驗。

### 2. Docker 一鍵部署
```bash
docker-compose up -d
```

---

### 3. 五分鐘建立您的第一個 App

*   **建立專案管理系統**：  
    `「幫我建立一個專案追蹤系統，包含名稱、進度、開始與結束日期，並為我生成一個甘特圖視圖。」`
*   **設定自動化防呆**：  
    `「在訂單表單中，如果庫存量小於需求量，請阻止儲存並顯示『庫存不足』警告。」`
*   **跨系統整合**：  
    `「當新訂單建立後，請透過 Webhook 發送通知到我的 n8n 流程。」`

---

希望 Zenku 能幫助您釋放創意，將複雜的開發過程轉化為簡單有趣的對話。**祝您開發愉快！** 🚀

## 📄 授權 (License)

本專案採用 [GPL v3 License](LICENSE) 授權。
