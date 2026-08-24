
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Modal, Tooltip, Spin } from 'antd';
import { marked } from 'marked';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ThinkBlock, ToolCallsBlock, renderPreviewStandalone, COLOR_BORDER_MAP } from '@/components/shared/UIBlocks';
import { Building2, Cpu, Activity, History, BookOpen, Settings, Send, CheckCircle2, ChevronRight, ChevronLeft, Users, Layout, Plus, FileText, Calendar, Presentation, AlertTriangle, Scale, Mail, StopCircle, Edit, Edit3, Link2, UploadCloud, Terminal, Info, Download, MessageSquare, Wrench, PenTool, CheckCircle, XCircle, Hourglass, ChevronDown, ChevronUp, Database, Menu, X, Copy, RefreshCw, GitMerge, LogOut, UserCircle, Phone, AtSign, Camera, Save, ArrowLeft, ArrowRight, SaveAll, Loader2, Paperclip } from 'lucide-react';

function TaskHistoryView({ onOpenPptCopilot, onOpenDocCopilot }: { onOpenPptCopilot?: (data: { slides: any[]; fileUrl: string; topic: string }) => void; onOpenDocCopilot?: (data: { taskId: string; agent: string }) => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [contexts, setContexts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState<any>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  // Copilot state (self-contained)
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotTask, setCopilotTask] = useState<any>(null);
  const [copilotMsg, setCopilotMsg] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/bristh/tasks?mode=history')
      .then(r => r.json())
      .then(data => { setContexts(Array.isArray(data) ? data : []); setLoading(false); if (data.length > 0) setSelectedCtx(data[0]); })
      .catch(() => { setContexts([]); setLoading(false); });
  }, []);

  const STATUS_BADGE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: t('bristh.status.COMPLETED'), dot: 'bg-emerald-400' },
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-600', label: t('bristh.status.PENDING'), dot: 'bg-amber-400' },
    RUNNING: { bg: 'bg-blue-50', text: 'text-blue-600', label: t('bristh.status.RUNNING'), dot: 'bg-blue-400' },
    FAILED: { bg: 'bg-red-50', text: 'text-red-600', label: t('bristh.status.FAILED'), dot: 'bg-red-400' },
  };

  const SOURCE_MAP: Record<string, { label: string; icon: string }> = {
    EMAIL: { label: t('bristh.source.EMAIL'), icon: '📧' },
    TEXT_PASTE: { label: t('bristh.source.TEXT_PASTE'), icon: '✍️' },
    VOICE: { label: t('bristh.source.VOICE'), icon: '🎤' },
    API: { label: t('bristh.source.API'), icon: '🔗' },
  };

  const formatTime = (ts: string | number) => {
    try {
      const d = new Date(typeof ts === 'string' && !isNaN(Number(ts)) ? Number(ts) : ts);
      return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return String(ts); }
  };

  const formatDate = (ts: string | number) => {
    try {
      const d = new Date(typeof ts === 'string' && !isNaN(Number(ts)) ? Number(ts) : ts);
      return d.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return String(ts); }
  };

  const getOverallStatus = (tasks: any[]) => {
    if (tasks.every((t: any) => t.status === 'COMPLETED')) return 'COMPLETED';
    if (tasks.some((t: any) => t.status === 'FAILED')) return 'FAILED';
    if (tasks.some((t: any) => t.status === 'RUNNING')) return 'RUNNING';
    return 'PENDING';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const rerunTask = async (ctx: any) => {
    try {
      const res = await fetch('/api/bristh/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: ctx.source, rawContent: ctx.rawContent, locale: i18n.language })
      });
      if (res.ok) {
        // Reload history
        const data = await fetch('/api/bristh/tasks?mode=history').then(r => r.json());
        setContexts(data);
        setSelectedCtx(data[0]);
      }
    } catch (e) { console.error(e); }
  };

  const openCopilotForTask = async (task: any) => {
    // Universal: check payload.toolboxUrl first (Alice, Eric, Edda, Iris all set this)
    try {
      const payload = JSON.parse(task.resultPayload || '{}');
      if (payload.toolboxUrl) {
        router.push(payload.toolboxUrl);
        return;
      }
    } catch (e) {
      console.error('Failed to parse resultPayload:', e);
    }

    // For other agents, open DocumentEditorView
    if (onOpenDocCopilot) {
      onOpenDocCopilot({ taskId: task.id, agent: task.agent });
      return;
    }
    // Fallback: modal copilot
    setCopilotTask(null);
    setCopilotOpen(true);
    try {
      const res = await fetch(`/api/bristh/tasks/${task.id}`);
      const data = await res.json();
      setCopilotTask(data);
    } catch (e) { console.error(e); }
  };

  const sendCopilotMsg = async () => {
    if (!copilotMsg.trim() || !copilotTask) return;
    const msg = copilotMsg;
    setCopilotMsg('');
    setCopilotLoading(true);
    try {
      const res = await fetch(`/api/bristh/tasks/${copilotTask.id}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      if (res.ok) {
        const updated = await fetch(`/api/bristh/tasks/${copilotTask.id}`).then(r => r.json());
        setCopilotTask(updated);
      }
    } catch (e) { console.error(e); }
    setCopilotLoading(false);
  };

  return (
    <div className="w-full h-full flex overflow-hidden bg-[#f8f9fc]">
      {/* Left: Task List */}
      <div className={`w-full md:w-80 border-r border-gray-200/80 bg-white flex-col shrink-0 ${mobileDetailOpen ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-black text-gray-800 flex items-center">
            <History className="w-4 h-4 mr-2 text-indigo-500" /> {t('bristh.history.title')}
          </h2>
          <p className="text-[10px] text-gray-400 mt-0.5">{contexts.length} 条任务记录</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Spin /></div>
          ) : contexts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <History className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">{t('bristh.history.noTask')}</p>
            </div>
          ) : (
            contexts.map((ctx: any) => {
              const overallStatus = getOverallStatus(ctx.tasks || []);
              const badge = STATUS_BADGE[overallStatus] || STATUS_BADGE.PENDING;
              const source = SOURCE_MAP[ctx.source] || { label: ctx.source, icon: '📄' };
              const isSelected = selectedCtx?.id === ctx.id;
              return (
                <button key={ctx.id} onClick={() => { setSelectedCtx(ctx); setMobileDetailOpen(true); }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all ${isSelected ? 'bg-indigo-50/50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400">{source.icon} {source.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${badge.bg} ${badge.text}`}>{badge.label}</span>
                  </div>
                  <p className="text-xs font-bold text-gray-800 line-clamp-2">{ctx.rawContent?.slice(0, 80) || '无内容'}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400">{(ctx.tasks || []).length} 个子任务</span>
                    <span className="text-[10px] text-gray-300">{formatTime(ctx.createdAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 ${!mobileDetailOpen ? 'hidden md:block' : ''}`}>
        <button onClick={() => setMobileDetailOpen(false)} className="md:hidden flex items-center text-sm text-gray-500 hover:text-gray-800 font-medium mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> {t('bristh.history.backToList')}
        </button>
        {!selectedCtx ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <History className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium">{t('bristh.history.selectToView')}</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Card 1: Task Info */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-600 flex items-center"><FileText className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> {t('bristh.history.taskInfo')}</h3>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(selectedCtx.rawContent)} className="text-[10px] px-2 py-1 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 font-bold flex items-center gap-1">
                    <Copy className="w-3 h-3" /> {t('bristh.history.copy')}
                  </button>
                  <button onClick={() => rerunTask(selectedCtx)} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-bold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> {t('bristh.history.rerun')}
                  </button>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">{t('bristh.history.source')}</p>
                    <p className="text-xs font-medium text-gray-700">{(SOURCE_MAP[selectedCtx.source] || {}).icon} {(SOURCE_MAP[selectedCtx.source] || {}).label || selectedCtx.source}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">{t('bristh.history.time')}</p>
                    <p className="text-xs font-medium text-gray-700">{formatDate(selectedCtx.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">{t('bristh.history.subtaskCount')}</p>
                    <p className="text-xs font-medium text-gray-700">{(selectedCtx.tasks || []).length} 个</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">{t('bristh.history.status')}</p>
                    {(() => { const s = STATUS_BADGE[getOverallStatus(selectedCtx.tasks || [])] || STATUS_BADGE.PENDING; return <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${s.bg} ${s.text}`}>{s.label}</span>; })()}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">{t('bristh.history.modelUsed')}</p>
                    <p className="text-xs font-medium text-gray-700">{selectedCtx.modelUsed || <span className="text-gray-300">{t('bristh.history.noModel')}</span>}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-gray-400 mb-1">{t('bristh.history.rawInput')}</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{selectedCtx.rawContent}</p>
                </div>
                {/* Attachments display */}
                {selectedCtx.attachments && (() => {
                  try {
                    const atts = JSON.parse(selectedCtx.attachments);
                    if (!Array.isArray(atts) || atts.length === 0) return null;
                    const typeIcon: Record<string, string> = {
                      'application/pdf': '📕',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📗',
                      'text/plain': '📄',
                      'text/markdown': '📝',
                      'text/csv': '📊',
                    };
                    return (
                      <div className="bg-blue-50/60 rounded-lg p-3 mt-2">
                        <p className="text-[10px] font-bold text-blue-500 mb-2 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> 关联附件 ({atts.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {atts.map((a: any) => {
                            const chip = (
                              <span className={`inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 rounded-md text-[10px] font-medium shadow-sm ${a.storagePath ? 'text-blue-800 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition-colors' : 'text-gray-500'}`}>
                                <span>{typeIcon[a.mimeType] || '📎'}</span>
                                <span className="max-w-[140px] truncate">{a.originalName}</span>
                                <span className="text-blue-400">({(a.size / 1024).toFixed(0)}KB)</span>
                                {a.storagePath && <Download className="w-3 h-3 text-blue-400" />}
                              </span>
                            );
                            return a.storagePath ? (
                              <a key={a.id} href={a.storagePath} download={a.originalName} target="_blank" rel="noopener noreferrer">{chip}</a>
                            ) : (
                              <span key={a.id}>{chip}</span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}
              </div>
            </div>

            {/* Card 2: Pipeline Timeline */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
                <h3 className="text-xs font-bold text-gray-600 flex items-center"><GitMerge className="w-3.5 h-3.5 mr-1.5 text-violet-400" /> {t('bristh.history.pipeline')}</h3>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600">C</div>
                    <span className="text-[8px] text-gray-400 mt-1">Chief</span>
                  </div>
                  <div className="w-6 h-[2px] bg-gray-200 shrink-0" />
                  {(selectedCtx.tasks || []).map((task: any, idx: number) => {
                    const b = STATUS_BADGE[task.status] || STATUS_BADGE.PENDING;
                    return (
                      <React.Fragment key={task.id}>
                        <div className="shrink-0 flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${b.bg} ${b.text}`}>
                            {task.agent?.charAt(0)}
                          </div>
                          <span className="text-[8px] text-gray-400 mt-1">{task.agent}</span>
                        </div>
                        {idx < (selectedCtx.tasks || []).length - 1 && <div className="w-6 h-[2px] bg-gray-200 shrink-0" />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 3: Agent Cards */}
            <div className="space-y-3">
              {(selectedCtx.tasks || []).map((task: any) => {
                const badge = STATUS_BADGE[task.status] || STATUS_BADGE.PENDING;
                let resultSummary = '';
                let hasFile = false;
                let fileUrl = '';
                try {
                  const parsed = JSON.parse(task.resultPayload || '{}');
                  resultSummary = parsed.summary || '';
                  hasFile = !!parsed.fileUrl;
                  fileUrl = parsed.fileUrl || '';
                } catch { resultSummary = (task.resultPayload || '').slice(0, 200); }

                return (
                  <div key={task.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black ${badge.bg} ${badge.text}`}>
                          {task.agent?.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">{task.agent}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${badge.bg} ${badge.text}`}>{badge.label}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">{task.instruction?.slice(0, 100)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasFile && (
                          <a href={fileUrl} download className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold flex items-center gap-1">
                            <Download className="w-3 h-3" /> 下载
                          </a>
                        )}
                        {task.status === 'COMPLETED' && (
                          <button onClick={() => openCopilotForTask(task)}
                            className="text-[10px] px-2 py-1 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-bold flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Copilot
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Result summary */}
                    {resultSummary && (
                      <div className="px-5 pb-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-[10px] font-bold text-gray-400 mb-1">执行产物</p>
                          <p className="text-xs text-gray-700">{resultSummary}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Copilot Modal */}
      <Modal
        title={<div className="flex items-center text-lg font-black text-gray-800"><MessageSquare className="w-5 h-5 mr-2 text-violet-600" /> {copilotTask?.agent} Copilot</div>}
        open={copilotOpen}
        onCancel={() => setCopilotOpen(false)}
        footer={null}
        width={1000}
        centered
        destroyOnClose
      >
        {copilotTask ? (
          <div className="flex h-[70vh] border-t border-gray-200">
            <div className="w-[60%] bg-[#fcfcfc] border-r border-gray-200 flex flex-col">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">产物预览</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 relative">
                {renderPreviewStandalone(copilotTask.resultPayload)}
              </div>
            </div>
            <div className="w-[40%] bg-white flex flex-col">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">反馈与微调</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {copilotTask.thinkLog && <ThinkBlock content={copilotTask.thinkLog} />}
                {copilotTask.toolCallsLog && <ToolCallsBlock calls={JSON.parse(copilotTask.toolCallsLog)} />}
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3 text-sm text-gray-800">
                  我是 {copilotTask.agent}，任务已完成。如需修改请告诉我！
                </div>
                {copilotTask.copilotHistory && JSON.parse(copilotTask.copilotHistory).map((msg: any, idx: number) => (
                  <div key={idx} className={`flex items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${msg.role === 'user' ? 'bg-indigo-600 text-white ml-2' : 'bg-blue-100 text-blue-600 mr-2'}`}>
                      {msg.role === 'user' ? 'ME' : 'AI'}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-gray-50 text-gray-800 rounded-tl-sm'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center bg-white border border-gray-300 rounded-full px-3 py-1.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
                  <input type="text" className="flex-1 outline-none text-sm bg-transparent placeholder-gray-400"
                    placeholder="告诉 AI 需要修改什么..."
                    value={copilotMsg} onChange={e => setCopilotMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendCopilotMsg()}
                    disabled={copilotLoading}
                  />
                  <button onClick={sendCopilotMsg} disabled={copilotLoading || !copilotMsg.trim()}
                    className="ml-2 w-7 h-7 bg-violet-600 rounded-full flex items-center justify-center text-white hover:bg-violet-500 disabled:opacity-50 shadow-sm">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
        )}
      </Modal>
    </div>
  );
}

export default function HistoryPage() {
  const { setPendingPptData, setCopilotView } = useWorkspace();
  return <TaskHistoryView onOpenPptCopilot={setPendingPptData} onOpenDocCopilot={setCopilotView} />;
}
