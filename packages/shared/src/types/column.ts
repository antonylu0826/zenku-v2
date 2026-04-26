import type { FieldType } from './field';
import type { AppearanceRule } from './appearance';

export interface ColumnDef {
  /** Database field name */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: FieldType;
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Column width (px) */
  width?: number;
  /** Relation display settings (used in list view) */
  relation?: {
    table: string;
    display_field: string;
  };
  /** Hide this column in the table list (definition is preserved and can be toggled in the interface manager) */
  hidden_in_table?: boolean;

  /** Static select options (for select-type columns, used to render filter dropdowns) */
  options?: string[];
  /** Display labels for select options — mirrors FieldDef.option_labels */
  option_labels?: Record<string, string>;

  /** Conditional appearance rules (dynamically apply styles per row based on data) */
  appearance?: AppearanceRule[];
}
