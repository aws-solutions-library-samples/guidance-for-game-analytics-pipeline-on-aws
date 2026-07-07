import * as fs from 'fs';
import * as path from 'path';
import { DataSetDefinition } from './quicksight-types';

const DATA_SET_DEFINITIONS_PATH = path.join(__dirname, '../../../../resources/quicksight/data-set-definitions.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidColumn(col: unknown): boolean {
  return isRecord(col) && typeof col.name === 'string' && typeof col.type === 'string';
}

function assertValidColumns(record: Record<string, unknown>, viewName: string, filePath: string): void {
  if (!Array.isArray(record.columns) || record.columns.length === 0) {
    throw new Error(
      `Invalid QuickSight dataset definition in ${filePath}: entry "${viewName}" is missing a non-empty "columns" array`,
    );
  }
  const badIdx = record.columns.findIndex((col) => !isValidColumn(col));
  if (badIdx !== -1) {
    throw new Error(
      `Invalid QuickSight dataset definition in ${filePath}: entry "${viewName}" column [${badIdx}] must have string "name" and "type"`,
    );
  }
}

function assertValidDataSetDefinition(entry: unknown, index: number, filePath: string): DataSetDefinition {
  if (!isRecord(entry)) {
    throw new Error(`Invalid QuickSight dataset definition in ${filePath}: entry [${index}] must be an object`);
  }
  if (typeof entry.viewName !== 'string' || entry.viewName.length === 0) {
    throw new Error(
      `Invalid QuickSight dataset definition in ${filePath}: entry [${index}] is missing a non-empty string "viewName"`,
    );
  }
  assertValidColumns(entry, entry.viewName, filePath);
  return entry as unknown as DataSetDefinition;
}

/**
 * Loads the static QuickSight dataset definitions from
 * `resources/quicksight/data-set-definitions.json` and validates their shape
 * at synth time (parse-don't-validate). Dynamic wiring (ARNs, workload name,
 * dataSetIdentifierDeclarations) is NOT stored here — it stays in the construct.
 */
export function loadDataSetDefinitions(filePath: string = DATA_SET_DEFINITIONS_PATH): DataSetDefinition[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read QuickSight dataset definitions from ${filePath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse QuickSight dataset definitions JSON at ${filePath}: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid QuickSight dataset definitions in ${filePath}: expected a top-level array`);
  }
  if (parsed.length === 0) {
    throw new Error(`Invalid QuickSight dataset definitions in ${filePath}: array is empty`);
  }

  return parsed.map((entry, index) => assertValidDataSetDefinition(entry, index, filePath));
}
