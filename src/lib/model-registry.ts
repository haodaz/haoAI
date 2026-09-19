import OpenAI from 'openai';
import prisma from '@/lib/prisma';

// ============================================
// Model Registry: All model configurations
// Each model's specific settings are preserved
// ============================================

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  apiKeyEnv: string;
  baseURL: string;
  supportsJsonMode: boolean;       // Whether response_format: json_object works
  maxTokens?: number;
  extraParams?: Record<string, any>; // Provider-specific params (preserved per model)
}

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'gemini-38-flash': {
    id: 'gemini-38-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google',
    modelName: 'gemini-3.8-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    supportsJsonMode: true,
  },
  'gemini-31-pro': {
    id: 'gemini-31-pro',
    name: 'Gemini 3.1 Pro (Preview)',
    provider: 'Google',
    modelName: 'gemini-3.1-pro-preview',
    apiKeyEnv: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    supportsJsonMode: true,
  },
  'gemini-flash': {
    id: 'gemini-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'Google',
    modelName: 'gemini-3.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    supportsJsonMode: true,
  },
  'gemini-flash-latest': {
    id: 'gemini-flash-latest',
    name: 'Gemini 3.6 Flash',
    provider: 'Google',
    modelName: 'gemini-3.6-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    supportsJsonMode: true,
  },
  'gpt-6-astra': {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    provider: 'OpenAI',
    modelName: 'gpt-6-astra',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    supportsJsonMode: true,
  },
  'gpt-56-terra': {
    id: 'gpt-56-terra',
    name: 'GPT-5.6 Terra',
    provider: 'OpenAI',
    modelName: 'gpt-5.6-terra',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    supportsJsonMode: true,
  },
  'gpt-56-luna': {
    id: 'gpt-56-luna',
    name: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    modelName: 'gpt-5.6-luna',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    supportsJsonMode: true,
  },
};

export const DEFAULT_MODEL_ID = 'gpt-56-luna';

// Model selection is stored in the DB (SystemMeta) so every server instance agrees on it.
const SELECTION_KEY = 'selected_model_id';
const SELECTION_CACHE_MS = 15_000;
let selectionCache: { modelId: string; at: number } | null = null;

/**
 * Get the currently selected model ID.
 * Falls back to DEFAULT_MODEL_ID if no valid selection exists.
 */
export async function getSelectedModelId(): Promise<string> {
  if (selectionCache && Date.now() - selectionCache.at < SELECTION_CACHE_MS) {
    return selectionCache.modelId;
  }
  let modelId = DEFAULT_MODEL_ID;
  try {
    const meta = await prisma.systemMeta.findUnique({ where: { key: SELECTION_KEY } });
    if (meta?.value && MODEL_REGISTRY[meta.value]) modelId = meta.value;
  } catch (err) {
    console.error('[ModelRegistry] Failed to read model selection:', err);
  }
  selectionCache = { modelId, at: Date.now() };
  return modelId;
}

/**
 * Set the currently selected model ID.
 */
export async function setSelectedModelId(modelId: string): Promise<void> {
  await prisma.systemMeta.upsert({
    where: { key: SELECTION_KEY },
    update: { value: modelId },
    create: { key: SELECTION_KEY, value: modelId },
  });
  selectionCache = { modelId, at: Date.now() };
}

/**
 * Get the model config for the currently selected model.
 */
export async function getActiveModelConfig(): Promise<ModelConfig> {
  const modelId = await getSelectedModelId();
  return MODEL_REGISTRY[modelId] || MODEL_REGISTRY[DEFAULT_MODEL_ID];
}

/**
 * Create an OpenAI-compatible client for the currently selected model.
 * All three providers (DashScope, Anthropic, Google) support OpenAI-compatible APIs.
 */
export async function getModelClient(): Promise<{ client: OpenAI; config: ModelConfig }> {
  const config = await getActiveModelConfig();
  const apiKey = process.env[config.apiKeyEnv] || 'mock_key';
  
  const clientOptions: any = {
    apiKey,
    baseURL: config.baseURL,
  };

  // Anthropic requires anthropic-version header
  if (config.provider === 'Anthropic') {
    clientOptions.defaultHeaders = { 'anthropic-version': '2023-06-01' };
  }
  
  const client = new OpenAI(clientOptions);
  
  return { client, config };
}

/**
 * Build chat completion params with model-specific handling.
 * This preserves DeepSeek's json_object mode while gracefully handling
 * models that don't support it (Claude uses prompt-based JSON).
 */
export function buildCompletionParams(
  config: ModelConfig,
  messages: Array<{ role: string; content: string }>,
  options: {
    requireJson?: boolean;
    maxTokens?: number;
    stream?: boolean;
  } = {}
): any {
  // Gemini & Claude compatibility: must have at least one user-role message
  let processedMessages = [...messages];
  if (config.provider === 'Anthropic' || config.provider === 'Google') {
    const hasUserMsg = processedMessages.some(m => m.role === 'user');
    if (!hasUserMsg) {
      const lastSystem = processedMessages.filter(m => m.role === 'system').pop();
      if (lastSystem && processedMessages.length === 1) {
        processedMessages = [
          { role: 'system', content: lastSystem.content },
          { role: 'user', content: 'Please execute the task described in the system prompt and return the output.' }
        ];
      } else {
        processedMessages.push({ role: 'user', content: 'Please execute the task and return the output.' });
      }
    }
  }

  const params: any = {
    model: config.modelName,
    messages: processedMessages,
  };
  
  if (options.stream) {
    params.stream = true;
  }
  
  // JSON mode: only use response_format for models that support it
  if (options.requireJson && config.supportsJsonMode) {
    params.response_format = { type: 'json_object' };
  }
  
  // If model doesn't support JSON mode but we need JSON, add instruction to prompt
  if (options.requireJson && !config.supportsJsonMode) {
    const lastMsg = params.messages[params.messages.length - 1];
    if (lastMsg && !lastMsg.content.includes('Output ONLY valid JSON')) {
      lastMsg.content += '\n\nIMPORTANT: Output ONLY valid JSON. No markdown, no explanations, just the JSON object.';
    }
  }
  
  // max_tokens: required for Claude, optional for others
  if (options.maxTokens) {
    params.max_tokens = options.maxTokens;
  } else if (config.provider === 'Anthropic') {
    params.max_tokens = 4096; // Claude requires explicit max_tokens
  }
  
  // Note: extraParams like defaultHeaders are for OpenAI client constructor, NOT for request body.
  // Do NOT apply them here — they would pollute the request and cause 400 errors on Gemini/others.
  
  return params;
}

// ============================================
// Token-tracked completion wrapper
// ============================================

import type { TokenTracker } from '@/lib/token-tracker';

/**
 * Wraps client.chat.completions.create with automatic token tracking.
 * Drop-in replacement: just pass a tracker + stage name.
 */
export async function trackableCompletion(
  tracker: TokenTracker,
  stage: string,
  client: OpenAI,
  config: ModelConfig,
  params: any
) {
  const start = Date.now();
  const response = await client.chat.completions.create(params);
  const durationMs = Date.now() - start;
  tracker.track(stage, config.modelName, response.usage, durationMs);
  return response;
}

// ============================================
// Internal Base URL for server-to-server calls
// ============================================

/**
 * Returns the base URL for internal API calls (agent → toolbox delegation).
 * Works in both local dev and Vercel production.
 * 
 * IMPORTANT: VERCEL_URL points to deployment-specific URLs (e.g. hao-xxx.vercel.app)
 * which are protected by Vercel Deployment Protection (returns 401).
 * We must use the production domain instead.
 */
export function getInternalBaseUrl(): string {
  // Explicit config takes priority
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  // Vercel auto-sets VERCEL_PROJECT_PRODUCTION_URL to the production domain
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // Fallback: use the custom domain directly when on Vercel
  if (process.env.VERCEL) return 'https://www.bepoffice.com';
  // Local development fallback
  return `http://localhost:${process.env.PORT || '5859'}`;
}
