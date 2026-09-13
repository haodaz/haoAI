'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Spin, Modal, message } from 'antd';
import { BookOpen, ClipboardList, Brain, Plus, Trash2, FileText, ChevronRight, ChevronDown, User, Upload, Edit3, Save, X, Sparkles, Clock, Tag, Database } from 'lucide-react';
import { marked } from 'marked';
import { Input, Button } from 'antd';

// ── Types ──────────────────────────────────────────────────────────
interface KbLibrary { id: string; name: string; desc?: string; emoji?: string; fileCount?: number; updatedAt?: string; }
interface MemoryEntry { id: string; ts: string; type: string; source: string; content: string; importance: number; taskId?: string; }
interface AgentInfo { id: string; name: string; title: string; color: string; realistic_avatar?: string; }
interface AgentMemoryStats { hasSoul: boolean; todayCount: number; totalCount: number; lastMemoryDate: string | null; }

type TabKey = 'business' | 'task' | 'memory';

const TAB_CONFIG: { key: TabKey; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { key: 'business', label: '业务知识', icon: <BookOpen className="w-4 h-4" />, color: '#427759', desc: '公司、客户、行业的知识文档' },
  { key: 'task', label: '任务记忆', icon: <ClipboardList className="w-4 h-4" />, color: '#6366f1', desc: '从任务执行中积累的记录' },
  { key: 'memory', label: 'AI 私人记忆', icon: <Brain className="w-4 h-4" />, color: '#e11d48', desc: '每个 AI 的经验、教训和灵魂文件' },
];

// ── Business Knowledge Tab ─────────────────────────────────────────
function BusinessTab() {
  const router = useRouter();
  const [libs, setLibs] = useState<KbLibrary[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewItem, setViewItem] = useState<any | null>(null);

  // Add Knowledge State
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLibs = async () => {
    try {
      const res = await fetch('/api/kb/libraries', { cache: 'no-store' });
      const data = await res.json();
      setLibs(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  };

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/kb/knowledge', { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => { fetchLibs(); fetchItems(); }, []);

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/kb/knowledge?id=${id}`, { method: 'DELETE' });
      message.success('Deleted');
      fetchItems();
    } catch {
      message.error('Delete failed');
    }
  };

  const handleAddSubmit = async () => {
    if (!addForm.title || !addForm.content) {
      message.error('Title and content are required');
      return;
    }
    setIsSubmitting(true);
    try {
      await fetch('/api/kb/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, category: 'Business Knowledge', audience: 'All Staff' })
      });
      message.success('Added successfully');
      setIsAddModalVisible(false);
      setAddForm({ title: '', content: '' });
      fetchItems();
    } catch {
      message.error('Failed to add');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setAddForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, ""), content: text }));
    e.target.value = ''; // reset
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-400">Actively maintain knowledge about company, clients, and industry</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsAddModalVisible(true)} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 shadow-sm transition-colors border border-emerald-100">
            <Upload className="w-3.5 h-3.5" /> Upload Entry
          </button>
          <button onClick={() => router.push('/kb')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-md">
            <Plus className="w-3.5 h-3.5" /> Manage Libraries
          </button>
        </div>
      </div>

      {/* 知识数据条目 */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-600" /> Knowledge Entries
        </h3>
        {items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">🗂️</div>
            <p className="text-gray-500 font-bold mb-1">No knowledge entries yet</p>
            <p className="text-gray-400 text-sm">Click "Upload Entry" to add company knowledge, client info, etc.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
            {items.map(item => (
              <div 
                key={item.id} 
                onClick={() => setViewItem(item)}
                className="p-4 hover:bg-gray-50 transition-colors group cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className="text-sm font-bold text-gray-900 truncate">{item.title}</h4>
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{item.category}</span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{item.audience}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.content}</p>
                    <div className="text-[10px] text-gray-300 mt-2">
                      Stored in Supabase · Updated: {new Date(item.updatedAt).toLocaleString('en-US')}
                    </div>
                  </div>
                  <button onClick={(e) => handleDeleteItem(item.id, e)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 知识库项目卡片 */}
      {libs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" /> Libraries
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {libs.map(lib => (
              <div key={lib.id} onClick={() => router.push(`/kb/${lib.id}?name=${encodeURIComponent(lib.name)}&emoji=${encodeURIComponent(lib.emoji || '📚')}`)}
                className="bg-white border border-gray-100 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all group">
                <div className="text-3xl mb-3">{lib.emoji || '📚'}</div>
                <h3 className="font-bold text-gray-900 mb-1">{lib.name}</h3>
                {lib.desc && <p className="text-xs text-gray-400 mb-3">{lib.desc}</p>}
                <div className="text-[10px] text-gray-300">{lib.fileCount || 0} documents</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Content Modal */}
      <Modal
        title={viewItem?.title}
        open={!!viewItem}
        onCancel={() => setViewItem(null)}
        footer={null}
        width={800}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          .markdown-body h1 { font-size: 1.5rem; font-weight: bold; margin-top: 1rem; margin-bottom: 0.5rem; }
          .markdown-body h2 { font-size: 1.25rem; font-weight: bold; margin-top: 1rem; margin-bottom: 0.5rem; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
          .markdown-body h3 { font-size: 1.1rem; font-weight: bold; margin-top: 1rem; margin-bottom: 0.5rem; }
          .markdown-body p { margin-bottom: 1rem; line-height: 1.6; }
          .markdown-body ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
          .markdown-body ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
          .markdown-body li { margin-bottom: 0.25rem; }
          .markdown-body strong { font-weight: bold; }
        `}} />
        <div 
          className="markdown-body text-gray-700 mt-4" 
          dangerouslySetInnerHTML={{ __html: viewItem ? marked(viewItem.content) : '' }} 
        />
      </Modal>

      {/* Add Knowledge Modal */}
      <Modal
        title="Add Knowledge Entry"
        open={isAddModalVisible}
        onCancel={() => setIsAddModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsAddModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="submit" type="primary" loading={isSubmitting} onClick={handleAddSubmit} className="bg-emerald-600 hover:bg-emerald-700">
            Save to Database
          </Button>,
        ]}
        width={600}
      >
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">
            <div className="flex-1">
              <h4 className="text-xs font-bold text-emerald-700 mb-1">Quick Import</h4>
              <p className="text-[10px] text-gray-500">Upload .txt or .md files — title and content auto-extracted</p>
            </div>
            <label className="px-4 py-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold cursor-pointer hover:bg-emerald-50 transition-colors">
              Choose File
              <input type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Title</label>
            <Input 
              placeholder="e.g. Company Vision & Values" 
              value={addForm.title}
              onChange={e => setAddForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Content (Markdown supported)</label>
            <Input.TextArea 
              placeholder="Paste or type content..." 
              value={addForm.content}
              onChange={e => setAddForm(prev => ({ ...prev, content: e.target.value }))}
              rows={8}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Task Memory Tab ────────────────────────────────────────────────
function TaskMemoryTab() {
  const [contexts, setContexts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState<any>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const fetchContexts = () => {
    setLoading(true);
    fetch('/api/bristh/kb').then(r => r.json()).then(data => {
      setContexts(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchContexts(); }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: 'Confirm Delete',
      content: 'This will permanently remove the task and all sub-task results.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await fetch('/api/bristh/kb', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          message.success('Deleted');
          if (selectedCtx?.id === id) {
            setSelectedCtx(null);
          }
          fetchContexts();
        } catch {
          message.error('Delete failed');
        }
      }
    });
  };

  if (loading) return (<div className="flex items-center justify-center h-64"><Spin size="large" /></div>);

  const statusColors: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-700',
    AWAITING_APPROVAL: 'bg-amber-100 text-amber-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    PENDING: 'bg-gray-100 text-gray-500',
    FAILED: 'bg-red-100 text-red-600',
  };

  const parseResult = (payload: string | null) => {
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload);
      return parsed;
    } catch {
      return { summary: payload.slice(0, 200) };
    }
  };

  // Detail view
  if (selectedCtx) {
    return (
      <div className="space-y-4">
        {/* Back button + header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedCtx(null); setExpandedTask(null); }}
            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500 text-sm font-bold transition-all">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{selectedCtx.title || 'Task Details'}</h3>
            <p className="text-[10px] text-gray-400">{new Date(selectedCtx.createdAt).toLocaleString('en-US')} · {selectedCtx.tasks?.length || 0} sub-tasks</p>
          </div>
          <button onClick={(e) => handleDelete(selectedCtx.id, e)}
            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 text-red-400 hover:text-red-600 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Raw content */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h4 className="text-xs font-bold text-gray-600 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Original Input
            </h4>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{selectedCtx.rawContent || 'No content'}</pre>
          </div>
        </div>

        {/* Sub-tasks */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50/50 border-b border-gray-100">
            <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5" /> Sub-task Results
            </h4>
          </div>
          <div className="divide-y divide-gray-50">
            {(selectedCtx.tasks || []).map((task: any) => {
              const result = parseResult(task.resultPayload);
              const isExpanded = expandedTask === task.id;
              const statusClass = statusColors[task.status] || 'bg-gray-100 text-gray-500';

              return (
                <div key={task.id} className="group">
                  {/* Task header */}
                  <button onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors text-left">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-lg shrink-0">{task.agent}</span>
                      <span className="text-xs text-gray-600 truncate">{task.instruction}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>{task.status}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded result */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-50/30">
                      {result ? (
                        <div className="space-y-3">
                          {/* Summary */}
                          {result.summary && (
                            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                              <div className="text-[10px] font-bold text-green-700 mb-1">📋 Summary</div>
                              <p className="text-xs text-green-800">{result.summary}</p>
                            </div>
                          )}

                          {/* Full content */}
                          {result.content && (
                            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                                <span className="text-[10px] font-bold text-gray-500">Full Output</span>
                              </div>
                              <div className="p-3 max-h-64 overflow-y-auto">
                                <pre className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{
                                  typeof result.content === 'string' 
                                    ? result.content.slice(0, 3000) + (result.content.length > 3000 ? '\n\n... (truncated)' : '')
                                    : JSON.stringify(result.content, null, 2).slice(0, 3000)
                                }</pre>
                              </div>
                            </div>
                          )}

                          {/* Published URL (for Iris) */}
                          {result.publishedUrl && (
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                              <span className="text-[10px] font-bold text-blue-700">🌐 Published URL:</span>
                              <a href={result.publishedUrl} target="_blank" className="text-xs text-emerald-600 underline ml-1">{result.publishedUrl}</a>
                            </div>
                          )}

                          {/* If just raw payload without structured fields */}
                          {!result.content && !result.summary && (
                            <div className="bg-white rounded-lg border border-gray-100 p-3 max-h-48 overflow-y-auto">
                              <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans">{JSON.stringify(result, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-300 py-4 text-center">No results yet — task not completed</div>
                      )}

                      <div className="mt-2 text-[9px] text-gray-300">
                        Created: {new Date(task.createdAt).toLocaleString('en-US')} · Updated: {new Date(task.updatedAt).toLocaleString('en-US')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Automatically accumulated records from Office pipeline task execution</p>
      {contexts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">📝</div>
          <p className="text-gray-500 font-bold mb-1">No task memory yet</p>
          <p className="text-gray-400 text-sm">Memories are automatically stored after tasks are executed in Office</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contexts.map((ctx: any) => {
            const taskAgents = (ctx.tasks || []).map((t: any) => t.agent);
            const uniqueAgents = [...new Set(taskAgents)];

            return (
              <div key={ctx.id} onClick={() => setSelectedCtx(ctx)}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-emerald-100 transition-all cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gray-900 truncate group-hover:text-emerald-600 transition-colors">{ctx.title || 'Untitled Task'}</h3>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ctx.rawContent?.slice(0, 150)}</p>
                    {uniqueAgents.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {uniqueAgents.map((a: string) => (
                          <span key={a} className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-[10px] text-gray-300 bg-gray-50 px-2 py-1 rounded-lg">{ctx._count?.tasks || 0} sub-tasks</span>
                    <span className="text-[10px] text-gray-300">{new Date(ctx.createdAt).toLocaleDateString('en-US')}</span>
                    <button onClick={(e) => handleDelete(ctx.id, e)}
                      className="w-6 h-6 rounded-md bg-transparent flex items-center justify-center hover:bg-red-50 text-gray-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AI Memory Tab ──────────────────────────────────────────────────
function AIMemoryTab() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [memories, setMemories] = useState<Record<string, MemoryEntry[]>>({});
  const [souls, setSouls] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Record<string, AgentMemoryStats>>({});
  const [editingSoul, setEditingSoul] = useState<string | null>(null);
  const [soulDraft, setSoulDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [dreaming, setDreaming] = useState(false);
  const [dreamResult, setDreamResult] = useState<any>(null);

  const refreshStats = (agentList: AgentInfo[]) => {
    agentList.forEach((a: AgentInfo) => {
      fetch(`/api/memory/${a.id}?type=stats`).then(r => r.json()).then(s => {
        setStats(prev => ({ ...prev, [a.id]: s }));
      }).catch(() => {});
    });
  };

  useEffect(() => {
    fetch('/api/bristh/agents/config').then(r => r.json()).then(data => {
      const agentList = (Array.isArray(data) ? data : []).filter((a: any) => a.id !== 'chief');
      setAgents(agentList);
      refreshStats(agentList);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const triggerDreaming = async (force: boolean = false) => {
    setDreaming(true);
    setDreamResult(null);
    try {
      const res = await fetch(`/api/cron/dreaming${force ? '?force=true' : ''}`);
      const data = await res.json();
      setDreamResult(data);
      message.success(`🧠 Dreaming complete! Processed ${data.agentsProcessed} agents`);
      // Refresh stats and reload expanded agent
      refreshStats(agents);
      if (expandedAgent) {
        loadAgentMemories(expandedAgent);
      }
    } catch {
      message.error('Dreaming failed');
    } finally {
      setDreaming(false);
    }
  };

  const loadAgentMemories = async (agentId: string) => {
    try {
      const [memRes, soulRes] = await Promise.all([
        fetch(`/api/memory/${agentId}?limit=30`),
        fetch(`/api/memory/soul/${agentId}`),
      ]);
      const memData = await memRes.json();
      const soulData = await soulRes.json();
      setMemories(prev => ({ ...prev, [agentId]: Array.isArray(memData) ? memData : [] }));
      setSouls(prev => ({ ...prev, [agentId]: soulData.content || '' }));
    } catch {}
  };

  const toggleAgent = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null);
      setEditingSoul(null);
    } else {
      setExpandedAgent(agentId);
      loadAgentMemories(agentId);
    }
  };

  const saveSoul = async (agentId: string) => {
    try {
      await fetch(`/api/memory/soul/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: soulDraft }),
      });
      setSouls(prev => ({ ...prev, [agentId]: soulDraft }));
      setEditingSoul(null);
      message.success('Soul file saved');
    } catch { message.error('Save failed'); }
  };

  const deleteMemory = async (agentId: string, memoryId: string) => {
    try {
      await fetch(`/api/memory/${agentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoryId }),
      });
      setMemories(prev => ({
        ...prev,
        [agentId]: (prev[agentId] || []).filter(m => m.id !== memoryId),
      }));
      message.success('Deleted');
    } catch { message.error('Delete failed'); }
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    task_feedback: { label: 'User Feedback', color: 'bg-amber-100 text-amber-700' },
    lesson_learned: { label: 'Lesson Learned', color: 'bg-blue-100 text-blue-700' },
    user_preference: { label: 'User Preference', color: 'bg-purple-100 text-purple-700' },
    task_summary: { label: 'Task Summary', color: 'bg-emerald-100 text-emerald-700' },
    copilot_feedback: { label: 'Copilot', color: 'bg-cyan-100 text-cyan-700' },
    dreaming_insight: { label: 'Dream Insight', color: 'bg-rose-100 text-rose-700' },
  };

  if (loading) return (<div className="flex items-center justify-center h-64"><Spin size="large" /></div>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-400">Experience, lessons, and soul files accumulated by each AI agent</p>
        <div className="flex items-center gap-2">
          <button onClick={() => triggerDreaming(false)} disabled={dreaming}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:shadow-lg disabled:opacity-50 transition-all">
            {dreaming ? (
              <><span className="animate-spin">🌀</span> Dreaming…</>
            ) : (
              <><Brain className="w-3.5 h-3.5" /> 🌙 Dream (New Memories)</>
            )}
          </button>
          <button onClick={() => triggerDreaming(true)} disabled={dreaming}
            className="px-3 py-2 bg-white text-purple-600 border border-purple-200 rounded-lg text-xs font-bold hover:bg-purple-50 disabled:opacity-50 transition-all">
            ♾️ Full Consolidation
          </button>
        </div>
      </div>

      {/* Dream result banner */}
      {dreamResult && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-rose-50 rounded-xl p-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">🧠</span>
            <span className="text-xs font-bold text-purple-700">Dream Report</span>
            <span className="text-[10px] text-gray-400">{dreamResult.timestamp?.split('T')[0]}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(dreamResult.results || {}).map(([agentId, r]: [string, any]) => (
              <div key={agentId} className={`px-3 py-2 rounded-lg text-[10px] ${
                r.status === 'success' ? 'bg-green-50 text-green-700' :
                r.status === 'skipped' ? 'bg-gray-50 text-gray-400' :
                'bg-red-50 text-red-600'
              }`}>
                <span className="font-bold">{agentId}</span>
                {r.status === 'success' && <span className="block">{r.memoriesProcessed} entries · {r.insights?.slice(0, 40)}</span>}
                {r.status === 'skipped' && <span className="block">Skipped</span>}
                {r.status === 'error' && <span className="block">Error</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {agents.map(agent => {
          const agentStats = stats[agent.id];
          const isExpanded = expandedAgent === agent.id;
          const agentMemories = memories[agent.id] || [];
          const soulContent = souls[agent.id] || '';

          return (
            <div key={agent.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {/* Agent header */}
              <button onClick={() => toggleAgent(agent.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  {agent.realistic_avatar ? (
                    <img src={agent.realistic_avatar} alt={agent.name} className="w-9 h-9 rounded-xl object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div className="text-left">
                    <h3 className="font-bold text-sm text-gray-900">{agent.name}</h3>
                    <p className="text-[10px] text-gray-400">{agent.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {agentStats && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-300">
                      {agentStats.hasSoul && <span className="bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full font-bold">🧠 Soul</span>}
                      <span>{agentStats.totalCount} memories</span>
                      {agentStats.todayCount > 0 && <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold">Today +{agentStats.todayCount}</span>}
                    </div>
                  )}
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-300" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-50 p-4 space-y-4 bg-gray-50/30">
                  {/* Soul file section */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-rose-50/50 border-b border-gray-100 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-rose-700 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" /> Soul File
                      </h4>
                      {editingSoul === agent.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => saveSoul(agent.id)} className="text-[10px] px-3 py-1 bg-rose-600 text-white rounded-lg font-bold flex items-center gap-1">
                            <Save className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => setEditingSoul(null)} className="text-[10px] px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-bold">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingSoul(agent.id); setSoulDraft(soulContent); }} className="text-[10px] px-3 py-1 bg-white text-rose-600 border border-rose-200 rounded-lg font-bold flex items-center gap-1 hover:bg-rose-50">
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                    <div className="p-4">
                      {editingSoul === agent.id ? (
                        <textarea value={soulDraft} onChange={e => setSoulDraft(e.target.value)}
                          className="w-full h-48 text-xs leading-relaxed p-3 border border-gray-200 rounded-lg outline-none focus:border-rose-400 resize-none font-mono"
                          placeholder={`# ${agent.name}'s Soul File\n\n## Core Capabilities\n- ...\n\n## Lessons Learned\n- ...\n\n## User Preferences\n- ...`} />
                      ) : soulContent ? (
                        <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">{soulContent}</div>
                      ) : (
                        <div className="text-xs text-gray-300 text-center py-6">
                          No soul file yet — Dreaming Agent generates it during daily consolidation, or edit manually
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Memory entries */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-blue-50/50 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-blue-700 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" /> Memory Entries ({agentMemories.length})
                      </h4>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {agentMemories.length === 0 ? (
                        <div className="text-xs text-gray-300 text-center py-8">No memories yet — automatically recorded from task execution and user feedback</div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {agentMemories.map(mem => {
                            const typeInfo = typeLabels[mem.type] || { label: mem.type, color: 'bg-gray-100 text-gray-600' };
                            return (
                              <div key={mem.id} className="px-4 py-3 hover:bg-gray-50/50 group">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
                                      <span className="text-[9px] text-gray-300">{new Date(mem.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                      <span className="text-[9px] text-gray-200">Importance: {(mem.importance * 100).toFixed(0)}%</span>
                                    </div>
                                    <p className="text-xs text-gray-700 leading-relaxed">{mem.content}</p>
                                  </div>
                                  <button onClick={() => deleteMemory(agent.id, mem.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function Page() {
  return (
    <div className="w-full h-full bg-[#f8f9fc] flex flex-col overflow-hidden">
      <div className="px-8 pt-7 pb-2 shrink-0">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Task Memory</h1>
        <p className="text-xs text-gray-400 mt-1">Records accumulated from task execution</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-5">
        <TaskMemoryTab />
      </div>
    </div>
  );
}