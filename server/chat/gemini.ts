import { GoogleGenAI } from '@google/genai';
import type { Llm } from '../core/deps.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function hasGeminiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
}

/** Gemini as a JSON-returning model. Returns null when no key is configured. */
export function createGeminiLlm(env: NodeJS.ProcessEnv = process.env): Llm | null {
  if (!hasGeminiKey(env)) return null;
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY!, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  return {
    label: `gemini / ${model}`,
    async generateJson({ system, user, timeoutMs, schema }) {
      const call = ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          temperature: 0,
          ...(schema ? { responseJsonSchema: schema } : {}),
        },
      });
      let t: NodeJS.Timeout;
      const timeout = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error('model timeout')), timeoutMs)));
      try {
        const res: any = await Promise.race([call, timeout]);
        return res.text ?? '';
      } finally {
        clearTimeout(t!);
      }
    },
  };
}
