'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Download, FileText, Calendar, Mail, Sparkles, Bot, User, ChevronRight, Loader2, Copy, Zap, PlusCircle, Clock } from 'lucide-react';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import VoiceInputButton from '@/components/ui/VoiceInputButton';
import { useWorkspace } from '@/components/layout/WorkspaceContext';

interface AgentConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  description_en?: string;
  avatar: string;
  realistic_avatar?: string;
  color: string;
  skills_preview: string[];
  skills_preview_en?: string[];
  greeting?: string;
  greeting_en?: string;
  quick_prompts?: string[];
  quick_prompts_en?: string[];
}

interface ToolCall {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  logs: string[];
  uiPayload?: any;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Record<string, ToolCall>;
  isWorking?: boolean;
}

const COLOR_MAP: Record<string, { accent: string; light: string; gradient: string }> = {
  blue:    { accent: 'text-blue-600',    light: 'bg-blue-50',    gradient: 'from-blue-500 to-blue-600' },
  emerald: { accent: 'text-emerald-600', light: 'bg-emerald-50', gradient: 'from-emerald-500 to-emerald-600' },
  purple:  { accent: 'text-purple-600',  light: 'bg-purple-50',  gradient: 'from-purple-500 to-purple-600' },
  red:     { accent: 'text-red-600',     light: 'bg-red-50',     gradient: 'from-red-500 to-red-600' },
  amber:   { accent: 'text-amber-600',   light: 'bg-amber-50',   gradient: 'from-amber-500 to-amber-600' },
  cyan:    { accent: 'text-cyan-600',    light: 'bg-cyan-50',    gradient: 'from-cyan-500 to-cyan-600' },
  pink:    { accent: 'text-pink-600',    light: 'bg-pink-50',    gradient: 'from-pink-500 to-pink-600' },
  indigo:  { accent: 'text-indigo-600',  light: 'bg-indigo-50',  gradient: 'from-indigo-500 to-indigo-600' },
};

export default function AgentChat({ agent, onBack }: { agent: AgentConfig; onBack: () => void }) {
  const { i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { pendingAgentTask, setPendingAgentTask } = useWorkspace();
  const pendingTaskHandled = useRef(false);
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; date: string; preview: string }[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEn = i18n.language?.startsWith('en');
  const greeting = isEn ? (agent.greeting_en || agent.greeting) : agent.greeting;
  const quickPrompts = isEn ? (agent.quick_prompts_en || agent.quick_prompts) : agent.quick_prompts;
  const agentDesc = isEn ? (agent.description_en || agent.description) : agent.description;
  const agentSkills = isEn ? (agent.skills_preview_en || agent.skills_preview) : agent.skills_preview;
  const sidebarAvatar = agent.realistic_avatar || agent.avatar;

  // Initialize with greeting
  useEffect(() => {
    if (greeting) {
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: greeting,
      }]);
    }
  }, [agent.id, isEn]);

  // Handle pending agent task from group chat navigation
  useEffect(() => {
    if (pendingAgentTask && pendingAgentTask.agentId === agent.id && !pendingTaskHandled.current) {
      pendingTaskHandled.current = true;
      const taskMsg = `以下是之前在群聊中的讨论记录：\n\n${pendingAgentTask.context}\n\n---\n\n请你分析上面的讨论内容，明确说明你接到了什么任务、你将要做什么。等我确认后再执行。`;
      setPendingAgentTask(null);
      // Delay slightly so greeting renders first
      setTimeout(() => sendMessage(taskMsg), 500);
    }
  }, [pendingAgentTask, agent.id]);

  const colors = COLOR_MAP[agent.color] || COLOR_MAP.blue;

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };

    const assistantMsgId = `assistant-${Date.now() + 1}`;
    const initialAssistant: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
    };

    setMessages(prev => [...prev, userMsg, initialAssistant]);
    setLoading(true);

    try {
      // Build message history for API (exclude greeting, only user/assistant content)
      const historyForApi = [...messagesRef.current, userMsg]
        .filter(m => m.content && m.content !== '⏳')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, messages: historyForApi, locale: i18n.language }),
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentContent = '';
      let networkBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        networkBuffer += decoder.decode(value, { stream: true });
        const lines = networkBuffer.split('\n');
        networkBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim().startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.trim().slice(6));

            if (data.type === 'delta') {
              currentContent += data.content;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId ? { ...msg, content: currentContent } : msg
                )
              );
            } else if (data.type === 'reset') {
              currentContent = '';
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId ? { ...msg, content: '⏳' } : msg
                )
              );
            } else if (data.type === 'final') {
              if (!data.skip_overwrite) {
                currentContent = data.content;
              }
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId ? { ...msg, content: currentContent } : msg
                )
              );
            } else if (data.type === 'error') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: `（出错：${data.error || '请刷新后重试'}）` }
                    : msg
                )
              );
            } else if (data.type === 'tool_start') {
              setMessages(prev => prev.map(msg => {
                if (msg.id !== assistantMsgId) return msg;
                return {
                  ...msg,
                  isWorking: true,
                  toolCalls: {
                    ...msg.toolCalls,
                    [data.taskId]: { id: data.taskId, name: data.taskName, status: 'running', logs: [] },
                  },
                };
              }));
            } else if (data.type === 'tool_log') {
              setMessages(prev => prev.map(msg => {
                if (msg.id !== assistantMsgId) return msg;
                const tc = msg.toolCalls?.[data.taskId];
                if (!tc) return msg;
                return {
                  ...msg,
                  toolCalls: {
                    ...msg.toolCalls,
                    [data.taskId]: { ...tc, logs: [...tc.logs, data.message] },
                  },
                };
              }));
            } else if (data.type === 'tool_end') {
              setMessages(prev => prev.map(msg => {
                if (msg.id !== assistantMsgId) return msg;
                const tc = msg.toolCalls?.[data.taskId];
                if (!tc) return msg;
                return {
                  ...msg,
                  isWorking: false,
                  toolCalls: {
                    ...msg.toolCalls,
                    [data.taskId]: { ...tc, status: data.status, uiPayload: data.uiPayload },
                  },
                };
              }));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId ? { ...msg, content: '（网络异常，请稍后重试）' } : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }, [agent.id, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="h-full flex">
      {/* Main Chat Area — aurora gradient bg extends behind everything */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Aurora gradient background — covers entire chat area including input */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
          <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-violet-200/20 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
        </div>

        {/* Header */}
        <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-sm flex items-center gap-3 shrink-0 relative z-10">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <img src={agent.avatar} alt={agent.name} className="w-8 h-8 rounded-full object-cover bg-gray-100" />
          <div className="min-w-0">
            <h2 className="text-sm font-black text-gray-900 truncate">{agent.name}</h2>
            <p className="text-[10px] text-gray-400 font-medium truncate">{agent.title}</p>
          </div>
          <button
            onClick={() => {
              setMessages(greeting ? [{ id: 'greeting', role: 'assistant', content: greeting }] : []);
              setInput('');
            }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">{isEn ? 'New Chat' : '新对话'}</span>
          </button>
        </div>

        {/* Scrollable content area — messages + input share max-w-3xl */}
        <div className="flex-1 flex flex-col overflow-y-auto relative z-10">
          {/* Messages */}
          <div className="flex-1 px-4 md:px-6 py-4 space-y-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  {msg.role === 'assistant' ? (
                    <img src={agent.avatar} alt={agent.name} className="w-8 h-8 rounded-full object-cover bg-gray-100 shrink-0 mt-1" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={`max-w-[75%] group/bubble ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-tr-sm'
                          : 'bg-white/80 backdrop-blur-sm text-gray-800 rounded-tl-sm border border-gray-100/80 shadow-sm'
                      }`}
                    >
                      {msg.content === '⏳' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : msg.role === 'assistant' ? (
                        <div
                          className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5"
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || '') }}
                        />
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* Bubble action bar */}
                    {msg.role === 'assistant' && msg.content && msg.content !== '⏳' && (
                      <div className="flex items-center gap-1 mt-1 ml-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                        <button
                          onClick={() => { navigator.clipboard.writeText(msg.content); message.success('已复制'); }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="复制内容"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            const taskMsg = `请你基于我们的对话，立刻执行任务。分析上下文，明确说明你接到了什么任务、你将要做什么。等我确认后再执行。`;
                            sendMessage(taskMsg);
                          }}
                          className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                          title="让 AI 执行任务"
                        >
                          <Zap className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Tool Call Cards */}
                    {msg.toolCalls && Object.values(msg.toolCalls).map(tc => (
                      <ToolCallCard key={tc.id} toolCall={tc} colors={colors} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Quick prompts — only show if there's just the greeting */}
              {messages.length <= 1 && quickPrompts && quickPrompts.length > 0 && (
                <div className="flex flex-col items-start gap-2 pt-2">
                  <p className="text-xs font-bold text-gray-400 ml-11">{isEn ? '💡 You might ask' : '💡 你可能想问'}</p>
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(prompt)}
                      className="ml-11 text-left text-xs text-indigo-600 font-medium px-3 py-2 bg-white/70 backdrop-blur-sm hover:bg-indigo-50 rounded-xl border border-indigo-100/80 transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Loading indicator */}
              {loading && messages[messages.length - 1]?.content === '' && (
                <div className="flex gap-3">
                  <img src={agent.avatar} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-100 shrink-0" />
                  <div className="px-4 py-3 bg-white/80 backdrop-blur-sm rounded-2xl rounded-tl-sm border border-gray-100/80 shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area — transparent bg, same max-w-3xl as messages */}
          <div className="px-4 md:px-6 py-3 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-end bg-white/90 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                {/* Mic button — inside left */}
                <div className="flex items-center pl-3 pb-3 shrink-0">
                  <VoiceInputButton
                    onTranscript={(text) => setInput(prev => prev + text)}
                    lang={i18n.language === 'zh' ? 'zh-CN' : 'en-US'}
                  />
                </div>
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isEn ? `Tell ${agent.name} what you need...` : `告诉 ${agent.name} 你的需求...`}
                  rows={1}
                  className="flex-1 resize-none px-2 py-3 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                  style={{ maxHeight: '120px' }}
                  onInput={e => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                  }}
                />
                {/* Send button — inside right */}
                <div className="flex items-center pr-2 pb-2 shrink-0">
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className="p-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-center text-[10px] text-gray-300 mt-2">{isEn ? 'Shift+Enter new line · Enter send' : 'Shift+Enter 换行 · Enter 发送'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar — Agent Info (desktop only) */}
      <div className="hidden lg:flex w-72 border-l border-gray-100 bg-white flex-col shrink-0 overflow-y-auto">
        <div className="p-5 text-center border-b border-gray-50">
          <div className="w-20 h-20 mx-auto rounded-2xl shadow-lg mb-3 overflow-hidden">
            <img src={sidebarAvatar} alt={agent.name} className="w-full h-full object-cover" />
          </div>
          <h3 className="text-sm font-black text-gray-900">{agent.name}</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5">{agent.title}</p>
        </div>

        <div className="p-4 border-b border-gray-50">
          <p className="text-xs text-gray-500 leading-relaxed">{agentDesc}</p>
        </div>

        <div className="p-4 border-b border-gray-50">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{isEn ? 'Skills' : '技能'}</p>
          <div className="flex flex-wrap gap-1.5">
            {agentSkills.map(skill => (
              <span key={skill} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.light} ${colors.accent}`}>
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-gray-50">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{isEn ? 'Tools' : '可用工具'}</p>
          <div className="space-y-2">
            {getToolsForDisplay(agent.id).map(tool => (
              <div key={tool.name} className="flex items-center gap-2 text-xs text-gray-600">
                <tool.icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>{tool.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        <div className="p-4 flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{isEn ? 'Chat History' : '对话历史'}</p>
          {chatHistory.length === 0 ? (
            <p className="text-[11px] text-gray-300 italic">{isEn ? 'No previous chats' : '暂无历史对话'}</p>
          ) : (
            <div className="space-y-1.5">
              {chatHistory.map(h => (
                <button key={h.id} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                    <span className="text-[11px] font-bold text-gray-600 truncate">{h.title}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate pl-[18px]">{h.preview}</p>
                  <p className="text-[9px] text-gray-300 pl-[18px] mt-0.5">{h.date}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tool Call Card Component ────────────────────────────────────────────────

function ToolCallCard({ toolCall, colors }: { toolCall: ToolCall; colors: any }) {
  const isRunning = toolCall.status === 'running';
  const isSuccess = toolCall.status === 'success';

  const TOOL_LABELS: Record<string, string> = {
    generate_ppt: '🎨 PPT 生成',
    create_calendar_event: '📅 日历事件',
    draft_email: '✉️ 邮件草稿',
    searchKnowledgeBase: '🔍 知识库检索',
  };

  return (
    <div className="mt-2 ml-0 bg-white border border-gray-200 rounded-xl p-3 shadow-sm max-w-[400px]">
      <div className="flex items-center gap-2 mb-2">
        {isRunning ? (
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
        ) : isSuccess ? (
          <Sparkles className="w-4 h-4 text-emerald-500" />
        ) : (
          <span className="w-4 h-4 text-red-500">✕</span>
        )}
        <span className="text-xs font-bold text-gray-700">
          {TOOL_LABELS[toolCall.name] || toolCall.name}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          isRunning ? 'bg-indigo-50 text-indigo-500' : isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
        }`}>
          {isRunning ? '执行中' : isSuccess ? '完成' : '失败'}
        </span>
      </div>

      {/* Logs */}
      {toolCall.logs.length > 0 && (
        <div className="space-y-1 mb-2">
          {toolCall.logs.map((log, idx) => (
            <p key={idx} className="text-[11px] text-gray-500 font-mono">{log}</p>
          ))}
        </div>
      )}

      {/* UI Payload — download buttons etc */}
      {toolCall.uiPayload && <ToolPayloadUI payload={toolCall.uiPayload} />}
    </div>
  );
}

// ── Tool Payload UI (downloads, previews) ───────────────────────────────────

function ToolPayloadUI({ payload }: { payload: any }) {
  if (payload.type === 'ppt_download') {
    return (
      <a
        href={payload.fileUrl}
        download={payload.fileName}
        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-bold text-indigo-600 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        下载 {payload.fileName} ({payload.slideCount} 页)
      </a>
    );
  }

  if (payload.type === 'ics_download') {
    return (
      <div>
        <p className="text-[11px] text-gray-500 mb-1.5">
          📅 {payload.subject} · {payload.start?.join('/')} · {payload.duration}分钟
        </p>
        <a
          href={payload.fileUrl}
          download={payload.fileName}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-bold text-emerald-600 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载日历文件 (.ics)
        </a>
      </div>
    );
  }

  if (payload.type === 'email_draft') {
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-gray-600">收件人: {payload.to}</p>
        <p className="text-[11px] font-bold text-gray-600">主题: {payload.subject}</p>
        <div
          className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 max-h-32 overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: payload.htmlBody }}
        />
      </div>
    );
  }

  return null;
}

// ── Helper: display tool list for sidebar ───────────────────────────────────

function getToolsForDisplay(agentId: string) {
  const base = [{ name: 'kb', icon: FileText, label: '知识库检索' }];

  const toolMap: Record<string, { name: string; icon: any; label: string }[]> = {
    edda: [{ name: 'ppt', icon: FileText, label: 'PPT 幻灯片生成' }],
    bob: [{ name: 'cal', icon: Calendar, label: '日历事件创建' }],
    grace: [{ name: 'email', icon: Mail, label: '邮件草稿撰写' }],
  };

  return [...base, ...(toolMap[agentId.toLowerCase()] || [])];
}
