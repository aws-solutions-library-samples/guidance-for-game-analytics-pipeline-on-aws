import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadDataSetDefinitions } from '../helpers/quicksight-definition-loader';

describe('quicksight-definition-loader — happy path', () => {
  test('loads exactly 6 dataset definitions with expected viewNames from the real JSON', () => {
    const defs = loadDataSetDefinitions();
    expect(defs).toHaveLength(6);
    const viewNames = defs.map((d) => d.viewName);
    expect(viewNames).toEqual([
      'all_events',
      'match_events',
      'level_events',
      'economy_events',
      'player_health',
      'match_lifecycle_funnel',
    ]);
    for (const def of defs) {
      expect(Array.isArray(def.columns)).toBe(true);
      expect(def.columns.length).toBeGreaterThan(0);
    }
  });
});

describe('quicksight-definition-loader — validation errors', () => {
  const tmpDirs: string[] = [];

  function fixture(contents: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-loader-'));
    tmpDirs.push(dir);
    const p = path.join(dir, 'data-set-definitions.json');
    fs.writeFileSync(p, contents);
    return p;
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  test('throws a descriptive error naming the file on truncated/invalid JSON', () => {
    const p = fixture('[{"viewName":"all_events"');
    expect(() => loadDataSetDefinitions(p)).toThrow(
      /Failed to parse QuickSight dataset definitions JSON at .*data-set-definitions\.json/,
    );
  });

  test('throws when the top-level JSON is not an array', () => {
    const p = fixture('{"viewName":"all_events"}');
    expect(() => loadDataSetDefinitions(p)).toThrow(/expected a top-level array/);
  });

  test('throws naming the offending entry when viewName is missing', () => {
    const p = fixture('[{"columns":[{"name":"x","type":"STRING"}]}]');
    expect(() => loadDataSetDefinitions(p)).toThrow(/entry \[0\] is missing a non-empty string "viewName"/);
  });

  test('throws naming the field when columns are missing', () => {
    const p = fixture('[{"viewName":"all_events"}]');
    expect(() => loadDataSetDefinitions(p)).toThrow(/entry "all_events" is missing a non-empty "columns" array/);
  });

  test('throws when the file cannot be read', () => {
    expect(() => loadDataSetDefinitions('/nonexistent/path/data-set-definitions.json')).toThrow(
      /Failed to read QuickSight dataset definitions from .*data-set-definitions\.json/,
    );
  });
});
