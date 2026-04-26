/**
 * Field types — the most fundamental type definitions in Zenku
 * All Views, Forms, and Tables depend on these definitions
 */

import type { AppearanceRule } from './appearance';

// ===== Field Types =====

/** Phase 1 (existing) basic types */
export type BasicFieldType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date' | 'datetime' | 'textarea' | 'rating' | 'progress' | 'color' | 'time' | 'auto_number';

/** Phase 2 extended types */
export type ExtendedFieldType = 'relation' | 'currency' | 'phone' | 'email' | 'url' | 'enum' | 'richtext' | 'markdown' | 'sheet' | 'json';

/** Phase 4 file types */
export type FileFieldType = 'image' | 'file';

/** All field types */
export type FieldType = BasicFieldType | ExtendedFieldType | FileFieldType;

/** Runtime constant array (used by server-side AI tool schema) */
export const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'select', 'multiselect', 'boolean', 'date', 'datetime', 'textarea', 'rating', 'progress', 'color', 'time', 'auto_number',
  'relation', 'currency', 'phone', 'email', 'url', 'enum', 'richtext', 'markdown', 'sheet', 'json',
  'image', 'file',
];

// ===== Relation Definition =====

export interface RelationDef {
  /** Related table name */
  table: string;
  /** Value field (typically 'id') */
  value_field: string;
  /** Display field (e.g. 'name') */
  display_field: string;
  /** Composite display format, e.g. '{name} ({phone})' */
  display_format?: string;
}

// ===== Dynamic Source =====

export interface SourceDef {
  /** Source table name */
  table: string;
  /** Option value field */
  value_field: string;
  /** Option display field */
  display_field: string;
}

// ===== Auto Number Config =====

export interface AutoNumberConfig {
  /** String prefix, e.g. 'ORD-', 'INV-' */
  prefix?: string;
  /** Date segment inserted after prefix; also determines reset cycle */
  date_format?: 'YYYY' | 'YYYYMM' | 'YYYYMMDD';
  /** Zero-padding width for the sequence number (default: 4) */
  padding?: number;
  /** Counter reset cycle (default: 'never') */
  reset?: 'never' | 'yearly' | 'monthly' | 'daily';
}

// ===== Computed Field =====

export interface ComputedDef {
  /** Formula, e.g. 'quantity * unit_price' */
  formula: string;
  /** Dependent field names, e.g. ['quantity', 'unit_price'] */
  dependencies: string[];
  /** Display format */
  format?: 'currency' | 'number' | 'percent';
}

// ===== Validation Rules =====

export interface ValidationDef {
  min?: number;
  max?: number;
  /** Regular expression */
  pattern?: string;
  /** Validation failure message */
  message?: string;
}

// ===== Field Definition =====

export interface FieldDef {
  /** Database field name */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: FieldType;
  /** Whether the field is required */
  required?: boolean;
  /** Input placeholder text */
  placeholder?: string;

  /** Static select options (stored DB values — stable, never translated) */
  options?: string[];
  /**
   * Display labels for select options: { storedValue: displayLabel | $key }.
   * When present, the UI shows option_labels[value] instead of value itself.
   * Values in option_labels may be $key strings resolved by the backend i18n service.
   */
  option_labels?: Record<string, string>;
  /** Dynamic select source (replaces options) */
  source?: SourceDef;
  /** Relation field definition */
  relation?: RelationDef;
  /** Computed field definition */
  computed?: ComputedDef;
  /** Auto-number field configuration */
  auto_number?: AutoNumberConfig;

  /** Hide in the table list */
  hidden_in_table?: boolean;
  /** Hide in the form */
  hidden_in_form?: boolean;
  /** Table column width (px) */
  width?: number;

  /** Validation rules */
  validation?: ValidationDef;

  /** Conditional appearance rules (evaluated client-side in real time) */
  appearance?: AppearanceRule[];

  /** file / image field: allowed MIME types, e.g. "image/*,application/pdf" */
  accept?: string;
  /** file / image field: whether multiple files are allowed */
  multiple?: boolean;
  /** file / image field: maximum file size in MB */
  max_size_mb?: number;
}
