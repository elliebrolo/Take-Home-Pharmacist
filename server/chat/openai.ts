import type { Llm } from '../core/deps.ts';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

export function hasOpenAiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'MY_OPENAI_API_KEY';
}

/**
 * OpenAI (Chat Completions, JSON output) as a JSON-returning model. Returns null when no key is set.
 * Uses fetch directly, so there is no extra dependency. OPENAI_BASE_URL can point at a compatible server.
 * No temperature is sent: GPT-5-family models only accept their default.
 */
export function createOpenAiLlm(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Llm | null {
  if (!hasOpenAiKey(env)) return null;
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    label: `openai / ${model}`,
    async generateJson({ system, user, timeoutMs, schema }) {
      const response_format = schema
        ? { type: 'json_schema', json_schema: { name: 'result', schema, strict: false } }
        : { type: 'json_object' };
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          // json_object mode requires the word "JSON" in the messages.
          messages: [
            { role: 'system', content: `${system}\n\nRespond with a single JSON object only.` },
            { role: 'user', content: user },
          ],
          response_format,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // Status only: the body can echo request content.
        throw new Error(`OpenAI request failed with HTTP ${res.status}`);
      }
      const data: any = await res.json();
      const choice = data?.choices?.[0];
      if (choice?.message?.refusal) throw new Error('model refused');
      return choice?.message?.content ?? '';
    },
  };
}
