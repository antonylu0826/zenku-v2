import { ZenkuTool } from '../types';
import { runUiAgent } from '../../agents/ui-agent';
import { FIELD_TYPES, VIEW_TYPES } from '@zenku/shared';

export const FORM_FIELD_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: { type: 'string', description: 'Database field name' },
    label: { type: 'string', description: 'Field label (for UI display)' },
    type: { type: 'string', enum: FIELD_TYPES },
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
    auto_number: {
      type: 'object',
      description: `Auto-number field config (required when type is "auto_number").
The server generates a sequential number automatically on every insert — do NOT ask the user to fill this field.
Format: {prefix}{date_segment}{seq padded to padding digits}, e.g. "ORD-20240422-0001".
Properties:
- prefix: string prefix, e.g. "ORD-", "INV-" (optional)
- date_format: "YYYY" | "YYYYMM" | "YYYYMMDD" — inserts a date segment and sets the reset cycle (optional)
- padding: zero-padding width for the sequence number, default 4
- reset: "never" | "yearly" | "monthly" | "daily" — when to restart from 1 (default "never")`,
      properties: {
        prefix:      { type: 'string' },
        date_format: { type: 'string', enum: ['YYYY', 'YYYYMM', 'YYYYMMDD'] },
        padding:     { type: 'number' },
        reset:       { type: 'string', enum: ['never', 'yearly', 'monthly', 'daily'] },
      },
    },
    accept: {
      type: 'string',
      description: 'For file/image fields: allowed MIME types, e.g. "image/*" or "image/*,application/pdf"',
    },
    multiple: {
      type: 'boolean',
      description: 'For file/image fields: whether multiple files can be uploaded (default true)',
    },
    max_size_mb: {
      type: 'number',
      description: 'For file/image fields: maximum file size in MB (default 20)',
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

export const manageUiTool: ZenkuTool = {
  definition: {
    name: 'manage_ui',
    description: `Create or update user interface. Type determines layout:

Type selection guide:
- table: General list management (default)
- master-detail: Master + details (e.g., orders + order items), requires detail_views
- dashboard: Statistics panel, requires widgets (no columns/form needed)
- kanban: Kanban board with drag-drop, requires kanban (group_field, title_field)
- calendar: Calendar view, requires calendar (date_field, title_field)
- gallery: Gallery grid with image cards, requires gallery (image_field, title_field)
- form-only: Single-record form (e.g., settings page); auto-creates record if table is empty
- timeline: Vertical timeline sorted by date; requires timeline (date_field, title_field)

Field type determines frontend rendering (for table/master-detail):
- text/number/date/boolean/textarea: Basic input
- select + options: Static dropdown
- relation + relation: Related field (searchable dropdown, stores id)
- currency: Currency amount (with thousand separators)
- computed: Only set in form.fields, use number type in columns

form.columns controls form column count (integer 1/2/3):
- Always set explicitly when fields >= 5, otherwise form becomes a single long column
- Use 2 for most multi-field forms; use 3 when fields exceed 8

group controls sidebar grouping:
- Omit for ungrouped views (shown at top)
- Set to a short label (e.g., "採購", "庫存") to cluster related views under a collapsible section

When users say "statistics/kanban/calendar/gallery", directly create a view of that type without needing a table first.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_view', 'update_view', 'get_view', 'delete_view'],
          description: 'get_view: fetch full definition before update_view. delete_view: remove a view by view_id (does NOT drop the table).',
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
            type: { type: 'string', enum: VIEW_TYPES },
            group: { type: 'string', description: 'Sidebar group name; views with the same group are displayed together under a collapsible section' },
            columns: {
              type: 'array',
              description: 'List field definitions',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Database field name' },
                  label: { type: 'string', description: 'Column label' },
                  type: { type: 'string', enum: FIELD_TYPES },
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
                  type: 'integer',
                  description: 'Form column count: 1, 2, 3, or 4. Always set explicitly when fields >= 5. Use 2 for most multi-field forms; 3 for 8+ fields; 4 for demo/showcase views with many field types.',
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
              description: 'Controls which UI buttons appear. REQUIRED — omitting this means no buttons at all. Built-in values: "create" (Add button), "edit" (Edit button), "delete" (Delete button), "export" (Export button). For standard CRUD use ["create","edit","delete"]. No other string values are valid.',
              items: {
                oneOf: [
                  {
                    type: 'string',
                    enum: ['create', 'edit', 'delete', 'export'],
                    description: 'Built-in CRUD action. Only these four values are valid.',
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
                  type: { type: 'string', enum: ['stat_card', 'bar_chart', 'line_chart', 'pie_chart', 'mini_table', 'trend_card'] },
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
            gallery: {
              type: 'object',
              description: 'Settings for gallery type',
              properties: {
                image_field: { type: 'string' },
                title_field: { type: 'string' },
                subtitle_field: { type: 'string' },
              },
              required: ['image_field', 'title_field'],
            },
            timeline: {
              type: 'object',
              description: 'Settings for timeline type',
              properties: {
                date_field: { type: 'string' },
                title_field: { type: 'string' },
                description_field: { type: 'string' },
                color_field: { type: 'string' },
              },
              required: ['date_field', 'title_field'],
            },
          },
        },
      },
      required: ['action'],
    },
  },
  execute: async (input: any, userMessage?: string) => {
    return runUiAgent(input, userMessage!);
  },
};
