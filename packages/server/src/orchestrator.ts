import { getAllSchemas, getAllViews, getAllRules } from './db';
import { runSchemaAgent } from './agents/schema-agent';
import { runUiAgent } from './agents/ui-agent';
import { runQueryAgent } from './agents/query-agent';
import { runLogicAgent } from './agents/logic-agent';
import { runTestAgent } from './agents/test-agent';
import { writeData } from './tools/db-tools';
import { undoLast, undoById, undoSince, buildJournalContext } from './tools/journal-tools';
import { createProvider, getDefaultProviderName, getDefaultModel } from './ai';
import {
  createChatSession, updateSessionTitle, updateSessionStats,
  recordMessage, recordToolEvent, toolToAgent,
} from './tools/chat-logger';
import type { ToolDefinition } from './ai';
import type { ViewDefinition, LLMMessage, ToolResult, AIProvider as AIProviderName } from './types';

// ===== Column definition (shared between create_table and alter_table) =====

const COLUMN_DEF_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'Field name (lowercase with underscores)' },
    type: {
      type: 'string',
      enum: ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE', 'DATETIME'],
    },
    required: { type: 'boolean' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of allowed values for enum-type fields',
    },
    references: {
      type: 'object',
      description: 'Foreign key reference. This field references a column in the target table (default: id)',
      properties: {
        table: { type: 'string', description: 'Target table name' },
        column: { type: 'string', description: 'Target field, default id' },
      },
      required: ['table'],
    },
  },
  required: ['name', 'type'],
};

// ===== Form field schema (for manage_ui) =====

const FORM_FIELD_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: { type: 'string', description: 'Database field name' },
    label: { type: 'string', description: 'Field label (for UI display)' },
    type: {
      type: 'string',
      enum: [
        'text', 'number', 'select', 'boolean', 'date', 'textarea',
        'relation', 'currency', 'phone', 'email', 'url',
      ],
    },
    required: { type: 'boolean' },
    placeholder: { type: 'string' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'Static dropdown options (for select type)',
    },
    source: {
      type: 'object',
      description: 'Dynamic dropdown source (replaces static options, loads from another table in real-time)',
      properties: {
        table: { type: 'string' },
        value_field: { type: 'string', description: 'Field to store in form (e.g., name)' },
        display_field: { type: 'string', description: 'Field to display in dropdown' },
      },
      required: ['table', 'value_field', 'display_field'],
    },
    relation: {
      type: 'object',
      description: 'Relation field definition (required when type is relation). Uses searchable dropdown and stores value_field',
      properties: {
        table: { type: 'string', description: 'Related table name' },
        value_field: { type: 'string', description: 'Field to store (usually id)' },
        display_field: { type: 'string', description: 'Field to display in dropdown (e.g., name)' },
      },
      required: ['table', 'value_field', 'display_field'],
    },
    computed: {
      type: 'object',
      description: 'Computed field. Formula references field names like "quantity * unit_price". Computed on both frontend and backend',
      properties: {
        formula: { type: 'string', description: 'Calculation formula supporting + - * / and parentheses' },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of field names referenced in the formula',
        },
        format: {
          type: 'string',
          enum: ['currency', 'number', 'percent'],
          description: 'Display format',
        },
      },
      required: ['formula', 'dependencies'],
    },
    hidden_in_form: {
      type: 'boolean',
      description: 'Permanently hide this field from the form (static). Use appearance[] for conditional hiding instead.',
    },
    hidden_in_table: {
      type: 'boolean',
      description: 'Permanently hide this field from the table list (static).',
    },
    appearance: {
      type: 'array',
      description: `Conditional appearance rules evaluated client-side in real time as the user fills in the form.
Each rule has a condition (when) and an effect (apply). Rules are applied in order; later rules override earlier ones when multiple conditions match.
Supported operators: eq, neq, gt, lt, gte, lte, contains.
Typical use cases:
- Hide a field unless another field has a specific value (e.g., show tax_id only when customer_type eq "company")
- Make all fields read-only when status eq "completed"
- Highlight a value in red when amount gt 10000
- Make a field required when a related field is filled`,
      items: {
        type: 'object',
        properties: {
          when: {
            type: 'object',
            description: 'Condition based on current form values. Field must be a key present in the same form.',
            properties: {
              field: { type: 'string', description: 'Form field key to evaluate (must exist in same form)' },
              operator: {
                type: 'string',
                enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'],
              },
              value: { description: 'Value to compare against' },
            },
            required: ['field', 'operator'],
          },
          apply: {
            type: 'object',
            description: 'Effect to apply when condition is true',
            properties: {
              visibility: {
                type: 'string',
                enum: ['hidden', 'visible'],
                description: '"hidden" hides the field; "visible" shows it (use to override a default-hidden field)',
              },
              enabled: {
                type: 'boolean',
                description: 'false = field becomes read-only/disabled',
              },
              required: {
                type: 'boolean',
                description: 'true = field becomes required when condition is met',
              },
              text_color: {
                type: 'string',
                description: 'CSS color value, e.g. "#dc2626" (red) or "#16a34a" (green)',
              },
              bg_color: {
                type: 'string',
                description: 'Background color for the field cell',
              },
              font_weight: {
                type: 'string',
                enum: ['normal', 'bold'],
              },
            },
          },
        },
        required: ['when', 'apply'],
      },
    },
  },
  required: ['key', 'label', 'type'],
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'manage_schema',
    description: `Create or modify database table schema.

After creating a new table, you must call manage_ui to create the corresponding interface.

Field type mapping:
- Plain text → TEXT
- Number (integer) → INTEGER
- Number (decimal/currency) → REAL
- Yes/No → BOOLEAN
- Date → DATE
- DateTime → DATETIME
- Reference to another table → INTEGER + references: { table: 'target_table' }`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_table', 'alter_table', 'describe_tables'],
          description: 'Type of action to perform',
        },
        table_name: {
          type: 'string',
          description: 'Table name (lowercase English with underscores)',
        },
        columns: {
          type: 'array',
          description: 'Field definitions for create_table',
          items: COLUMN_DEF_SCHEMA,
        },
        changes: {
          type: 'array',
          description: 'Changes for alter_table',
          items: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add_column'] },
              column: COLUMN_DEF_SCHEMA,
            },
            required: ['operation', 'column'],
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_ui',
    description: `Create or update user interface. Type determines layout:

Type selection guide:
- table: General list management (default)
- master-detail: Master + details (e.g., orders + order items), requires detail_views
- dashboard: Statistics panel, requires widgets (no columns/form needed)
- kanban: Kanban board with drag-drop, requires kanban (group_field, title_field)
- calendar: Calendar view, requires calendar (date_field, title_field)

Field type determines frontend rendering (for table/master-detail):
- text/number/date/boolean/textarea: Basic input
- select + options: Static dropdown
- relation + relation: Related field (searchable dropdown, stores id)
- currency: Currency amount (with thousand separators)
- computed: Only set in form.fields, use number type in columns

form.columns controls form column count:
- General table view default is 1 (optional or 1)
- master-detail with many main fields suggest 2; use 3 when fields exceed 8

group controls sidebar grouping:
- Omit for ungrouped views (shown at top)
- Set to a short label (e.g., "採購", "庫存") to cluster related views under a collapsible section

When users say "statistics/kanban/calendar", directly create a view of that type without needing a table first.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_view', 'update_view', 'get_view'],
          description: 'get_view: fetch the full current definition of a view (use before update_view to preserve existing fields/actions)',
        },
        view_id: {
          type: 'string',
          description: 'Required for get_view: the view ID to fetch',
        },
        view: {
          type: 'object',
          description: 'View definition object',
          properties: {
            id: { type: 'string', description: 'Unique ID, usually matches table_name' },
            name: { type: 'string', description: 'Display name' },
            table_name: { type: 'string' },
            type: { type: 'string', enum: ['table', 'master-detail', 'dashboard', 'kanban', 'calendar'] },
            group: { type: 'string', description: 'Sidebar group name; views with the same group are displayed together under a collapsible section' },
            columns: {
              type: 'array',
              description: 'List field definitions',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Database field name' },
                  label: { type: 'string', description: 'Column label' },
                  type: {
                    type: 'string',
                    enum: [
                      'text', 'number', 'select', 'boolean', 'date',
                      'relation', 'currency', 'phone', 'email', 'url', 'enum',
                    ],
                  },
                  sortable: { type: 'boolean' },
                  relation: {
                    type: 'object',
                  description: 'Display settings for relation type in list',
                  properties: {
                    table: { type: 'string' },
                    display_field: { type: 'string', description: 'Which field from related table to display' },
                    },
                    required: ['table', 'display_field'],
                  },
                },
                required: ['key', 'label', 'type'],
              },
            },
            form: {
              type: 'object',
              properties: {
                columns: {
                  type: 'number',
                  enum: [1, 2, 3],
                  description: 'Form column count (default 1; suggest 2 for master-detail main form, use 3 for 8+ fields)',
                },
                fields: {
                  type: 'array',
                  description: 'Form field definitions',
                  items: FORM_FIELD_SCHEMA,
                },
              },
              required: ['fields'],
            },
            actions: {
              type: 'array',
              description: 'Built-in string actions and/or custom action objects.',
              items: {
                oneOf: [
                  {
                    type: 'string',
                    enum: ['create', 'edit', 'delete', 'export'],
                    description: 'Built-in CRUD action',
                  },
                  {
                    type: 'object',
                    description: 'Custom action button',
                    properties: {
                      id:      { type: 'string', description: 'Unique action ID (lowercase underscore)' },
                      label:   { type: 'string', description: 'Button label' },
                      icon:    { type: 'string', description: 'Lucide icon name, e.g. "check-circle", "truck"' },
                      variant: { type: 'string', enum: ['default', 'outline', 'secondary', 'destructive', 'warning'] },
                      context: {
                        type: 'string',
                        enum: ['record', 'list', 'both'],
                        description: 'record = detail form toolbar; list = table row; both = everywhere. Default: record',
                      },
                      visible_when: {
                        type: 'object',
                        description: 'Condition to show the button (same schema as AppearanceCondition)',
                        properties: {
                          field:    { type: 'string' },
                          operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'] },
                          value:    {},
                        },
                        required: ['field', 'operator'],
                      },
                      enabled_when: {
                        type: 'object',
                        description: 'Condition to enable the button; disabled when not met',
                        properties: {
                          field:    { type: 'string' },
                          operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'] },
                          value:    {},
                        },
                        required: ['field', 'operator'],
                      },
                      behavior: {
                        type: 'object',
                        properties: {
                          type: {
                            type: 'string',
                            enum: ['set_field', 'trigger_rule', 'webhook', 'navigate', 'create_related'],
                          },
                          field:             { type: 'string', description: 'set_field: target field name' },
                          value:             { type: 'string', description: 'set_field: value to set' },
                          rule_id:           { type: 'string', description: 'trigger_rule: rule ID' },
                          url:               { type: 'string', description: 'webhook: URL' },
                          method:            { type: 'string', enum: ['GET', 'POST'], description: 'webhook: HTTP method' },
                          payload:           { type: 'string', description: 'webhook: JSON template, use {{field}} for record values' },
                          view_id:           { type: 'string', description: 'navigate: target view ID' },
                          filter_field:      { type: 'string', description: 'navigate: filter field in target view' },
                          filter_value_from: { type: 'string', description: 'navigate: field from current record to use as filter value' },
                          table:             { type: 'string', description: 'create_related: target table' },
                          field_mapping:     { type: 'object', description: 'create_related: { targetField: sourceFieldOrLiteral }' },
                        },
                        required: ['type'],
                      },
                      confirm: {
                        type: 'object',
                        description: 'Show a confirmation dialog before executing',
                        properties: {
                          title:       { type: 'string' },
                          description: { type: 'string' },
                        },
                        required: ['title', 'description'],
                      },
                    },
                    required: ['id', 'label', 'behavior'],
                  },
                ],
              },
            },
          },
          detail_views: {
              type: 'array',
              description: 'Detail definitions for master-detail type',
              items: {
                type: 'object',
                properties: {
                  table_name: { type: 'string', description: 'Detail table name' },
                  foreign_key: { type: 'string', description: 'Foreign key field in detail table pointing to master' },
                  tab_label: { type: 'string', description: 'Tab label' },
                  view: {
                    type: 'object',
                    description: 'View definition for details (must be table type)',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      table_name: { type: 'string' },
                      type: { type: 'string', enum: ['table'] },
                      columns: { type: 'array', items: { type: 'object' } },
                      form: { type: 'object' },
                      actions: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id', 'name', 'table_name', 'type', 'columns', 'form', 'actions'],
                  },
                },
                required: ['table_name', 'foreign_key', 'tab_label', 'view'],
              },
            },
          widgets: {
            type: 'array',
            description: 'Widget list for dashboard type',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['stat_card', 'bar_chart', 'line_chart', 'pie_chart', 'mini_table'] },
                title: { type: 'string', description: 'Widget title' },
                query: { type: 'string', description: 'SELECT SQL (must be SELECT)' },
                size: { type: 'string', enum: ['sm', 'md', 'lg', 'full'] },
                position: {
                  type: 'object',
                  properties: { row: { type: 'number' }, col: { type: 'number' } },
                  required: ['row', 'col'],
                },
                config: {
                  type: 'object',
                    description: 'Chart config: x_key, y_key, label_key, value_key, color',
                },
              },
              required: ['id', 'type', 'title', 'query', 'size', 'position'],
            },
          },
          kanban: {
            type: 'object',
            description: 'Settings for kanban type',
            properties: {
              group_field: { type: 'string' },
              title_field: { type: 'string' },
              description_field: { type: 'string' },
            },
            required: ['group_field', 'title_field'],
          },
          calendar: {
            type: 'object',
            description: 'Settings for calendar type',
            properties: {
              date_field: { type: 'string' },
              title_field: { type: 'string' },
              color_field: { type: 'string' },
            },
            required: ['date_field', 'title_field'],
          },
          required: ['id', 'name', 'table_name', 'type'],
        },
      },
      required: ['action', 'view'],
    },
  },
  {
    name: 'query_data',
    description: 'Query data and answer statistics questions. Can only execute SELECT queries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SELECT SQL statement' },
        explanation: { type: 'string', description: 'What this query does' },
      },
      required: ['sql', 'explanation'],
    },
  },
  {
    name: 'write_data',
    description: `Perform insert, update, or delete operations on user data tables. Cannot operate on system tables (_zenku_ prefix).

Operation guide:
- insert: Add a new record, populate data with field values
- update: Update records matching where condition, populate data with update values, where is required filter (mandatory to prevent full table updates)
- delete: Delete records matching where condition, where is required condition (mandatory to prevent full table deletion)

Note: where is a required safety guard for update/delete, cannot be omitted.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          enum: ['insert', 'update', 'delete'],
          description: 'Operation type',
        },
        table: {
          type: 'string',
          description: 'Target table name (lowercase English with underscores, cannot be system table)',
        },
        data: {
          type: 'object',
          description: 'Field values for insert/update (key is field name, value is value to write)',
        },
        where: {
          type: 'object',
          description: 'Filter conditions for update/delete (key is field name, value is match value). Required for update/delete',
        },
      },
      required: ['operation', 'table'],
    },
  },
  {
    name: 'manage_rules',
    description: `Create or modify business rules (automation flows, validation).

Rules execute automatically before/after CRUD operations:
- before_insert / before_update / before_delete: Can intercept, modify data, validate
- after_insert / after_update / after_delete: Can trigger side effects (webhooks, create records)

Action types:
- set_field: Set field value (value can be formula like "total * 0.9")
- validate: Validation rule (reject operation if condition met, return message)
- create_record: Insert new record in another table
- update_record: Update existing record in another table, suitable for 1:1 relationships
- update_related_records: Batch update target table via intermediate detail table (suitable for 1:many, e.g., purchase_order → items → inventory)
- webhook: Call external URL
- notify: Record notification

Condition operators: eq, neq, gt, lt, gte, lte, contains, changed, was_eq, was_neq
- was_eq: Old value equals value before trigger (good for "status changed from X" in after_update rules)
- was_neq: Old value not equals value (e.g., trigger only if previous status was not draft)

Condition field supports FK paths (cross-table conditions):
- To check customer tier in order_items rule, use condition.field "order_id.customer_id.tier"
- Engine automatically traverses FK chain: order_items.order_id → orders → orders.customer_id → customers → customers.tier`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_rule', 'update_rule', 'delete_rule', 'list_rules'],
        },
        rule_id: { type: 'string', description: 'Rule ID for update_rule/delete_rule' },
        table_name: { type: 'string', description: 'Filter specific table in list_rules' },
        rule: {
          type: 'object',
          description: 'Rule definition (required for create_rule/update_rule)',
          properties: {
            name: { type: 'string', description: 'Rule name' },
            description: { type: 'string' },
            table_name: { type: 'string', description: 'Table this rule applies to' },
            trigger_type: {
              type: 'string',
              enum: ['before_insert', 'after_insert', 'before_update', 'after_update', 'before_delete', 'after_delete', 'manual'],
              description: 'manual = triggered by a custom ViewAction button (trigger_rule behavior)',
            },
            condition: {
              type: 'object',
              description: 'Trigger condition (not set = always trigger). Field supports FK paths: e.g., for order_items to check customer tier, use "order_id.customer_id.tier" (traverses FK chain)',
              properties: {
                field: {
                  type: 'string',
                  description: 'Field name. Can use FK dot path to cross tables, e.g., "order_id.customer_id.tier"',
                },
                operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'changed', 'was_eq', 'was_neq'] },
                value: {},
              },
              required: ['field', 'operator'],
            },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['set_field', 'validate', 'create_record', 'update_record', 'update_related_records', 'webhook', 'notify'] },
                  field: { type: 'string', description: 'Target field for set_field' },
                  value: { type: 'string', description: 'Value or formula for set_field' },
                  message: { type: 'string', description: 'Error message for validate' },
                  target_table: { type: 'string', description: 'Target table for create/update record actions' },
                  record_data: { type: 'object', description: 'Field mapping (field_name -> expression). In update_related_records, use detail field names directly, and prefix target table existing values with __old_, e.g., "__old_quantity + quantity"' },
                  where: { type: 'object', description: 'update_record / update_related_records: Condition to locate target records. Key is target table field, value is source expression. Example: { product_id: "product_id" }' },
                  via_table: { type: 'string', description: 'Intermediate detail table for update_related_records (e.g., purchase_order_items)' },
                  via_foreign_key: { type: 'string', description: 'FK field in detail table pointing to source table (e.g., purchase_order_id)' },
                  url: { type: 'string', description: 'webhook URL' },
                  method: { type: 'string', description: 'webhook HTTP 方法，預設 POST' },
                  text: { type: 'string', description: 'Notification text' },
                },
                required: ['type'],
              },
            },
            priority: { type: 'number', description: 'Priority (smaller number executes first), default 0' },
          },
          required: ['name', 'table_name', 'trigger_type', 'actions'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'assess_impact',
    description: `Assess impact of destructive schema changes. Must call this tool before executing drop_column, rename_column, change_type, or drop_table.
Reports affected interfaces, rules, record count, and foreign key dependencies.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        table_name: { type: 'string', description: 'Table name to modify' },
        change_type: {
          type: 'string',
          enum: ['drop_column', 'rename_column', 'change_type', 'drop_table'],
        },
        details: {
          type: 'object',
          properties: {
            column_name: { type: 'string' },
            new_name: { type: 'string' },
            new_type: { type: 'string' },
          },
        },
      },
      required: ['table_name', 'change_type'],
    },
  },
  {
    name: 'undo_action',
    description: `Undo previous operations. Call when user says "undo", "cancel last action", or "revert to previous version".
- target=last: Undo most recent reversible operation
- target=by_id: Undo operation by journal id
- target=by_time: Undo all operations after specified time (batch rollback)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          enum: ['last', 'by_id', 'by_time'],
        },
        journal_id: { type: 'number', description: 'Journal record ID when target=by_id' },
        since: { type: 'string', description: 'ISO timestamp when target=by_time (e.g., "2026-04-14 09:00:00")' },
      },
      required: ['target'],
    },
  },
];

function buildSystemPrompt(): string {
  const schemas = getAllSchemas();
  const views = getAllViews();

  const schemaStr = Object.keys(schemas).length > 0
    ? Object.entries(schemas).map(([table, cols]) =>
        `Table ${table}: ${cols.map(c => `${c.name}(${c.type})`).join(', ')}`
      ).join('\n')
    : '(No tables yet)';

  const viewStr = views.length > 0
    ? views.map(v => `- ${v.name} (Source Table: ${v.table_name})`).join('\n')
    : '(No interfaces yet)';

  return `You are the Zenku Orchestrator. Users describe their needs, and you build the application.

Available Tools:
- manage_schema: Create or modify table structures.
- manage_ui: Create or update user interfaces (list + form).
- query_data: Query data or answer statistics questions (SELECT only).
- write_data: Insert, update, or delete records in user data tables (cannot operate on system tables).
- manage_rules: Create or modify business rules (automation, validation, triggers).
- assess_impact: Assess impact of destructive schema changes (must call before modification).

Critical Rules:
1. New Data Type: manage_schema (create_table) first, then manage_ui (create_view).
2. Modify Structure: manage_schema (alter_table) first, then manage_ui (update_view).
3. Statistics queries: Use query_data.
4. Naming: Use English lowercase underscores for tables and fields.
5. Language: ALL responses to the user must be in Traditional Chinese.
6. Identity: View ID should usually match its table_name.
7. Modifying an existing view: ALWAYS call manage_ui (get_view) first to retrieve the current definition, then apply your changes and call update_view with the COMPLETE modified definition. Never write a partial definition — it will overwrite and lose existing fields, columns, and actions.

Relation Guidance (e.g., "Orders link to Customers"):
1. manage_schema: Field uses INTEGER + references: { table: 'customers' }.
2. manage_ui columns: type uses 'relation', relation: { table: 'customers', display_field: 'name' }.
3. manage_ui form.fields: type uses 'relation', relation: { table: 'customers', value_field: 'id', display_field: 'name' }.

Dynamic Select (e.g., "Category loaded from category table"):
1. Ensure source table exists.
2. form.fields: type 'select', set source: { table: 'categories', value_field: 'name', display_field: 'name' }.

One-to-Many Relationships (e.g., "Order + Order Items"):
1. manage_schema -> Build master table (e.g., orders).
2. manage_schema -> Build detail table (e.g., order_items) with foreign key: INTEGER + references: { table: 'orders' }.
3. manage_ui -> Create master-detail view, type 'master-detail', define details in detail_views.
   - detail_views[0].foreign_key: Field in detail table pointing to master (e.g., 'order_id').
   - detail_views[0].view.type must be 'table'.
   - Detail form fields do not need the foreign key field (system injection).

Computed Fields (e.g., "Subtotal = Quantity * Price"):
1. manage_schema: Field type REAL.
2. manage_ui form.fields: Add computed: { formula: 'quantity * unit_price', dependencies: ['quantity', 'unit_price'], format: 'currency' }.
3. manage_ui columns: type 'currency' or 'number'.

Visualization Interfaces:
- Statistics / Dashboard ("Show me XXX stats") -> manage_ui, type: 'dashboard', widgets array.
  - stat_card: Single number, query returns { value: N }.
  - bar_chart / line_chart: Query returns [{ label, value }], set config.x_key / y_key.
  - pie_chart: Query returns [{ label, value }], set config.label_key / value_key.
  - dashboard does NOT need columns / form / actions.
- Kanban -> manage_ui, type: 'kanban', set kanban: { group_field, title_field }.
  - group_field should be a select type with options (e.g., status).
  - Still require columns and form (for list mode fallback).
- Calendar -> manage_ui, type: 'calendar', set calendar: { date_field, title_field }.
  - Still require columns and form.

Business Rules (e.g., "90% discount for VIPs"):
1. manage_rules -> create_rule.
2. trigger_type: before_insert (modification/validation), after_insert (side effects).
3. condition.field: Supports FK dot path, e.g., "order_id.customer_id.tier".
4. actions:
   - set_field: Modify field values of source record.
   - validate: Reject operation with message.
   - create_record: INSERT into another table.
   - update_record: UPDATE record in another table via where condition and record_data.
   - update_related_records: Batch update multiple records via intermediate table (e.g., order -> items -> inventory).
     - via_table: Intermediate detail table.
     - via_foreign_key: FK in detail table pointing to source.
     - target_table: Table to update.
     - where: Mapping between target table fields and source/detail fields.
     - record_data: Update expressions, target current value is prefixed with __old_.
   - webhook: Call external URL.

Destructive Schema Changes (drop_column, rename_column, change_type, drop_table):
1. Must call assess_impact first.
2. Report impact to user.
3. Proceed with manage_schema only after user confirmation.

Conditional Appearance (動態 UI 呈現):
Use appearance[] on form fields to change how a field looks or behaves based on other field values. This is evaluated client-side in real time — no extra server calls.

Common patterns:
1. Show a field only when another field has a specific value ("統編欄位只在公司戶時顯示"):
   appearance: [{ when: { field: "customer_type", operator: "neq", value: "company" }, apply: { visibility: "hidden" } }]

2. Make all fields read-only after a status is set ("已完成後全部唯讀"):
   On each editable field: appearance: [{ when: { field: "status", operator: "eq", value: "completed" }, apply: { enabled: false } }]

3. Highlight a value in red when it exceeds a threshold ("金額超過10000標紅"):
   appearance: [{ when: { field: "amount", operator: "gt", value: 10000 }, apply: { text_color: "#dc2626", font_weight: "bold" } }]

4. Make a field required conditionally ("選擇信用卡時才必填卡號"):
   appearance: [{ when: { field: "payment_method", operator: "eq", value: "credit_card" }, apply: { required: true } }]

5. Multiple rules on same field (later rules override earlier when both match):
   appearance: [
     { when: { field: "score", operator: "gte", value: 80 }, apply: { text_color: "#16a34a" } },
     { when: { field: "score", operator: "lt", value: 60 }, apply: { text_color: "#dc2626" } }
   ]

Important constraints:
- appearance[] only works in form.fields (not columns).
- The "field" in "when" must be a key that exists in the same form.
- For permanent hiding, use hidden_in_form: true instead of appearance[].
- For cross-table conditions (e.g., check customer tier), use Business Rules (manage_rules) instead — appearance only accesses current form values.
- To remove a conditional appearance rule, call manage_ui (update_view) and omit the appearance property from that field.

Custom ViewActions (自訂動作按鈕):
To add a custom action to an existing view, always follow this sequence:
1. manage_ui({ action: 'get_view', view_id: '...' }) — get current full definition
2. Add the new action object into definition.actions[]
3. manage_ui({ action: 'update_view', view: { ...full modified definition } })

Add custom buttons to record forms or table rows via the actions array. Mix built-in strings with custom objects.

behavior types:
1. set_field — Change a field value on the record. Best for status transitions.
   { type: 'set_field', field: 'status', value: 'approved' }

2. trigger_rule — Execute a business rule with trigger_type='manual'. (Phase 4.2, coming soon)
   { type: 'trigger_rule', rule_id: '<rule_id>' }

3. webhook — Call an external URL with record data. Use {{field}} in payload to inject record field values.
   { type: 'webhook', url: 'https://...', method: 'POST', payload: '{"id":"{{id}}","status":"{{status}}"}' }

4. navigate — Navigate to another View (client-side only). Optionally pass a filter from the current record.
   { type: 'navigate', view_id: 'orders', filter_field: 'customer_id', filter_value_from: 'id' }

5. create_related — Insert a new record in another table. field_mapping keys are target fields; values are source field names (from current record) or literals.
   { type: 'create_related', table: 'shipments', field_mapping: { order_id: 'id', status: 'pending' } }

context rules:
- 'record' (default): button appears in the detail form header (MasterDetailView)
- 'list': button appears in each table row's actions column
- 'both': appears in both places

Common patterns:
- Status transition with confirmation: set_field + confirm { title, description } + visible_when condition
- "核准" button visible only when status=pending: visible_when: { field: 'status', operator: 'eq', value: 'pending' }
- Notify external system after user action: webhook
- Jump to related view: navigate with filter_field + filter_value_from

Example — "核准訂單" button on a master-detail record form:
{
  id: 'approve',
  label: '核准',
  variant: 'default',
  context: 'record',
  visible_when: { field: 'status', operator: 'eq', value: 'pending' },
  behavior: { type: 'set_field', field: 'status', value: 'approved' },
  confirm: { title: '確認核准', description: '核准後將通知採購部門，此操作無法復原。' }
}

Example — "出貨" button that creates a shipment record:
{
  id: 'ship',
  label: '出貨',
  variant: 'outline',
  context: 'record',
  visible_when: { field: 'status', operator: 'eq', value: 'approved' },
  behavior: { type: 'create_related', table: 'shipments', field_mapping: { order_id: 'id', status: 'shipped' } },
  confirm: { title: '建立出貨記錄', description: '將為此訂單建立出貨記錄。' }
}

Field Type Guide:
- Currency -> schema: REAL, ui type: currency.
- Phone -> schema: TEXT, ui type: phone.
- Email -> schema: TEXT, ui type: email.
- URL -> schema: TEXT, ui type: url.
- Status/Category (Fixed) -> schema: TEXT, ui type: select + options.
- Status/Category (Dynamic) -> schema: TEXT, ui type: select + source.

Current Database:
${schemaStr}

Current Interfaces:
${viewStr}

Current Rules:
${(() => {
  const rules = getAllRules();
  return rules.length > 0
    ? rules.map(r => `- ${r.name} (${r.trigger_type} on ${r.table_name})${r.enabled ? '' : ' (Disabled)'}`).join('\n')
    : '(No rules defined)';
})()}

Recent Operations (for undo reference):
${buildJournalContext()}`;
}

// ===== Tool dispatch =====

type UserRole = 'admin' | 'builder' | 'user';

function getToolsForRole(role: UserRole): ToolDefinition[] {
  if (role === 'user') {
    return TOOLS.filter(t => t.name === 'query_data' || t.name === 'write_data');
  }
  if (role === 'builder') {
    return TOOLS.filter(t => t.name !== 'undo_action');
  }
  return TOOLS;
}

function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userMessage: string
): { success: boolean; message: string; data?: unknown } {
  if (toolName === 'manage_schema') {
    return runSchemaAgent(toolInput as unknown as Parameters<typeof runSchemaAgent>[0], userMessage);
  } else if (toolName === 'manage_ui') {
    return runUiAgent(
      toolInput as { action: 'create_view' | 'update_view' | 'get_view'; view?: ViewDefinition; view_id?: string },
      userMessage
    );
  } else if (toolName === 'query_data') {
    return runQueryAgent(toolInput as { sql: string; explanation: string });
  } else if (toolName === 'write_data') {
    return writeData(
      toolInput as { operation: 'insert' | 'update' | 'delete'; table: string; data?: Record<string, string | number | boolean | null>; where?: Record<string, string | number | boolean | null> },
      userMessage,
    );
  } else if (toolName === 'manage_rules') {
    return runLogicAgent(
      toolInput as unknown as Parameters<typeof runLogicAgent>[0],
      userMessage
    );
  } else if (toolName === 'assess_impact') {
    return runTestAgent(
      toolInput as unknown as Parameters<typeof runTestAgent>[0]
    );
  } else if (toolName === 'undo_action') {
    const { target, journal_id, since } = toolInput as { target: string; journal_id?: number; since?: string };
    if (target === 'last') return undoLast(userMessage);
    if (target === 'by_id' && journal_id != null) return undoById(journal_id, userMessage);
    if (target === 'by_time' && since) return undoSince(since, userMessage);
    return { success: false, message: 'Invalid undo parameters' };
  } else {
    return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

// ===== Main chat loop =====

export interface ChatOptions {
  existingSessionId?: string;
  provider?: AIProviderName;
  model?: string;
  userId?: string;
}

export async function* chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userRole: UserRole = 'admin',
  options?: ChatOptions
): AsyncGenerator<string> {
  const providerName = options?.provider ?? getDefaultProviderName();
  const model = options?.model ?? getDefaultModel(providerName);
  const userId = options?.userId;
  const provider = createProvider(providerName);
  const tools = getToolsForRole(userRole);

  // Create or reuse chat session
  const sessionId = options?.existingSessionId
    ?? (userId ? createChatSession(userId, providerName, model, userMessage.slice(0, 80)) : null);

  if (sessionId && userId) {
    recordMessage({ session_id: sessionId, user_id: userId, role: 'user', content: userMessage });
  }

  // Build initial messages from history
  const currentMessages: LLMMessage[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];

  let continueLoop = true;

  while (continueLoop) {
    const response = await provider.chat({
      model,
      system: buildSystemPrompt(),
      messages: currentMessages,
      tools,
      maxTokens: 4096,
    });

    // Yield text content
    if (response.content) {
      yield JSON.stringify({ type: 'text', content: response.content }) + '\n';
    }

    // Yield usage info after each LLM call
    yield JSON.stringify({ type: 'usage', usage: response.usage, latency_ms: response.latency_ms }) + '\n';

    if (response.stop_reason === 'tool_use' && response.tool_calls.length > 0) {
      // Log the assistant turn before processing tools
      const assistantMsgId = sessionId && userId
        ? recordMessage({
            session_id: sessionId,
            user_id: userId,
            role: 'assistant',
            content: response.content,
            provider: providerName,
            model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            thinking_tokens: response.usage.thinking_tokens ?? 0,
            latency_ms: response.latency_ms,
          })
        : null;

      if (sessionId) updateSessionStats(sessionId, response.usage, model);

      const toolResults: ToolResult[] = [];

      for (const tc of response.tool_calls) {
        const agent = toolToAgent(tc.name);
        yield JSON.stringify({ type: 'tool_start', tool: tc.name, agent }) + '\n';

        const toolStart = Date.now();
        const startedAt = new Date().toISOString();
        let result;
        try {
          result = executeTool(tc.name, tc.input, userMessage);
        } catch (err) {
          result = { success: false, message: String(err) };
        }
        const finishedAt = new Date().toISOString();
        const toolLatency = Date.now() - toolStart;

        yield JSON.stringify({ type: 'tool_result', tool: tc.name, agent, result }) + '\n';

        if (assistantMsgId && sessionId) {
          recordToolEvent({
            message_id: assistantMsgId,
            session_id: sessionId,
            tool_name: tc.name,
            tool_input: tc.input,
            tool_output: result,
            started_at: startedAt,
            finished_at: finishedAt,
            latency_ms: toolLatency,
          });
        }

        toolResults.push({
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      // Append assistant response + tool results to the conversation
      currentMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });
      currentMessages.push({
        role: 'user',
        content: '',
        tool_results: toolResults,
      });
    } else {
      // Final assistant turn — log it
      if (sessionId && userId) {
        recordMessage({
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: response.content,
          provider: providerName,
          model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          thinking_tokens: response.usage.thinking_tokens ?? 0,
          latency_ms: response.latency_ms,
        });
        updateSessionStats(sessionId, response.usage, model);
        updateSessionTitle(sessionId, userMessage.slice(0, 80));
      }
      continueLoop = false;
    }
  }

  // Yield done with session info
  yield JSON.stringify({ type: 'done', provider: providerName, model, session_id: sessionId }) + '\n';
}
