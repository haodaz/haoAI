import { loadAgentConfig, loadAgentContext } from '@/lib/bristh-config';
import { getActiveModelConfig } from '@/lib/model-registry';
import { getAgentTools, executeAgentTool, ToolDefinition } from '@/lib/agent-tools';
import { loadSoulFile, loadAgentMemories } from '@/lib/memory-engine';

// ============================================
// /api/chat/agent — 1v1 Agent Chat (SSE stream)
// Uses proven raw-fetch streaming (same as external/route.ts)
// ============================================

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { agentId, messages, locale } = await req.json();

    if (!agentId) {
      return new Response(JSON.stringify({ error: 'Missing agentId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Load agent config & context
    const config = await loadAgentConfig(agentId);
    if (!config) {
      return new Response(JSON.stringify({ error: `Agent "${agentId}" not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const privateContext = await loadAgentContext(agentId);

    // 2. Build system prompt
    let systemPrompt = config.persona || `You are ${config.name}, an AI assistant at Bristh Enrollment Partners.`;
    systemPrompt += `\n\nYour name is ${config.name}, your title is "${config.title}".`;
    systemPrompt += `\nYou are in 1-on-1 chat mode with a user. Be helpful, conversational, and professional.`;
    systemPrompt += `\nWhen the user asks you to perform a concrete task (generate PPT, create calendar, draft email), use the appropriate tool. Do NOT explain what you would do — actually call the tool.`;
    systemPrompt += `\nWhen answering knowledge-related questions, use the searchKnowledgeBase tool if needed.`;
    const isZh = locale?.startsWith('zh');
    const isEn = locale?.startsWith('en');
    if (isZh) {
      systemPrompt += `\n【语言要求】请始终使用简体中文进行对话和输出，不要使用英文。`;
    } else if (isEn) {
      systemPrompt += `\n【Language Requirement】Always respond entirely in English. Do not use Chinese.`;
    } else {
      systemPrompt += `\nAlways respond in the same language the user uses (Chinese or English).`;
    }

    if (privateContext) {
      systemPrompt += `\n\nAgent-specific reference knowledge:\n${privateContext}`;
    }

    // 2b. Inject soul file and recent memories
    try {
      const [soul, recentMemories] = await Promise.all([
        loadSoulFile(agentId),
        loadAgentMemories(agentId, 10),
      ]);
      if (soul) {
        systemPrompt += `\n\n【你的灵魂文件 — 长期积累的经验和认知】:\n${soul}`;
      }
      if (recentMemories.length > 0) {
        const memStr = recentMemories.map(m => `- [${m.type}] ${m.content}`).join('\n');
        systemPrompt += `\n\n【近期记忆 — 运用这些经验】:\n${memStr}`;
      }
    } catch (e) {
      console.warn('Failed to load memories for chat:', e);
    }

    // 3. Get tools for this agent
    const tools = getAgentTools(agentId);

    // 4. Get model config (for API key + base URL)
    const modelConfig = await getActiveModelConfig();
    const apiKey = process.env[modelConfig.apiKeyEnv] || '';
    const baseURL = modelConfig.baseURL;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (type: string, payload: Record<string, unknown> = {}) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
          } catch { /* controller may be closed */ }
        };

        try {
          // Build full message history
          const fullMessages: any[] = [
            { role: 'system', content: systemPrompt },
            ...messages.map((m: any) => ({ role: m.role, content: m.content })),
          ];

          let loopCount = 0;
          const MAX_TOOL_LOOPS = 5;

          while (loopCount < MAX_TOOL_LOOPS) {
            loopCount++;

            // Stream LLM response via raw fetch (proven pattern)
            const result = await streamRawFetch(
              baseURL,
              apiKey,
              modelConfig.modelName,
              fullMessages,
              tools,
              (token) => emit('delta', { content: token }),
              modelConfig.provider,
            );

            // No tool calls — we're done
            if (!result.tool_calls || result.tool_calls.length === 0) {
              break;
            }

            // Tool calls detected — execute them
            emit('reset');

            // Add assistant message with tool_calls to conversation
            fullMessages.push({
              role: 'assistant',
              content: result.content || '',
              tool_calls: result.tool_calls,
            });

            // Execute each tool
            for (const tc of result.tool_calls) {
              const toolName = tc.function.name;
              let args: Record<string, any>;
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                args = {};
              }

              emit('tool_start', { taskId: tc.id, taskName: toolName });
              emit('tool_log', { taskId: tc.id, message: `正在执行 ${toolName}...` });

              try {
                const { result: toolResult, uiPayload } = await executeAgentTool(toolName, args);

                emit('tool_log', { taskId: tc.id, message: `✅ ${toolName} 执行完成` });
                emit('tool_end', { taskId: tc.id, status: 'success', uiPayload });

                fullMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: toolName,
                  content: JSON.stringify(toolResult),
                });
              } catch (err: any) {
                emit('tool_log', { taskId: tc.id, message: `❌ ${toolName} 执行失败: ${err.message}` });
                emit('tool_end', { taskId: tc.id, status: 'error' });

                fullMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: toolName,
                  content: JSON.stringify({ error: err.message }),
                });
              }
            }
          }

          emit('final', { content: '', skip_overwrite: true });
        } catch (err: any) {
          console.error('[chat/agent] Error:', err);
          emit('error', { error: err.message || '服务异常，请稍后重试' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[chat/agent] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Raw fetch streaming (proven pattern from external/route.ts) ─────────────

async function streamRawFetch(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: any[],
  tools: ToolDefinition[],
  onToken: (token: string) => void,
  provider?: string,
): Promise<{ content: string; tool_calls?: any[] }> {
  // OpenAI reasoning models: must use /v1/responses API for function tools
  if (provider === 'OpenAI' && tools.length > 0) {
    return streamOpenAIResponses(baseURL, apiKey, model, messages, tools, onToken);
  }

  // Sanitize messages for the API — preserve tool-related fields
  const apiMessages = messages.map((m: any) => {
    const msg: any = { role: m.role, content: m.content };
    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.name) msg.name = m.name;
    return msg;
  });

  // Build request body
  const body: any = {
    model,
    messages: apiMessages,
    tools,
    stream: true,
  };

  // Gemini: disable thinking when tools are used to avoid thought_signature issues
  if (provider === 'Google' && tools.length > 0 && model.toLowerCase().includes('thinking')) {
    body.thinking = { thinking_budget: 0 };
  }

  const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[chat/agent] LLM API Error (${response.status}):`, errorText);
    throw new Error(`LLM API Error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('No response body from LLM');
  }

  return parseChatCompletionsStream(response.body, onToken);
}

// ── OpenAI Responses API streaming ──────────────────────────────────────────

async function streamOpenAIResponses(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: any[],
  tools: ToolDefinition[],
  onToken: (token: string) => void,
): Promise<{ content: string; tool_calls?: any[] }> {
  // Convert chat messages to Responses API input format
  const input = messages.map((m: any) => {
    // Tool result messages → use special format
    if (m.role === 'tool') {
      return {
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: m.content,
      };
    }
    // Assistant message with tool_calls → convert to function_call items
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const items: any[] = [];
      if (m.content) {
        items.push({ type: 'message', role: 'assistant', content: m.content });
      }
      for (const tc of m.tool_calls) {
        items.push({
          type: 'function_call',
          id: tc.id,
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
      return items;
    }
    // Regular messages (system/user/assistant)
    return { role: m.role, content: m.content };
  }).flat();

  // Convert tools to Responses API format
  const responsesTools = tools.map((t: any) => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  const body = {
    model,
    input,
    tools: responsesTools,
    stream: true,
  };

  const response = await fetch(`${baseURL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[chat/agent] OpenAI Responses API Error (${response.status}):`, errorText);
    throw new Error(`LLM API Error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('No response body from OpenAI Responses API');
  }

  // Parse Responses API SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let assistantMessage = '';
  let toolCalls: any[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

      try {
        const event = JSON.parse(trimmed.slice(6));
        const type = event.type;

        // Text content delta
        if (type === 'response.output_text.delta') {
          const delta = event.delta || '';
          assistantMessage += delta;
          onToken(delta);
        }

        // Function call: capture name + arguments
        if (type === 'response.function_call_arguments.delta') {
          const idx = toolCalls.findIndex(tc => tc.id === event.item_id);
          if (idx >= 0) {
            toolCalls[idx].function.arguments += event.delta || '';
          }
        }

        // New output item (could be message or function_call)
        if (type === 'response.output_item.added' && event.item?.type === 'function_call') {
          toolCalls.push({
            id: event.item.call_id || event.item.id,
            type: 'function',
            function: {
              name: event.item.name || '',
              arguments: '',
            },
          });
        }
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }

  return {
    content: assistantMessage,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ── Chat Completions stream parser (Google, DashScope, etc.) ────────────────

async function parseChatCompletionsStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
): Promise<{ content: string; tool_calls?: any[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let assistantMessage = '';
  let toolCalls: any[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        const choice = data.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text content
        if (delta?.content) {
          assistantMessage += delta.content;
          onToken(delta.content);
        }

        // Tool calls (streamed incrementally)
        // IMPORTANT: Preserve ALL fields from the delta (Gemini requires thought_signature)
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: tc.id || `call_${idx}`,
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            // Preserve id
            if (tc.id) toolCalls[idx].id = tc.id;
            // Accumulate function name and arguments
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            // Preserve any extra fields (e.g. Gemini's thought_signature)
            for (const key of Object.keys(tc)) {
              if (!['index', 'id', 'type', 'function'].includes(key)) {
                toolCalls[idx][key] = tc[key];
              }
            }
          }
        }
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }

  return {
    content: assistantMessage,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

