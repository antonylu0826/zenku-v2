import { getDb } from '../db';

export interface StateMachineStateConfig {
  label?: string;
  is_editable?: boolean;
  is_final?: boolean;
  color?: string;
}

export interface StateMachineConfig {
  status_field: string;
  initial_state: string;
  states: Record<string, StateMachineStateConfig>;
  transitions: Record<string, string[]>;
  allow_delete_in?: string[];
}

interface TraitRow {
  table_name: string;
  trait_name: string;
  config: string;
}

// In-memory cache: tableName → config (null = no trait)
const cache = new Map<string, StateMachineConfig | null>();
let initialized = false;

/** Load all traits into memory. Call once at server startup. */
export async function initTraitCache(): Promise<void> {
  const db = getDb();
  
  // Safety check: Ensure the system table exists before querying
  if (!(await db.tableExists('_zenku_table_traits'))) {
    console.log('[TraitCache] System table _zenku_table_traits not found, skipping cache init.');
    initialized = true;
    return;
  }

  const { rows } = await db.query<TraitRow>(
    'SELECT table_name, trait_name, config FROM _zenku_table_traits'
  );
  cache.clear();
  for (const row of rows) {
    if (row.trait_name === 'state_machine') {
      try {
        cache.set(row.table_name, JSON.parse(row.config));
      } catch { /* skip malformed config */ }
    }
  }
  initialized = true;
}

/** Get the state machine config for a table. Returns null if not a state machine. */
export function getStateMachineConfig(tableName: string): StateMachineConfig | null {
  if (!initialized) return null;
  return cache.get(tableName) ?? null;
}

/** Call after registering or updating a trait. */
export function updateTraitCache(tableName: string, config: StateMachineConfig): void {
  cache.set(tableName, config);
}

/** Call after removing a trait. */
export function removeTraitCache(tableName: string): void {
  cache.delete(tableName);
}
