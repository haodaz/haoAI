import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

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
  'deepseek-v3': {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'DashScope',
    modelName: 'deepseek-v3',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    supportsJsonMode: true,
    // DeepSeek-specific: no extra params needed, fully OpenAI-compatible
  },
  'claude-sonnet': {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 5',
    provider: 'Anthropic',
    modelName: 'claude-sonnet-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseURL: 'https://api.anthropic.com/v1',
    supportsJsonMode: false,
    extraParams: { defaultHeaders: { 'anthropic-version': '2023-06-01' } },
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
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    modelName: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    supportsJsonMode: true,
  },
};

// File to persist model selection (server-side) — use /tmp for deployed environments
const SELECTION_FILE = path.join('/tmp', 'bristh-model-selection.json');

/**
 * Get the currently selected model ID.
 * Falls back to 'deepseek-v3' if no selection exists.
 */
export async function getSelectedModelId(): Promise<string> {
  try {
    const raw = await fs.readFile(SELECTION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return data.modelId || 'deepseek-v3';
  } catch {
    return 'deepseek-v3';
  }
}

/**
 * Set the currently selected model ID.
 */
export async function setSelectedModelId(modelId: string): Promise<void> {
  await fs.writeFile(SELECTION_FILE, JSON.stringify({ modelId, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
}

/**
 * Get the model config for the currently selected model.
 */
export async function getActiveModelConfig(): Promise<ModelConfig> {
  const modelId = await getSelectedModelId();
  return MODEL_REGISTRY[modelId] || MODEL_REGISTRY['deepseek-v3'];
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
