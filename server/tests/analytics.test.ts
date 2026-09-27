import { describe, it, expect } from 'vitest';
import { parseCsv, analyze, groupRows } from '../src/analytics.js';
import { evidenceFor } from '../src/assistant.js';
describe('CSV parsing and deterministic analytics', () => {
  it('parses quoted values, BOM and missing cells correctly', () => {
    const { columns, rows } = parseCsv(
      Buffer.from('\ufeffCategory,Revenue\n"Books, used",10\nGames,20\nGames,\n'),
    );
    const a = analyze(columns, rows);
    expect(a.rowCount).toBe(3);
    expect(a.missingCells).toBe(1);
    expect(a.stats[1]).toMatchObject({ sum: 30, mean: 15, min: 10, max: 20 });
    expect(groupRows(rows, 'Category', 'Revenue')).toEqual([
      { label: 'Games', value: 20, count: 2 },
      { label: 'Books, used', value: 10, count: 1 },
    ]);
  });
  it.each(['a,a\n1,2', 'a,b\n1', 'a,b\n"unterminated,2', 'a,b\n', '__proto__,x\na,b', ',x\na,b'])(
    'rejects malformed input: %s',
    (csv) => expect(() => parseCsv(Buffer.from(csv))).toThrow(),
  );
  it('does not treat text, infinity, or blank columns as numbers', () => {
    const { columns, rows } = parseCsv(
      Buffer.from('label,blank,big,amount\nhello,,1e999,-2.5\nworld,,3,4.5'),
    );
    expect(analyze(columns, rows).numericColumns).toEqual(['amount']);
  });
  it('enforces row and cell limits', () => {
    expect(() => parseCsv(Buffer.from('x\n' + 'v\n'.repeat(10001)))).toThrow();
    expect(() => parseCsv(Buffer.from('x\n' + 'v'.repeat(2001)))).toThrow();
  });
  it('keeps complete statistics while labeling truncated evidence', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ Category: `C${i}`, Sales: String(i) }));
    const evidence = evidenceFor({
      id: 'x',
      name: 'demo',
      rows,
      columns: ['Category', 'Sales'],
      analytics: analyze(['Category', 'Sales'], rows),
    });
    expect(evidence.statistics.stats[1].sum).toBe(190);
    expect(evidence.sample).toHaveLength(8);
    expect(evidence.groups[0].totalGroups).toBe(20);
    expect(evidence.groups[0].topGroups).toHaveLength(12);
  });
});
