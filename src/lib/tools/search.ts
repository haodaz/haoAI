/**
 * 统一搜索工具
 * 
 * 策略：优先使用阿里云大模型搜索，失败或未配置时降级到 Bocha API，最后使用 DuckDuckGo。
 * 返回结构兼容 DuckDuckGo Instant Answer API，方便调用方统一处理结果。
 */

export interface SearchResult {
  AbstractText: string;
  AbstractURL: string;
  Heading: string;
  RelatedTopics: Array<{ Text?: string; FirstURL?: string }>;
  /** 实际使用的搜索来源 */
  source: 'aliyun' | 'bocha' | 'duckduckgo';
}

/**
 * 调用阿里云大模型搜索（DashScope API）
 */
async function fetchAliyun(query: string): Promise<SearchResult> {
  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  
  if (!dashscopeKey || dashscopeKey === 'sk-your-dashscope-key-here') {
    throw new Error('未配置 DASHSCOPE_API_KEY，无法执行搜索。');
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dashscopeKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索助手，请根据用户的问题搜索相关信息并提供准确的答案。',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        enable_search: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`阿里云 API 返回错误状态码：${res.status}`);
    }

    const data = await res.json();
    console.log('[Aliyun] 搜索原始响应:', data);
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return { AbstractText: '', AbstractURL: '', Heading: '', RelatedTopics: [], source: 'aliyun' };
    }

    return {
      AbstractText: content,
      AbstractURL: '',
      Heading: '阿里云大模型搜索结果',
      RelatedTopics: [],
      source: 'aliyun',
    };
  } catch (err: any) {
    console.error('[Aliyun] 搜索失败:', err.message);
    throw new Error(`阿里云搜索失败: ${err.message}`);
  }
}

/**
 * 调用 Bocha API 并转换为兼容结构
 */
async function fetchBocha(query: string, count = 10): Promise<SearchResult> {
  const bochaKey = process.env.BOCHA_API_KEY;
  if (!bochaKey || bochaKey === 'your-bocha-key-here') {
    throw new Error('未配置 BOCHA_API_KEY，无法执行搜索。');
  }

  try {
    const res = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bochaKey}`,
      },
      body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Bocha API 返回错误状态码：${res.status}`);
    }

    const data = await res.json();
    const results: Array<{ name?: string; url?: string; snippet?: string }> =
      data.data?.webPages?.value ?? [];

    if (results.length === 0) {
      return { AbstractText: '', AbstractURL: '', Heading: '', RelatedTopics: [], source: 'bocha' };
    }

    return {
      // 拼接所有结果摘要，方便后续全文检索匹配
      AbstractText: results.map((r) => r.snippet ?? '').filter(Boolean).join(' | '),
      AbstractURL: results[0]?.url ?? '',
      Heading: results[0]?.name ?? '',
      RelatedTopics: results.slice(1).map((r) => ({
        Text: r.snippet ?? '',
        FirstURL: r.url ?? '',
      })),
      source: 'bocha',
    };
  } catch (err: any) {
    console.error('[Bocha] 搜索失败:', err.message);
    throw new Error(`搜索失败: ${err.message}`);
  }
}

/**
 * 统一搜索：优先使用阿里云大模型搜索，失败时降级到 Bocha API
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  try {
    return await fetchAliyun(query);
  } catch (err) {
    console.warn('[Search] 阿里云搜索失败，降级到 Bocha:', err);
    return fetchBocha(query);
  }
}
