/**
 * Server-side AI provider. Speaks the OpenAI-compatible /chat/completions protocol, which Groq,
 * vLLM, llama.cpp server, Ollama, LM Studio and most on-device gateways expose.
 *
 * Swap providers with environment variables only (see README "AI integration"):
 *   AI_PROVIDER=groq | openai-compatible | disabled
 *   AI_BASE_URL, AI_API_KEY (or GROQ_API_KEY), AI_TEXT_MODEL, AI_VISION_MODEL, AI_REASONING_EFFORT
 */
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { ApiError } from '../validation';
import { aiPrompts, aiSchemas, extractJson, fitToSchema, type AiCapabilities, type AiFeature, type AiResultMap } from '../../../shared/ai';
export { extractJson };

export interface AiConfig { provider: string; baseUrl: string; apiKey: string; textModel: string; visionModel: string; fallbackTextModel: string; reasoningEffort: string; timeoutMs: number }

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const provider = (env.AI_PROVIDER || (env.GROQ_API_KEY || env.AI_API_KEY ? 'groq' : 'disabled')).toLowerCase();
  if (provider === 'disabled') return null;
  const groq = provider === 'groq';
  const baseUrl = (env.AI_BASE_URL || (groq ? 'https://api.groq.com/openai/v1' : '')).replace(/\/+$/, '');
  const apiKey = env.AI_API_KEY || (groq ? env.GROQ_API_KEY || '' : '');
  const textModel = env.AI_TEXT_MODEL || (groq ? 'qwen/qwen3.8-27b' : '');
  if (!baseUrl || !textModel || (groq && !apiKey)) return null;
  let url: URL;
  try { url = new URL(baseUrl); } catch { return null; }
  // Plain HTTP is accepted only for a gateway on the same machine or private network.
  if (url.protocol !== 'https:' && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) return null;
  return { provider, baseUrl, apiKey, textModel, visionModel: env.AI_VISION_MODEL || textModel, fallbackTextModel: env.AI_FALLBACK_TEXT_MODEL ?? (groq ? 'openai/gpt-oss-20b' : ''), reasoningEffort: env.AI_REASONING_EFFORT ?? (textModel.startsWith('qwen/') ? 'none' : ''), timeoutMs: Number(env.AI_TIMEOUT_MS) || 30000 };
}

const visionFeatures: AiFeature[] = ['foodPhoto', 'prescriptionScan'];
export function capabilities(config = aiConfig()): AiCapabilities {
  const features = Object.fromEntries((Object.keys(aiPrompts) as AiFeature[]).map(f => [f, Boolean(config && (!visionFeatures.includes(f) || config.visionModel))])) as AiCapabilities['features'];
  return { provider: config?.provider ?? 'disabled', textModel: config?.textModel ?? null, visionModel: config?.visionModel ?? null, features, storesImages: false, notice: 'AI output is a draft for you to check. It never diagnoses, prescribes or changes doses.' };
}

type Fetcher = typeof fetch;
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 30 * 60000;

/** Runs one AI feature and returns schema-validated output, or throws an ApiError with a patient-safe message.
 * Identical requests within 30 minutes are served from memory; a rate-limited text request retries once on AI_FALLBACK_TEXT_MODEL. */
export async function runAi<F extends AiFeature>(feature: F, userText: string, options: { image?: string; config?: AiConfig | null; fetcher?: Fetcher; maxTokens?: number } = {}): Promise<AiResultMap[F]> {
  const config = options.config === undefined ? aiConfig() : options.config;
  if (!config) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not connected on this server. Everything else keeps working.');
  const key = createHash('sha256').update(`${feature}\n${config.baseUrl}\n${userText}\n${options.image ?? ''}`).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as AiResultMap[F];
  const models = options.image ? [config.visionModel] : [config.textModel, ...(config.fallbackTextModel ? [config.fallbackTextModel] : [])];
  let last: ApiError = new ApiError(502, 'AI_UNAVAILABLE', 'The AI assistant could not complete this request. Nothing was saved.');
  for (const model of models) {
    try {
      const value = await callModel(feature, model, userText, config, options);
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      return value;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      last = error;
      if (error.code !== 'AI_BUSY' && error.code !== 'AI_INVALID_OUTPUT') throw error;
    }
  }
  throw last;
}

async function callModel<F extends AiFeature>(feature: F, model: string, userText: string, config: AiConfig, options: { image?: string; fetcher?: Fetcher; maxTokens?: number }): Promise<AiResultMap[F]> {
  const content = options.image ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: options.image } }] : userText;
  const body: Record<string, unknown> = { model, temperature: 0.2, max_completion_tokens: options.maxTokens ?? 1000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: aiPrompts[feature] }, { role: 'user', content }] };
  const effort = model === config.textModel || model === config.visionModel ? config.reasoningEffort : model.startsWith('openai/gpt-oss') ? 'low' : '';
  if (effort) body.reasoning_effort = effort;
  const send = () => (options.fetcher ?? fetch)(`${config.baseUrl}/chat/completions`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs), headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) }, body: JSON.stringify(body) });
  let response: Response;
  try {
    // Fixed, operator-configured destination: no user-controlled URLs reach this request.
    response = await send();
    const wait = Number(response.headers.get('retry-after'));
    if (response.status === 429 && wait > 0 && wait <= 8) { await response.body?.cancel(); await new Promise(r => setTimeout(r, wait * 1000)); response = await send(); }
  } catch { throw new ApiError(502, 'AI_UNAVAILABLE', 'The AI assistant did not respond. Nothing was saved; please try again.'); }
  if (response.status === 429) { await response.body?.cancel(); throw new ApiError(429, 'AI_BUSY', 'The AI assistant is busy right now. Please try again in a minute.'); }
  if (!response.ok) { await response.body?.cancel(); console.warn(`AI provider returned HTTP ${response.status} for ${feature}`); throw new ApiError(502, 'AI_UNAVAILABLE', 'The AI assistant could not complete this request. Nothing was saved.'); }
  const text = await response.text();
  if (text.length > 200000) throw new ApiError(502, 'AI_INVALID_OUTPUT', 'The AI reply was too large to check.');
  let candidate: unknown;
  try { candidate = extractJson((JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ''); }
  catch { console.warn(`AI output for ${feature} was not JSON`); throw new ApiError(502, 'AI_INVALID_OUTPUT', 'The AI reply did not pass our safety checks, so it was discarded. Please try again.'); }
  const parsed = (aiSchemas[feature] as unknown as z.ZodType<AiResultMap[F]>).safeParse(fitToSchema(candidate));
  if (!parsed.success) {
    // Log field paths only, never record content.
    console.warn(`AI output for ${feature} rejected at: ${parsed.error.issues.map(i => i.path.join('.') || '(root)').slice(0, 6).join(', ')}`);
    // Development only: never enable AI_DEBUG where real records exist.
    if (process.env.AI_DEBUG === '1' && process.env.NODE_ENV !== 'production') console.warn(JSON.stringify(candidate).slice(0, 3000));
    throw new ApiError(502, 'AI_INVALID_OUTPUT', 'The AI reply did not pass our safety checks, so it was discarded. Please try again.');
  }
  return parsed.data;
}

/** Accept only real JPEG/PNG/WebP data URLs up to 2 MB, verified by file signature. */
export function checkImage(dataUrl: string): string {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new ApiError(400, 'INVALID_IMAGE', 'Choose a JPEG, PNG or WebP photo.');
  const bytes = Buffer.from(match[2], 'base64');
  const hex = bytes.subarray(0, 12).toString('hex');
  const valid = match[1] === 'png' ? hex.startsWith('89504e470d0a1a0a') : match[1] === 'jpeg' ? hex.startsWith('ffd8ff') : hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  if (!valid || bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== match[2]) throw new ApiError(400, 'INVALID_IMAGE', 'This photo could not be read or is larger than 2 MB.');
  return dataUrl;
}
