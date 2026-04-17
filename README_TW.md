# Zenku 

<div align="center">
  <img src=".assets/light_theme.png" alt="Zenku Light Theme Screenshot" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
</div>

> **Zenku** 是一個由 AI 驅動的**無代碼 (No-Code) 動態應用程式建構平台**與企業管理引擎。

透過自然語言對話，系統背後的多智能體 (Multi-Agent) 架構會自動產生對應的資料庫綱要 (Schema)、動態使用者介面 (UI View) 以及商業邏輯規則 (Business Rules)，並實時渲染出功能完全、響應式的現代化 Web 應用程式。

## 🌟 核心亮點 (Key Features)

* **對話即開發 (Chat-to-App)**：只要透過聊天下達指令，即可完成「建立資料表 → 產生 CRUD 介面 → 資料查詢與圖表」的完整系統開發迴圈。
* **資料驅動動態 UI (Data-Driven UI)**：前端沒有寫死的頁面。所有的表單、列表、看板、儀表板皆依靠後端的 `View Definition JSON` 動態裝載與即時渲染。
* **條件式即時渲染 (Conditional Appearance)**：支援客戶端即時判斷條件的渲染引擎。在欄位輸入的瞬間即可觸發其他欄位的隱藏、顏色改變、防呆唯讀等動態效果。
* **進階資料模型**：完整支援主檔與明細 (Master-Detail) 架構、外鍵 (Foreign Key) 關聯以及自動遠端資料搜尋。
* **事件驅動規則引擎 (Logic Engine)**：支援生命週期鉤子 (`before_insert`, `after_update`)，可自動撰寫扣抵庫存、驗證資料或觸發外部 Webhook (如 n8n) 的業務邏輯腳本。
* **AI 守門員與時光機**：
  * **Test Agent (防護護欄)**：執行刪除等破壞性操作前，AI 會強制模擬影響範圍並提出警告。
  * **Undo 時光機**：所有的架構變更都會被記錄至 `_zenku_journal` 中，具備完美的還原防呆能力。

## 🏗️ 系統架構 (Architecture)

本專案採用 Monorepo (`npm workspaces`) 架構，拆分為三大核心：

### 1. `@zenku/server` (後端大腦)
* **技術棧**：Node.js + Express + `node:sqlite`
* 作為控制大腦的 Orchestrator，掌管多個 LLM 工具執行代理 (Agents)，包含：
  * `schema-agent` (負責 DDL 與建表)
  * `ui-agent` (負責編寫與派發視圖 JSON)
  * `query-agent` (負責資料萃取)
  * `logic-agent` (負責業務邏輯防護)
* 內建產品級 AI 觀測系統，可精準追蹤 Token 成本、延遲與歷次 Tool Call JSON。

### 2. `@zenku/web` (前端解譯器)
* **技術棧**：React 19 + Vite + Tailwind CSS + shadcn/ui
* 由高度抽象的「通用畫布元件」(`TableView`, `FormView`, `MasterDetailView`) 組成。
* 動態整合 `@tanstack/react-table`、`recharts` 與 `@dnd-kit`，讓 AI 能憑空捏造出各種圖表與看板。

### 3. `@zenku/shared` (共用生態)
* 嚴謹維護的主從架構 TypeScript Schema、UI 條件解析器 (Appearance Validator) 與計算邏輯引擎 (Formula)。
## 🚀 快速入門 (Quick Start)

### 1. 開發者啟動步驟

在開始之前，請確保您的環境已安裝 **Node.js v18+**。

1. **取得專案並安裝依賴**：
   ```bash
   git clone https://github.com/antonylu0826/zenku-v2.git
   cd zenku
   npm install
   ```

2. **配置 AI 模型**：
   將 `.env.example` 複製為 `.env`，並填入您的 API Key（推薦使用 Anthropic Claude 3.5 Sonnet 或 OpenAI GPT-4o）：
   ```bash
   cp .env.example .env
   ```

3. **啟動系統**：
   ```bash
   npm run dev
   ```
   啟動後，開啟瀏覽器造訪 `http://localhost:5173`。

---

### 2. 五分鐘建立您的第一個 App

進到 Zenku 介面後，您可以直接在下方的對話框輸入自然語言指令：

*   **第一步：建立資料表**  
    輸入：`「幫我建立一個員工管理系統，需要包含姓名、職位、入職日期跟薪資欄位。」`
    *   *AI 會自動產生資料庫 Schema 並渲染出對應的表格介面。*

*   **第二步：自定義 UI 邏輯**  
    輸入：`「在員工表單中，如果薪資大於 10 萬，請將背景標示為金色，並將職位設為必填。」`
    *   *系統會即時更新 View Definition，觸發條件渲染 (Conditional Appearance)。*

*   **第三步：建立關聯與統計**  
    輸入：`「幫我增加一個部門表，並讓員工可以關聯到部門。最後幫我畫一個各部門人數的圓餅圖。」`
    *   *AI 會處理外鍵關聯並自動生成儀表板元件。*

---

希望 Zenku 能幫助您釋放創意，將複雜的開發過程轉化為簡單有趣的對話。**祝您開發愉快，玩得開心！** 🚀

## 📄 授權 (License)

本專案採用 [GPL v3 License](LICENSE) 授權。
