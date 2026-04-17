# Zenku 

[繁體中文](README_TW.md)

<div align="center">
  <img src=".assets/light_theme.png" alt="Zenku Light Theme Screenshot" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
</div>

> **Zenku** is an AI-powered **No-Code dynamic application building platform** and enterprise management engine.

Through natural language conversation, the underlying Multi-Agent architecture automatically generates database schemas, dynamic User Interfaces (UI Views), and business logic rules, rendering fully functional and responsive modern Web applications in real-time.

## 🌟 Key Features

* **Chat-to-App**: Complete the entire development cycle of "creating tables → generating CRUD interfaces → data querying and charting" simply by chatting.
* **Data-Driven Dynamic UI**: No hardcoded pages on the frontend. All forms, lists, kanbans, and dashboards are dynamically loaded and rendered in real-time based on the backend's `View Definition JSON`.
* **Conditional Appearance**: A rendering engine that supports real-time condition evaluation on the client side. Instantly trigger dynamic effects like hiding fields, changing colors, or setting read-only status the moment a field is updated.
* **Advanced Data Modeling**: Full support for Master-Detail architectures, Foreign Key relationships, and automatic remote data searching.
* **Event-Driven Logic Engine**: Supports lifecycle hooks (`before_insert`, `after_update`) to automatically write business logic scripts for inventory deduction, data validation, or triggering external webhooks (e.g., n8n).
* **AI Guardian & Time Machine**:
  * **Test Agent (Guardrails)**: Before performing destructive operations like deletions, the AI simulates the impact range and provides a warning.
  * **Undo Time Machine**: All architecture changes are recorded in `_zenku_journal`, providing perfect recovery and foolproof capabilities.

## 🏗️ Architecture

This project adopts a Monorepo (`npm workspaces`) architecture, divided into three core packages:

### 1. `@zenku/server` (The Brain)
* **Tech Stack**: Node.js + Express + `node:sqlite`
* Acts as the Orchestrator, managing multiple LLM tool execution agents, including:
  * `schema-agent` (Responsible for DDL and table creation)
  * `ui-agent` (Responsible for writing and dispatching View JSON)
  * `query-agent` (Responsible for data extraction)
  * `logic-agent` (Responsible for business logic protection)
* Built-in production-grade AI observability system to precisely track Token costs, latency, and Tool Call JSON history.

### 2. `@zenku/web` (The Interpreter)
* **Tech Stack**: React 19 + Vite + Tailwind CSS + shadcn/ui
* Composed of highly abstracted "Generic Canvas Components" (`TableView`, `FormView`, `MasterDetailView`).
* Dynamically integrates `@tanstack/react-table`, `recharts`, and `@dnd-kit`, allowing the AI to create various charts and kanbans from scratch.

### 3. `@zenku/shared` (Common Ecosystem)
* Maintains strict Master-Detail TypeScript Schemas, UI Condition Parsers (Appearance Validator), and calculation logic engines (Formula).

## 🚀 Quick Start

### 1. Developer Setup

Before you begin, ensure you have **Node.js v18+** installed.

1. **Clone the project and install dependencies**:
   ```bash
   git clone https://github.com/antonylu0826/zenku-v2.git
   cd zenku
   npm install
   ```

2. **Configure AI Models**:
   Copy `.env.example` to `.env` and fill in your API Key (Anthropic Claude 3.5 Sonnet or OpenAI GPT-4o recommended):
   ```bash
   cp .env.example .env
   ```

3. **Start the system**:
   ```bash
   npm run dev
   ```
   Once started, open your browser and visit `http://localhost:5173`.

---

### 2. Build Your First App in Five Minutes

Once in the Zenku interface, you can enter natural language commands directly into the chat box:

* **Step 1: Create a Table**
  Enter: `"Help me create an employee management system including Name, Position, Join Date, and Salary fields."`
  * *The AI will automatically generate the database schema and render the corresponding table interface.*

* **Step 2: Customize UI Logic**
  Enter: `"In the employee form, if the salary is greater than 100k, highlight the background in gold and make the Position field required."`
  * *The system will update the View Definition in real-time, triggering Conditional Appearance.*

* **Step 3: Establish Relationships and Analytics**
  Enter: `"Help me add a Department table and link employees to departments. Finally, draw a pie chart showing the number of people in each department."`
  * *The AI will handle foreign key relationships and automatically generate dashboard components.*

---

We hope Zenku helps you unleash your creativity and transform complex development processes into simple, fun conversations. **Happy developing and have fun!** 🚀

## 📄 License

This project is licensed under the [GPL v3 License](LICENSE).
