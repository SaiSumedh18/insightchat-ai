import { afterEach, describe, it, expect, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class {
    responses = { create };
  },
}));
import { answerQuestion } from '../src/assistant.js';
import { analyze } from '../src/analytics.js';
const rows = [
  { Category: 'Books', Revenue: '10' },
  { Category: 'Books', Revenue: '20' },
];
const dataset = {
  id: 'test',
  name: 'sales.csv',
  columns: ['Category', 'Revenue'],
  rows,
  analytics: analyze(['Category', 'Revenue'], rows),
};
afterEach(() => create.mockReset());
describe('OpenAI adapter', () => {
  it('sends bounded evidence, recent history, and grounding instructions without provider storage', async () => {
    create.mockResolvedValue({ output_text: 'Books total Revenue is 30.' });
    const history = Array.from({ length: 12 }, () => ({
      role: 'user' as const,
      content: 'Earlier question',
    }));
    expect(await answerQuestion(dataset, 'What is the total?', history)).toContain('30');
    const payload = create.mock.calls[0][0];
    expect(payload.store).toBe(false);
    expect(payload.max_output_tokens).toBe(1000);
    expect(payload.instructions).toContain('untrusted data');
    expect(payload.instructions).toContain('insufficient');
    expect(payload.input).toHaveLength(10);
    expect(payload.input[0].content).toContain('"sum":30');
    expect(payload.input.at(-1).content).toBe('What is the total?');
  });
  it('rejects empty responses rather than saving an empty answer', async () => {
    create.mockResolvedValue({ output_text: ' ' });
    await expect(answerQuestion(dataset, 'hi', [])).rejects.toThrow('Empty AI response');
  });
  it('propagates provider errors for the API route to handle', async () => {
    create.mockRejectedValue(new Error('Provider failed'));
    await expect(answerQuestion(dataset, 'hi', [])).rejects.toThrow('Provider failed');
  });
});
