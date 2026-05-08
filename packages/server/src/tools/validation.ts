export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  oneOf?: JsonSchema[];
  additionalProperties?: boolean;
  description?: string;
}

function checkType(type: string, value: unknown): boolean {
  if (value === null) return type === 'null';
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'object') return typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function validateValue(schema: JsonSchema, value: unknown, path: string): string | null {
  // type check (skip if value is undefined/null and not required — caller handles required)
  if (schema.type && value !== undefined && value !== null) {
    if (!checkType(schema.type, value)) {
      return `"${path}" must be ${schema.type}, got ${Array.isArray(value) ? 'array' : typeof value}`;
    }
  }

  // enum check
  if (schema.enum !== undefined && value !== undefined) {
    if (!schema.enum.includes(value)) {
      return `"${path}" must be one of [${schema.enum.map(v => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(value)}`;
    }
  }

  // object checks
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    for (const req of schema.required ?? []) {
      if (!(req in obj) || obj[req] === undefined) {
        return `"${path ? path + '.' : ''}${req}" is required`;
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj && obj[key] !== undefined) {
          const childPath = path ? `${path}.${key}` : key;
          const err = validateValue(propSchema, obj[key], childPath);
          if (err) return err;
        }
      }

      if (schema.additionalProperties === false) {
        for (const key of Object.keys(obj)) {
          if (!(key in schema.properties)) {
            return `"${path ? path + '.' : ''}${key}" is not allowed`;
          }
        }
      }
    }
  }

  // array checks
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const err = validateValue(schema.items, value[i], `${path}[${i}]`);
      if (err) return err;
    }
  }

  // oneOf check
  if (schema.oneOf && value !== undefined) {
    const passes = schema.oneOf.some(s => validateValue(s, value, path) === null);
    if (!passes) {
      return `"${path}" does not match any allowed schema`;
    }
  }

  return null;
}

export function validateToolInput(schema: JsonSchema, input: unknown): string | null {
  return validateValue(schema, input, '');
}

function normalizeValue(schema: JsonSchema, value: unknown): unknown {
  // try to parse top-level JSON string
  if (typeof value === 'string' && (schema.type === 'object' || schema.type === 'array')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // recurse into objects
  if (schema.type === 'object' && schema.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = { ...(value as Record<string, unknown>) };
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        obj[key] = normalizeValue(propSchema, obj[key]);
      }
    }
    return obj;
  }

  // recurse into arrays
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    return value.map(item => normalizeValue(schema.items!, item));
  }

  return value;
}

export function normalizeToolInput(schema: JsonSchema, input: unknown): unknown {
  // if the entire input is a JSON string, parse it first
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return input;
    }
  }
  return normalizeValue(schema, input);
}
