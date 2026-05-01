import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { createE2EMockClient } from './e2e-mock';

let _client: Anthropic | null = null;
let _mock: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  // Sprint 8: Playwright dev server runs with CONTENTOPS_E2E_MOCK=1
  // (set in playwright.config.ts webServer.env). Returns a deterministic
  // mock client so the smoke test does not depend on LLM behavior or burn
  // Anthropic budget.
  if (process.env.CONTENTOPS_E2E_MOCK === '1') {
    if (!_mock) _mock = createE2EMockClient();
    return _mock;
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local for local development.',
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}
