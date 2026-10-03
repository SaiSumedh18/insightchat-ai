import { getEncoding } from 'js-tiktoken';
import { analyze } from '../server/src/analytics.js';
import { evidenceFor } from '../server/src/assistant.js';
import { evidenceFor as legacy } from './legacy-evidence.js';
import { writeFileSync } from 'node:fs';
const encoder = getEncoding('o200k_base');
const columns = [
  'Category',
  'Region',
  'Channel',
  'Product',
  'Month',
  'Segment',
  'Revenue',
  'Units',
  'Cost',
  'Discount',
  'Tax',
  'Profit',
];
const rows = Array.from({ length: 10000 }, (_, i) =>
  Object.fromEntries(
    columns.map((name, j) => [name, j < 6 ? `${name}-${i % 20}` : String((i * (j + 1)) % 1000)]),
  ),
);
const dataset = {
  id: 'synthetic',
  name: 'synthetic-10000.csv',
  columns,
  rows,
  analytics: analyze(columns, rows),
};
const result = ['Revenue by Category', 'Summarize this dataset', 'What is the total Profit?'].map(
  (question) => {
    const before = JSON.stringify(legacy(dataset)),
      after = JSON.stringify(evidenceFor(dataset, question));
    const old = encoder.encode(before).length,
      next = encoder.encode(after).length;
    return {
      question,
      beforeCharacters: before.length,
      afterCharacters: after.length,
      beforeEstimatedTokens: old,
      afterEstimatedTokens: next,
      reductionPercent: (100 * (old - next)) / old,
    };
  },
);
const report = {
  method:
    'Local o200k_base encoding of evidence JSON only; excludes instructions/history, API framing and output. Synthetic 10,000-row, 12-column fixture (6 text/6 numeric, 20 groups per category). Estimates, not billed usage or cost savings.',
  result,
};
writeFileSync('benchmarks/results/context.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
