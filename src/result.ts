import type { CallToolResult } from '@modelcontextprotocol/client';

/** Neuro-Ali wraps actual values in result / {type, properties}. */
export function neuroResult(result: CallToolResult): Record<string, unknown> {
  let value: unknown = result.structuredContent;
  if (!value) {
    for (const block of result.content) {
      if (block.type === 'text') {
        try { value = JSON.parse(block.text); break; } catch {}
      }
    }
  }
  if (!value || typeof value !== 'object') return {};
  let record = value as Record<string, unknown>;
  if (record.result && typeof record.result === 'object') record = record.result as Record<string, unknown>;
  if (record.type === 'object' && record.properties && typeof record.properties === 'object')
    record = record.properties as Record<string, unknown>;
  return record;
}
