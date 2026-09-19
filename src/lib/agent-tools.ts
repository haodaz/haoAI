import prisma from '@/lib/prisma';
import { renderPPTX, SlideData } from '@/lib/pptx-renderer';
import * as ics from 'ics';
import { searchWeb } from '@/lib/search';

// ============================================
// Agent Tool Registry
// Centralised tool definitions + executors for 1v1 chat mode.
// ============================================

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

// ── Tool Definitions (OpenAI function-calling format) ───────────────────────

const TOOL_SEARCH_KB: ToolDefinition = {
  type: 'function',
  function: {
    name: 'searchKnowledgeBase',
    description: 'Search the company knowledge base for relevant information about Bristh Enrollment Partners, schools, admissions, policies, etc.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The keyword or phrase to search for' },
      },
      required: ['query'],
    },
  },
};

const TOOL_GENERATE_PPT: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_ppt',
    description: 'Generate a downloadable .pptx presentation file from a list of slide data. Call this when the user explicitly asks you to generate/create a PPT file.',
    parameters: {
      type: 'object',
      properties: {
        coverTitle: { type: 'string', description: 'Title on the cover slide' },
        coverSubtitle: { type: 'string', description: 'Subtitle on the cover slide' },
        theme: { type: 'string', enum: ['graphite', 'blue', 'emerald', 'light'], description: 'Color theme for the presentation' },
        slides: {
          type: 'array',
          description: 'Array of slide objects, each with a title and bullet points',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Slide title' },
              bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet points for this slide' },
            },
            required: ['title', 'bullets'],
          },
        },
      },
      required: ['coverTitle', 'slides'],
    },
  },
};

const TOOL_CREATE_CALENDAR: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_calendar_event',
    description: 'Create a downloadable .ics calendar event file. Call this when the user asks to schedule a meeting or create a calendar invite.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Meeting subject/title' },
        start: {
          type: 'array',
          items: { type: 'number' },
          description: 'Start time as [YYYY, MM, DD, HH, mm]. Use 24-hour format. Current year is 2026.',
        },
        duration: { type: 'number', description: 'Duration in minutes (default 60)' },
        description: { type: 'string', description: 'Brief agenda or purpose of the meeting' },
      },
      required: ['subject', 'start'],
    },
  },
};

const TOOL_DRAFT_EMAIL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'draft_email',
    description: 'Draft a professional email. This generates a preview; it does NOT actually send the email. Call this when the user asks to write or draft an email.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address (or name if unknown)' },
        subject: { type: 'string', description: 'Email subject line' },
        htmlBody: { type: 'string', description: 'Email body in HTML format. Use <p>, <br>, <ul>/<li> for structure. Professional and polite tone.' },
      },
      required: ['subject', 'htmlBody'],
    },
  },
};

const TOOL_SEARCH_WEB: ToolDefinition = {
  type: 'function',
  function: {
    name: 'searchWeb',
    description: 'Search the internet for real-time information about schools, institutions, admissions, market trends, competitors, etc. Use this when the user asks about specific schools, current events, or needs up-to-date information that may not be in the knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query in the most relevant language for results' },
      },
      required: ['query'],
    },
  },
};

// ── Per-Agent Tool Mapping ──────────────────────────────────────────────────

const AGENT_TOOLS: Record<string, ToolDefinition[]> = {
  alice:  [TOOL_SEARCH_KB],
  bob:    [TOOL_SEARCH_KB, TOOL_CREATE_CALENDAR],
  david:  [TOOL_SEARCH_KB],
  edda:   [TOOL_SEARCH_KB, TOOL_GENERATE_PPT],
  eric:   [TOOL_SEARCH_KB],
  fiona:  [TOOL_SEARCH_KB],
  grace:  [TOOL_SEARCH_KB, TOOL_DRAFT_EMAIL],
  scout:  [TOOL_SEARCH_KB, TOOL_SEARCH_WEB],
};

/**
 * Get the list of tool definitions available for a given agent.
 */
export function getAgentTools(agentId: string): ToolDefinition[] {
  return AGENT_TOOLS[agentId.toLowerCase()] || [TOOL_SEARCH_KB];
}

// ── Tool Executors ──────────────────────────────────────────────────────────

export async function executeAgentTool(
  toolName: string,
  args: Record<string, any>,
): Promise<{ result: any; uiPayload?: any }> {
  switch (toolName) {
    case 'searchKnowledgeBase':
      return executeSearchKB(args.query);

    case 'generate_ppt':
      return executeGeneratePPT(args);

    case 'create_calendar_event':
      return executeCreateCalendar(args);

    case 'draft_email':
      return executeDraftEmail(args);

    case 'searchWeb':
      return executeSearchWebTool(args.query);

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

// ── Individual executors ────────────────────────────────────────────────────

async function executeSearchKB(query: string) {
  const items = await prisma.knowledgeItem.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 3,
  });
  const result = items.length > 0
    ? items.map(i => ({ title: i.title, content: (i.content || '').slice(0, 500), category: i.category }))
    : [{ note: '知识库中没有查到该词条的相关信息。' }];
  return { result };
}

async function executeGeneratePPT(args: any) {
  const slides: SlideData[] = (args.slides || []).map((s: any) => ({
    title: s.title,
    bullets: s.bullets || [],
  }));

  const { fileUrl, fileName } = await renderPPTX({
    slides,
    theme: args.theme || 'blue',
    coverTitle: args.coverTitle,
    coverSubtitle: args.coverSubtitle,
  });

  return {
    result: { success: true, message: `已成功生成 ${slides.length} 页幻灯片。`, fileName },
    uiPayload: {
      type: 'ppt_download',
      fileUrl,
      fileName,
      slideCount: slides.length,
    },
  };
}

async function executeCreateCalendar(args: any) {
  const event: ics.EventAttributes = {
    start: args.start as ics.DateArray,
    duration: { minutes: args.duration || 60 },
    title: args.subject,
    description: args.description || '',
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    organizer: { name: 'Bristh Agent (Bob)', email: 'bob@bristh.com' },
  };

  const { error, value } = ics.createEvent(event);
  if (error) {
    return { result: { error: 'Failed to create calendar event: ' + error.message } };
  }

  // Convert ICS to base64 data URI for download
  const base64 = Buffer.from(value || '').toString('base64');
  const dataUri = `data:text/calendar;base64,${base64}`;

  return {
    result: { success: true, message: `已创建日历事件：${args.subject}` },
    uiPayload: {
      type: 'ics_download',
      fileUrl: dataUri,
      fileName: `Meeting_${Date.now()}.ics`,
      subject: args.subject,
      start: args.start,
      duration: args.duration || 60,
    },
  };
}

async function executeDraftEmail(args: any) {
  return {
    result: {
      success: true,
      message: '邮件草稿已生成。',
    },
    uiPayload: {
      type: 'email_draft',
      to: args.to || '(未指定)',
      subject: args.subject,
      htmlBody: args.htmlBody,
    },
  };
}

async function executeSearchWebTool(query: string) {
  try {
    const data = await searchWeb(query);
    const summary = data.AbstractText || '未找到相关信息。';
    const sources = data.RelatedTopics?.slice(0, 5).map(t => ({
      text: t.Text || '',
      url: t.FirstURL || '',
    })) || [];
    return {
      result: {
        summary,
        heading: data.Heading || '',
        url: data.AbstractURL || '',
        sources,
        searchEngine: data.source,
      },
    };
  } catch (err: any) {
    return { result: { error: `搜索失败: ${err.message}` } };
  }
}
