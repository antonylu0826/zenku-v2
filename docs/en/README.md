# Zenku Documentation Index (English)

> **Positioning:** This directory contains the official English technical documentation for Zenku,
> stored under `docs/en/`. It covers conceptual explanations, architectural design, functional
> specifications, and development logs. All documents are based on finalized design decisions,
> faithfully recording the current state of the system.

---

## Available Documents

### 01-Concept-and-Vision

- [01-zenku-concept.md](01-Concept-and-Vision/01-zenku-concept.md) — Positioning, core concepts, and architecture overview
- [02-design-philosophy.md](01-Concept-and-Vision/02-design-philosophy.md) — Key design decisions and trade-off principles

### 02-Architecture-Design

- [01-system-overview.md](02-Architecture-Design/01-system-overview.md) — System-wide view: Monorepo, tech stack, directory structure
- [02-multi-agent-architecture.md](02-Architecture-Design/02-multi-agent-architecture.md) — Orchestrator + Specialist Agents collaboration
- [03-dynamic-ui-rendering.md](02-Architecture-Design/03-dynamic-ui-rendering.md) — Data-driven UI rendering mechanism
- [04-database-design.md](02-Architecture-Design/04-database-design.md) — System tables, business table lifecycle, and mapping
- [05-development-environment.md](02-Architecture-Design/05-development-environment.md) — Environment setup and local startup guide

### 03-Functional-Specs

- [01-view-and-field-types.md](03-Functional-Specs/01-view-and-field-types.md) — Full specifications for view and field controls
- [02-actions-and-conditional-ui.md](03-Functional-Specs/02-actions-and-conditional-ui.md) — View actions and real-time appearance rules
- [03-business-rules-engine.md](03-Functional-Specs/03-business-rules-engine.md) — Automation: triggers and action types
- [04-design-journal-undo.md](03-Functional-Specs/04-design-journal-undo.md) — Design Journal and the Undo mechanism
- [05-security-and-i18n.md](03-Functional-Specs/05-security-and-i18n.md) — Security models, i18n, and system constraints

### 04-AI-Agent-System

- [01-orchestrator-and-agents.md](04-AI-Agent-System/01-orchestrator-and-agents.md) — Orchestrator responsibilities and Agent architecture
- [02-agent-tools.md](04-AI-Agent-System/02-agent-tools.md) — Agent toolkit and JSON Schema specifications

### 05-Integration-and-Deployment

- [01-integration-and-deployment.md](05-Integration-and-Deployment/01-integration-and-deployment.md) — External REST APIs, multi-AI providers, and Docker
- [02-n8n-integration-guide.md](05-Integration-and-Deployment/02-n8n-integration-guide.md) — Practical guide for connecting Zenku with n8n

### 07-Development-History

- [01-current-status.md](07-Development-History/01-current-status.md) — Feature milestones and current system boundaries

### 08-Reference

- [01-shared-type-dictionary.md](08-Reference/01-shared-type-dictionary.md) — Core type definitions from @zenku/shared

---

## Writing Principles

1. **Present Tense**: Documents describe "how the system works now," not "what is planned."
2. **Design Decision Persistence**: Record the "Why" behind major trade-offs, not just the "What."
3. **Code Examples First**: Use actual type definitions and code snippets instead of vague text.
4. **Glossary Alignment**: Maintain consistency with [zh-TW Glossary](../zh-TW/08-參考資料/02-glossary.md) for technical terminology.

---

*Last Updated: 2026-05-08 (Batch 6 - docs governance)*
