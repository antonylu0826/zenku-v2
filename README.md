# Zenku 

[繁體中文](README_TW.md)

<div align="center">
  <img src=".assets/light_theme.png" alt="Zenku Light Theme Screenshot" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
</div>

> **Zenku** is an AI-powered **No-Code Dynamic Application Builder** and Enterprise Management Engine.

Through natural language conversations, the underlying Multi-Agent architecture automatically generates database schemas, dynamic UI views, and business logic rules, rendering a fully functional, responsive, and modern Web application in real-time.

## 🌟 Key Features

* **Chat-to-App Development**: Build a complete system loop (Schema -> CRUD UI -> Query & Charts) simply by chatting with AI.
* **Enterprise Multi-DB Support**: Built-in abstraction layer with native support for **SQLite**, **PostgreSQL**, and **Microsoft SQL Server (MSSQL)**.
* **Versatile View System**: Beyond standard tables, it supports **Kanban**, **Calendar**, **Gantt Chart**, **Timeline**, **Tree Structure**, and **Gallery** views.
* **Advanced Controls**: Integrated support for **Markdown** editor, **JSON** editor, **Auto-Numbering**, Star Rating, Color Picker, and Currency formatting.
* **Conditional Real-time Appearance**: A client-side evaluation engine that triggers field visibility, color changes, or read-only states instantly as the user types.
* **Event-Driven Logic Engine**: Lifecycle hooks (`before_insert`, `after_update`) for automating inventory deduction, data validation, or triggering external webhooks (e.g., n8n).
* **MCP Integration (Model Context Protocol)**: Full support for the MCP standard, allowing external AI tools (like Claude Desktop) to communicate directly with Zenku for cross-platform data manipulation.
* **AI Guardrails & Recovery**:
  * **Test Agent**: Automatically assesses the impact of destructive operations and provides warnings.
  * **Undo Time Machine**: Journals all structural changes, allowing one-click rollbacks to any historical state.

## 🏗️ Architecture

Zenku uses a Monorepo (`npm workspaces`) structure:

### 1. `@zenku/server` (The Brain)
* **Stack**: Node.js + Express + TypeScript
* **Database Layer**: Robust Adapter pattern for switching between production-grade databases.
* **Orchestrator**: Coordinates specialized LLM Tool Agents:
  * `schema-agent` (DDL & Schema Management)
  * `ui-agent` (View Definition & Layout)
  * `query-agent` (Natural Language to SQL)
  * `logic-agent` (Automation Rules & Guardrails)

### 2. `@zenku/web` (The Interpreter)
* **Stack**: React 19 + Vite + Tailwind CSS + shadcn/ui
* **Dynamic Rendering**: Composed of highly abstract components (`TableView`, `FormView`, `GanttView`) that render instantly based on JSON definitions.

### 3. `@zenku/shared` (Common Ecosystem)
* Strictly maintained TypeScript definitions, Formula calculation engine, and Appearance logic parser.

## 🚀 Quick Start

### 1. Developer Setup

1. **Install Dependencies**:
   ```bash
   git clone https://github.com/antonylu0826/zenku-v2.git
   cd zenku
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your API Key and DB credentials:
   ```bash
   # Example: Switch to MSSQL
   DB_TYPE=mssql
   DB_HOST=localhost
   DB_USER=sa
   DB_PASSWORD=YourPassword
   ```

3. **Launch**:
   ```bash
   npm run dev
   ```
   Visit `http://localhost:5173` to start.

### 2. One-Click Docker Deployment
```bash
docker-compose up -d
```

---

### 3. Build Your First App in 5 Minutes

*   **Project Management**:  
    `"Create a project tracking system with name, progress, start and end dates, and generate a Gantt chart view for me."`
*   **Automation & Validation**:  
    `"In the order form, if stock is less than demand, prevent saving and show an 'Insufficient Stock' warning."`
*   **Workflow Integration**:  
    `"When a new order is created, trigger a webhook to my n8n workflow."`

---

Zenku aims to unleash your creativity by turning complex development into a simple, fun conversation. **Happy Building!** 🚀

## 📄 License

This project is licensed under the [GPL v3 License](LICENSE).
