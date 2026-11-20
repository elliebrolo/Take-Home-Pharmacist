import type { Llm } from '../core/deps.ts';
import { createGeminiLlm, hasGeminiKey } from './gemini.ts';
import { createOpenAiLlm, hasOpenAiKey } from './openai.ts';

export type Provider = 'gemini' | 'openai';

/**
 * Chooses the model provider from the environment.
 *   LLM_PROVIDER=gemini | openai   explicit choice (an unknown value, or a missing key, means "no model").
 *   unset                          the provider whose key is set; Gemini if both are.
 * Returns null when nothing usable is configured. Every model step then takes its
 * conservative fallback (see the README).
 */
export function createLlm(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): { llm: Llm | null; note: string } {
  const want = (env.LLM_PROVIDER || '').trim().toLowerCase();
  if (want && want !== 'gemini' && want !== 'openai') {
    return { llm: null, note: `LLM_PROVIDER="${env.LLM_PROVIDER}" is not recognised (use gemini or openai)` };
  }
  const provider: Provider | null = want ? (want as Provider) : hasGeminiKey(env) ? 'gemini' : hasOpenAiKey(env) ? 'openai' : null;
  if (!provider) return { llm: null, note: 'no GEMINI_API_KEY or OPENAI_API_KEY set' };
  const llm = provider === 'gemini' ? createGeminiLlm(env) : createOpenAiLlm(env, fetchImpl);
  if (!llm) return { llm: null, note: `LLM_PROVIDER=${provider} but ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} is not set` };
  return { llm, note: llm.label || provider };
}
