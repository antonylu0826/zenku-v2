/**
 * 欄位型別 — Zenku 最核心的型別定義
 * 所有 View、Form、Table 都依賴此定義
 */

import type { AppearanceRule } from './appearance';

// ===== 欄位類型 =====

/** Phase 1（現有）基礎型別 */
export type BasicFieldType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date' | 'datetime' | 'textarea' | 'rating' | 'progress' | 'color' | 'time';

/** Phase 2 擴充型別 */
export type ExtendedFieldType = 'relation' | 'currency' | 'phone' | 'email' | 'url' | 'enum' | 'richtext';

/** Phase 4 檔案型別 */
export type FileFieldType = 'image' | 'file';

/** 所有欄位型別 */
export type FieldType = BasicFieldType | ExtendedFieldType | FileFieldType;

/** Runtime 常數陣列（供 server 端 AI tool schema 使用） */
export const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'select', 'multiselect', 'boolean', 'date', 'datetime', 'textarea', 'rating', 'progress', 'color', 'time',
  'relation', 'currency', 'phone', 'email', 'url', 'enum', 'richtext',
  'image', 'file',
];

// ===== 關聯定義 =====

export interface RelationDef {
  /** 關聯表名 */
  table: string;
  /** 值欄位（通常 'id'） */
  value_field: string;
  /** 顯示欄位（如 'name'） */
  display_field: string;
  /** 複合顯示格式，如 '{name} ({phone})' */
  display_format?: string;
}

// ===== 動態來源 =====

export interface SourceDef {
  /** 來源表名 */
  table: string;
  /** 選項值欄位 */
  value_field: string;
  /** 選項顯示欄位 */
  display_field: string;
}

// ===== 計算欄位 =====

export interface ComputedDef {
  /** 公式，如 'quantity * unit_price' */
  formula: string;
  /** 依賴的欄位名，如 ['quantity', 'unit_price'] */
  dependencies: string[];
  /** 顯示格式 */
  format?: 'currency' | 'number' | 'percent';
}

// ===== 驗證規則 =====

export interface ValidationDef {
  min?: number;
  max?: number;
  /** 正規表達式 */
  pattern?: string;
  /** 驗證失敗訊息 */
  message?: string;
}

// ===== 欄位定義 =====

export interface FieldDef {
  /** DB 欄位名 */
  key: string;
  /** 顯示名稱 */
  label: string;
  /** 欄位類型 */
  type: FieldType;
  /** 是否必填 */
  required?: boolean;
  /** 輸入提示文字 */
  placeholder?: string;

  /** select 靜態選項 */
  options?: string[];
  /** select 動態來源（取代 options） */
  source?: SourceDef;
  /** relation 關聯定義 */
  relation?: RelationDef;
  /** 計算欄位定義 */
  computed?: ComputedDef;

  /** 在列表中隱藏 */
  hidden_in_table?: boolean;
  /** 在表單中隱藏 */
  hidden_in_form?: boolean;
  /** 列表欄寬（px） */
  width?: number;

  /** 驗證規則 */
  validation?: ValidationDef;

  /** 條件外觀規則（Client-side 即時求值） */
  appearance?: AppearanceRule[];

  /** file / image 欄位：允許的 MIME，如 "image/*,application/pdf" */
  accept?: string;
  /** file / image 欄位：是否允許多檔 */
  multiple?: boolean;
  /** file / image 欄位：單檔最大 MB */
  max_size_mb?: number;
}
