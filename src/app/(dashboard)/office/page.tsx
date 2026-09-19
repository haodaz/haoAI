
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Modal, Tooltip, Spin } from 'antd';
import { marked } from 'marked';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ThinkBlock, ToolCallsBlock, renderPreviewStandalone, COLOR_BORDER_MAP } from '@/components/shared/UIBlocks';
import { Activity, History, Send, ChevronRight, ChevronLeft, Plus, FileText, StopCircle, Terminal, Download, MessageSquare, ChevronDown, ChevronUp, Copy, RefreshCw, Loader2 } from 'lucide-react';

interface LogEntry {
  id: number | string;
  source: string;
  message: string;
  time: string;
}

function VirtualOfficeView({ onOpenPptCopilot, onOpenDocCopilot }: { onOpenPptCopilot?: (data: { slides: any[]; fileUrl: string; topic: string }) => void; onOpenDocCopilot?: (data: { taskId: string; agent: string }) => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { pendingDispatchTask, setPendingDispatchTask } = useWorkspace();
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'dispatching' | 'completed' | 'failed'>('idle');
  const [activeNodes, setActiveNodes] = useState<{agent: string, instruction: string, status: string, taskId: string, depth: number, summary?: string, hasAttachments?: boolean}[]>([]);
  const [currentTaskDisplay, setCurrentTaskDisplay] = useState<string>(t('bristh.office.noTask'));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentContextId, setCurrentContextId] = useState<string | null>(null);
  const lastDispatchedInputRef = useRef('');
  const logsRef = useRef<LogEntry[]>([]);

  // Restore pipeline state from session on mount (Bug 2 fix)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('office_pipeline');
      if (saved) {
        const { nodes, pipelineStatus, taskDisplay, savedLogs, savedContextId } = JSON.parse(saved);
        if (nodes?.length > 0) {
          setActiveNodes(nodes);
          setStatus(pipelineStatus || 'completed');
          setCurrentTaskDisplay(taskDisplay || '');
          if (savedLogs?.length > 0) {
            setLogs(savedLogs);
            logsRef.current = savedLogs;
          }
          if (savedContextId) setCurrentContextId(savedContextId);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Keep logsRef in sync
  useEffect(() => { logsRef.current = logs; }, [logs]);

  // Persist pipeline state + logs to sessionStorage on every change
  useEffect(() => {
    if (activeNodes.length > 0) {
      try {
        sessionStorage.setItem('office_pipeline', JSON.stringify({
          nodes: activeNodes,
          pipelineStatus: status,
          taskDisplay: currentTaskDisplay,
          savedLogs: logs,
          savedContextId: currentContextId,
        }));
      } catch { /* ignore */ }
    }
  }, [activeNodes, status, logs, currentContextId]);
  
  // Dynamic agent config from API
  const [subAIs, setSubAIs] = useState<{id: string, name: string, desc: string, image: string, color: string, shadow: string, category: string}[]>([]);
  
  useEffect(() => {
    fetch('/api/bristh/agents/config')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const mapped = data
          .filter((a: any) => a.role === 'agent' && a.enabled)
          .map((a: any) => {
            const cm = COLOR_BORDER_MAP[a.color] || { color: 'border-gray-400', shadow: 'shadow-gray-400/20' };
            const translatedTitle = t(`bristh.agents.${a.name}.title`, { defaultValue: a.title?.split('/')[0]?.trim() || '' });
            const translatedDesc = t(`bristh.agents.${a.name}.desc`, { defaultValue: a.description || '' });
            return {
              id: a.name,  // Agent routes use Name (Alice, Bob...) as the identifier
              name: `${a.name}, ${translatedTitle}`,
              desc: translatedDesc,
              image: a.avatar || '/pixel_worker.png',
              color: cm.color,
              shadow: cm.shadow,
              category: a.category || 'general',
            };
          });
        setSubAIs(mapped);
      })
      .catch(() => {
        // Fallback: if API fails, use hardcoded defaults
        setSubAIs([
          { id: 'Alice', name: `Alice, ${t('bristh.agents.Alice.title', {defaultValue: 'Proposal Architect'})}`, desc: t('bristh.agents.Alice.desc', {defaultValue: 'Business proposals'}), image: '/pixel_worker_analysis.png', color: 'border-emerald-500', shadow: 'shadow-emerald-500/20', category: 'general' },
          { id: 'Bob', name: `Bob, ${t('bristh.agents.Bob.title', {defaultValue: 'Scheduling Assistant'})}`, desc: t('bristh.agents.Bob.desc', {defaultValue: 'Calendar invites'}), image: '/pixel_worker_social.png', color: 'border-emerald-500', shadow: 'shadow-emerald-500/20', category: 'general' },
          { id: 'Edda', name: `Edda, ${t('bristh.agents.Edda.title', {defaultValue: 'Presentation Specialist'})}`, desc: t('bristh.agents.Edda.desc', {defaultValue: 'Slide decks'}), image: '/pixel_worker_presentation.png', color: 'border-purple-500', shadow: 'shadow-purple-500/20', category: 'general' },
          { id: 'David', name: `David, ${t('bristh.agents.David.title', {defaultValue: 'Internal Audit Specialist'})}`, desc: t('bristh.agents.David.desc', {defaultValue: 'Compliance audit'}), image: '/pixel_worker_support.png', color: 'border-red-500', shadow: 'shadow-red-500/20', category: 'general' },
          { id: 'Fiona', name: `Fiona, ${t('bristh.agents.Fiona.title', {defaultValue: 'Communications Specialist'})}`, desc: t('bristh.agents.Fiona.desc', {defaultValue: 'Memos & brochures'}), image: '/pixel_worker.png', color: 'border-amber-500', shadow: 'shadow-amber-500/20', category: 'general' },
          { id: 'Eric', name: `Eric, ${t('bristh.agents.Eric.title', {defaultValue: 'Legal Officer'})}`, desc: t('bristh.agents.Eric.desc', {defaultValue: 'Legal documents'}), image: '/pixel_worker_filing.png', color: 'border-cyan-500', shadow: 'shadow-cyan-500/20', category: 'general' },
          { id: 'Grace', name: `Grace, ${t('bristh.agents.Grace.title', {defaultValue: 'Email Dispatch'})}`, desc: t('bristh.agents.Grace.desc', {defaultValue: 'Send emails'}), image: '/pixel_worker_social.png', color: 'border-pink-500', shadow: 'shadow-pink-500/20', category: 'general' },
        ]);
      });
  }, []);
  // States for Copilot
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotNode, setCopilotNode] = useState<{ agent: string, taskId: string } | null>(null);
  const [copilotData, setCopilotData] = useState<any>(null);
  const [copilotMessage, setCopilotMessage] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);

  // Live progress ticker: maps taskId -> current status message
  const [nodeProgress, setNodeProgress] = useState<Record<string, string>>({});

  // Known steps per agent for simulated ticker
  const AGENT_STEPS: Record<string, string[]> = {
    Alice: ['[1/4] Searching BEP knowledge base...', '[2/4] Generating Initial Conversation...', '[3/4] Assembling commercial terms...', '[4/4] Customizing What School Gains...'],
    Eric:  ['[1/4] Loading legal document config...', '[2/4] AI drafting core clauses...', '[3/4] Appending protective clauses...', '[4/4] Finalizing document...'],
    Edda:  ['[1/4] Parsing presentation brief...', '[2/4] Generating slide content...', '[3/4] Rendering .pptx file...', '[4/4] Uploading file...'],
    Iris:  ['[1/4] Parsing page requirements...', '[2/4] Generating HTML template...', '[3/4] Applying design elements...', '[4/4] Publishing landing page...'],
    Fiona: ['[1/4] Detecting task type...', '[2/4] Loading KB content...', '[3/4] Generating brochure layout...', '[4/4] Saving asset...'],
    Grace: ['[1/4] Collecting attachments...', '[2/4] Composing email...', '[3/4] Building HTML body...', '[4/4] Sending via SMTP...'],
    Scout: ['[1/4] 正在联网搜索...', '[2/4] 检索内部知识库...', '[3/4] 分析与交叉验证...', '[4/4] 生成调研报告...'],
  };
  const tickerTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const tickerCounters = useRef<Record<string, number>>({});

  // Start fake ticker for a working node
  const startTicker = (taskId: string, agentName: string) => {
    if (tickerTimers.current[taskId]) return; // already running
    const agentKey = Object.keys(AGENT_STEPS).find(k => agentName.includes(k));
    const steps = agentKey ? AGENT_STEPS[agentKey] : ['[?/4] Processing...'];
    tickerCounters.current[taskId] = 0;
    setNodeProgress(prev => ({ ...prev, [taskId]: steps[0] }));
    tickerTimers.current[taskId] = setInterval(() => {
      tickerCounters.current[taskId] = Math.min(tickerCounters.current[taskId] + 1, steps.length - 1);
      setNodeProgress(prev => ({ ...prev, [taskId]: steps[tickerCounters.current[taskId]] }));
    }, 20000); // advance every 20s
  };

  const stopTicker = (taskId: string) => {
    if (tickerTimers.current[taskId]) {
      clearInterval(tickerTimers.current[taskId]);
      delete tickerTimers.current[taskId];
    }
  };

  // Poll working nodes every 2s for real DB progress + completion
  useEffect(() => {
    const workingNodes = activeNodes.filter(n => n.status === 'working' && n.taskId);
    if (workingNodes.length === 0) return;

    workingNodes.forEach(node => startTicker(node.taskId, node.agent));

    const interval = setInterval(async () => {
      for (const node of workingNodes) {
        if (!node.taskId) continue;
        try {
          const res = await fetch(`/api/bristh/tasks/${node.taskId}`);
          const data = await res.json();
          // Sync real progress from DB if available
          if (data.resultPayload) {
            try {
              const payload = JSON.parse(data.resultPayload);
              if (payload.progress) {
                setNodeProgress(prev => ({ ...prev, [node.taskId]: payload.progress }));
              }
            } catch { /* ignore */ }
          }
          // Detect completion
          if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'AWAITING_APPROVAL') {
            stopTicker(node.taskId);
            const statusMap: Record<string, string> = { COMPLETED: 'done', FAILED: 'failed', AWAITING_APPROVAL: 'awaiting_approval' };
            const summary = (() => { try { return JSON.parse(data.resultPayload || '{}').summary || ''; } catch { return ''; } })();
            setActiveNodes(prev => prev.map(n =>
              n.taskId === node.taskId
                ? { ...n, status: statusMap[data.status] || 'done', summary }
                : n
            ));
          }
        } catch { /* ignore */ }
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      workingNodes.forEach(n => stopTicker(n.taskId));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodes.map(n => n.taskId + n.status).join(',')]);


  const addLog = (source: string, message: string) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      source,
      message,
      time: new Date().toLocaleTimeString([], { hour12: false })
    }]);
  };

  // Flush logs to database for persistence
  const flushLogs = async (ctxId?: string | null) => {
    const targetCtxId = ctxId || currentContextId;
    if (!targetCtxId) return;
    try {
      await fetch('/api/bristh/tasks/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: targetCtxId, logs: logsRef.current }),
      });
    } catch (e) {
      console.error('[Office] Failed to flush logs to DB:', e);
    }
  };

  useEffect(() => {
    // Scroll only inside the log box, never the whole page
    const box = logEndRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logs, logOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotData?.copilotHistory]);

  // Map a DB task to an office card
  const taskToNode = (t: any) => {
    const statusMap: Record<string, string> = {
      COMPLETED: 'done', APPROVED: 'done', FAILED: 'failed',
      AWAITING_APPROVAL: 'awaiting_approval', RUNNING: 'working', PENDING: 'idle',
    };
    return {
      agent: t.agent,
      instruction: t.instruction,
      status: statusMap[t.status] || 'done',
      taskId: t.id,
      depth: Number(t.phase) || 1,
      summary: (() => { try { return JSON.parse(t.resultPayload || '{}').summary || ''; } catch { return ''; } })(),
      hasAttachments: !!t.attachmentIds,
    };
  };

  // True when a restored pipeline stopped midway (e.g. the tab was closed) and can continue
  const [resumable, setResumable] = useState(false);

  const refreshNodes = async (ctxId: string) => {
    const res = await fetch(`/api/bristh/tasks?contextId=${ctxId}`);
    const tasks = await res.json();
    if (Array.isArray(tasks)) setActiveNodes(tasks.map(taskToNode));
    return Array.isArray(tasks) ? tasks : [];
  };

  /**
   * Execute a pipeline by repeatedly asking the server to run its next phase.
   * The server owns the state (phases, approval gates, inter-phase outputs), so this
   * loop can stop at any time and be resumed later from the DB.
   */
  const drivePipeline = async (ctxId: string) => {
    const en = i18n.language === 'en';
    setResumable(false);
    setStatus('dispatching');
    let failures = 0;
    for (let step = 0; step < 50; step++) {
      // Show the next runnable phase as working while the server executes it
      const tasks = await refreshNodes(ctxId).catch(() => [] as any[]);
      const pendingPhases = tasks.filter((t: any) => t.status === 'PENDING').map((t: any) => Number(t.phase) || 1);
      const nextPhase = pendingPhases.length ? Math.min(...pendingPhases) : null;
      if (nextPhase !== null && !tasks.some((t: any) => t.status === 'AWAITING_APPROVAL')) {
        setActiveNodes(prev => prev.map(n => (n.depth === nextPhase && n.status === 'idle') ? { ...n, status: 'working' } : n));
        if (nextPhase > 1) addLog('System', `⏩ Phase ${nextPhase} — ${en ? 'Previous phase outputs injected' : '前序阶段产出已注入'}`);
      }

      let data: any;
      try {
        const res = await fetch('/api/bristh/pipeline/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextId: ctxId, locale: i18n.language }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || `status ${res.status}`);
        failures = 0;
      } catch (err: any) {
        // Long phases can outlive the HTTP request while agents keep running server-side
        if (++failures >= 5) {
          addLog('System', `❌ ${err.message}`);
          setStatus('failed');
          setResumable(true);
          break;
        }
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      if (data.state === 'progressed') {
        addLog('System', `✅ Phase ${data.phase} ${en ? 'finished' : '完成'}`);
      } else if (data.state === 'busy') {
        await new Promise(r => setTimeout(r, 3000));
      } else if (data.state === 'awaiting_approval') {
        await refreshNodes(ctxId).catch(() => {});
        const n = data.notification;
        if (n?.success) {
          addLog('System', en ? `📧 Approval notification sent to ${n.emailSentTo} (${n.tasksNotified} pending)` : `📧 审批通知已发送至 ${n.emailSentTo}（${n.tasksNotified} 项待审批）`);
        } else if (n?.error) {
          addLog('System', `⚠️ ${en ? 'Failed to send notification email:' : '通知邮件发送失败:'} ${n.error}`);
        }
        addLog('Chief', en ? 'Pipeline paused. Waiting for human approval on flagged tasks.' : '管线已暂停，等待人工审批。');
        setStatus('completed');
        break;
      } else if (data.state === 'completed') {
        await refreshNodes(ctxId).catch(() => {});
        addLog('Chief', en ? 'All sub-tasks reported back. Pipeline finished.' : '所有子任务已完成，管线结束。');
        setStatus('completed');
        break;
      }
    }
    setTimeout(() => flushLogs(ctxId), 500);
  };

  const loadHistory = async (contextId: string = 'latest') => {
    try {
      const res = await fetch(`/api/bristh/tasks?contextId=${contextId}`);
      const tasks = await res.json();
      if (!tasks || tasks.length === 0) {
        addLog('System', 'No historical tasks found.');
        return;
      }
      
      const mappedNodes = tasks.map(taskToNode);
      setResumable(
        tasks.some((t: any) => t.status === 'PENDING' || t.status === 'RUNNING') &&
        !tasks.some((t: any) => t.status === 'AWAITING_APPROVAL') &&
        tasks[0].context?.pipelineStatus !== 'DRAFT'
      );
      setActiveNodes(mappedNodes);
      setStatus('completed');
      const restoredCtxId = tasks[0].contextId;
      setCurrentContextId(restoredCtxId);
      // Restore rawContent for re-run support
      if (tasks[0].context?.rawContent) {
        lastDispatchedInputRef.current = tasks[0].context.rawContent;
      }
      setCurrentTaskDisplay(`[Restored] Context: ${restoredCtxId?.substring(0, 12)}...`);

      // Try to restore logs from DB
      try {
        const logRes = await fetch(`/api/bristh/tasks/log?contextId=${restoredCtxId}`);
        const logData = await logRes.json();
        if (logData.logs?.length > 0) {
          setLogs(logData.logs);
          return;
        }
      } catch { /* fallback below */ }
      
      const hasAwaiting = mappedNodes.some((n: any) => n.status === 'awaiting_approval');
      setLogs([
        { id: 1, source: 'System', message: hasAwaiting 
          ? 'Pipeline restored. Some tasks are awaiting approval.' 
          : 'Restored pipeline from history.', 
          time: new Date().toLocaleTimeString() }
      ]);
    } catch (e) {
      console.error(e);
      addLog('System', 'Failed to load history.');
    }
  };

  // Auto-restore active pipeline on mount: tasks still RUNNING, or a pipeline from the
  // last 24h that stopped midway (e.g. the tab was closed) — the latter shows a Resume button.
  // Stale AWAITING_APPROVAL tasks from old pipelines should not hijack the idle view.
  useEffect(() => {
    if (pendingDispatchTask) return; // Skip if we're about to dispatch
    
    fetch('/api/bristh/tasks?mode=history')
      .then(r => r.json())
      .then((contexts: any[]) => {
        if (!Array.isArray(contexts)) return;
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const activeCtx = contexts.find((c: any) =>
          c.tasks?.some((t: any) => t.status === 'RUNNING') ||
          (['ACTIVE', 'ALL_APPROVED'].includes(c.pipelineStatus) &&
            new Date(c.createdAt).getTime() > dayAgo &&
            c.tasks?.some((t: any) => t.status === 'PENDING'))
        );
        if (activeCtx) {
          loadHistory(activeCtx.id);
        }
      })
      .catch(() => {});
  }, []);

  const dispatchingRef = useRef(false);
  useEffect(() => {
    if (pendingDispatchTask && !dispatchingRef.current) {
      dispatchingRef.current = true;
      const { input, inputMode, contextId, tasks, attachments } = pendingDispatchTask;
      console.log('[Office] Received pendingDispatchTask, attachments:', attachments?.length || 0);
      setPendingDispatchTask(null);
      if (contextId && tasks) {
        // Two-step flow: tasks already created in confirm step, go straight to execution
        handleDispatchWithTasks(input, tasks);
      } else {
        // Legacy flow: single-step dispatch (from old UI or email-daemon)
        handleDispatch(input, inputMode, attachments);
      }
    }
  }, [pendingDispatchTask]);

  const handleDispatch = async (dispatchInput: string, dispatchMode: string, dispatchAttachments?: any[]) => {
    if (dispatchMode === 'text' && !dispatchInput.trim()) return;
    
    // Clear persisted pipeline for new task
    try { sessionStorage.removeItem('office_pipeline'); } catch { /* ignore */ }

    setCurrentTaskDisplay(dispatchMode === 'text' ? dispatchInput.substring(0, 50) + '...' : `Linked ${dispatchMode === 'file' ? 'uploaded file' : 'CRM email'}`);
    setStatus('analyzing');
    setActiveNodes([]);
    setLogs([]);
    
    addLog('System', 'Task initiated. Routing to Chief Master AI.');
    if (dispatchAttachments?.length) {
      addLog('System', `📎 ${dispatchAttachments.length} attachment(s) linked to task context.`);
    }
    addLog('Chief', 'Reading context and analyzing intent...');

    try {
      console.log('[Office] Calling orchestrate with', dispatchAttachments?.length || 0, 'attachments');
      lastDispatchedInputRef.current = dispatchInput;
      const res = await fetch('/api/bristh/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'TEXT', rawContent: dispatchInput, locale: i18n.language, attachments: dispatchAttachments })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API Error');

      setStatus('dispatching');
      const assignedTasks = data.tasks || [];
      addLog('Chief', `Orchestration complete. Participating agents: ${assignedTasks.map((t:any) => t.agent).join(', ')}.`);
      const ctxId = assignedTasks[0]?.contextId || data.contextId;
      setActiveNodes(assignedTasks.map(taskToNode));
      if (ctxId) {
        setCurrentContextId(ctxId);
        await drivePipeline(ctxId);
      }

    } catch (err: any) {
      addLog('System', `Error: ${err.message}`);
      setStatus('failed');
      const ctxId = (activeNodes[0] as any)?.contextId;
      if (ctxId) setTimeout(() => flushLogs(ctxId), 500);
    }
    dispatchingRef.current = false;
  };

  // Two-step flow: tasks already created, go straight to execution
  const handleDispatchWithTasks = async (dispatchInput: string, preCreatedTasks: any[]) => {
    const ctxId = preCreatedTasks[0]?.contextId;
    setCurrentTaskDisplay(dispatchInput.substring(0, 50) + '...');
    setActiveNodes(preCreatedTasks.map(taskToNode));
    setLogs([]);
    lastDispatchedInputRef.current = dispatchInput;

    addLog('System', 'Task confirmed. Executing pre-assigned pipeline.');
    addLog('Chief', `Dispatching ${preCreatedTasks.length} agents: ${preCreatedTasks.map((t: any) => t.agent).join(', ')}.`);
    if (!ctxId) return;
    setCurrentContextId(ctxId);
    await drivePipeline(ctxId);
    dispatchingRef.current = false;
  };

  // Handle retrying a failed task: the server re-runs it with earlier phases' outputs
  const handleRetryTask = async (taskId: string, agentName: string) => {
    addLog(agentName, `🔄 ${i18n.language === 'en' ? 'User manually retrying execution...' : '用户手动重试执行...'}`);
    try {
      const res = await fetch('/api/bristh/pipeline/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed with status ${res.status}`);
      await drivePipeline(data.contextId);
    } catch (err: any) {
      addLog(agentName, `❌ Error: ${err.message}`);
    }
  };

  // Handle approving a single task
  const handleApproveTask = async (taskId: string, agentName: string) => {
    addLog(agentName, `✅ ${i18n.language === 'en' ? 'User approved' : '用户批准通过'}`);
    
    // Update card status immediately for responsiveness
    setActiveNodes(prev => prev.map(n => 
      n.taskId === taskId ? { ...n, status: 'done' } : n
    ));

    try {
      const res = await fetch('/api/bristh/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();

      if (!res.ok) {
        addLog('System', `⚠️ ${i18n.language === 'en' ? 'Approval failed:' : '审批失败:'} ${data.error}`);
        // Revert card status
        setActiveNodes(prev => prev.map(n => 
          n.taskId === taskId ? { ...n, status: 'awaiting_approval' } : n
        ));
        return;
      }

      addLog('System', i18n.language === 'en' ? `✅ ${agentName} approved (${data.remainingApprovals} pending approvals remaining)` : `✅ ${agentName} 已批准 (剩余 ${data.remainingApprovals} 项待审批)`);

      // If all tasks are approved, resume the remaining phases
      if (data.allApproved && data.contextId) {
        addLog('System', `🎉 ${i18n.language === 'en' ? 'All approvals passed! Resuming pipeline execution...' : '所有审批已通过！正在恢复管线执行...'}`);
        await drivePipeline(data.contextId);
      }
    } catch (err: any) {
      addLog('System', `⚠️ ${i18n.language === 'en' ? 'Approval request failed:' : '审批请求失败:'} ${err.message}`);
      setActiveNodes(prev => prev.map(n => 
        n.taskId === taskId ? { ...n, status: 'awaiting_approval' } : n
      ));
    }
  };

  const terminateTask = () => {
    // Flush logs to DB before clearing
    if (currentContextId) flushLogs();
    setStatus('idle');
    setActiveNodes([]);
    setCurrentTaskDisplay(t('bristh.office.idleFallbackText'));
    setLogs([]);
    setCurrentContextId(null);
    try { sessionStorage.removeItem('office_pipeline'); } catch { /* ignore */ }
  };

  // --- Copilot Methods ---
  const openCopilot = async (agent: string, taskId: string) => {
    // Universal: if payload has toolboxUrl, navigate directly to the tool
    try {
      const res = await fetch(`/api/bristh/tasks/${taskId}`);
      const data = await res.json();
      const payload = data.resultPayload ? JSON.parse(data.resultPayload) : {};
      if (payload.toolboxUrl) {
        router.push(payload.toolboxUrl);
        return;
      }
    } catch (e) {
      console.error('Failed to check toolboxUrl:', e);
    }

    // Fallback for non-toolbox agents: open DocumentEditorView
    if (onOpenDocCopilot) {
      onOpenDocCopilot({ taskId, agent });
      return;
    }
    // Last fallback: modal copilot
    setCopilotNode({ agent, taskId });
    setCopilotOpen(true);
    setCopilotData(null);
    try {
      const res = await fetch(`/api/bristh/tasks/${taskId}`);
      const data = await res.json();
      setCopilotData(data);
    } catch (e) {
      console.error(e);
    }
  };


  const sendCopilotMessage = async () => {
    if (!copilotMessage.trim() || !copilotNode) return;
    const msg = copilotMessage;
    setCopilotMessage('');
    setCopilotLoading(true);

    // Optimistically update history
    setCopilotData((prev: any) => {
      const hist = prev.copilotHistory ? JSON.parse(prev.copilotHistory) : [];
      hist.push({ role: 'user', content: msg });
      return { ...prev, copilotHistory: JSON.stringify(hist) };
    });

    try {
      const res = await fetch('/api/bristh/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: copilotNode.taskId, message: msg, locale: i18n.language })
      });
      const data = await res.json();
      if (res.ok) {
        setCopilotData(data.task);
      }
    } catch (e) {
      console.error(e);
    }
    setCopilotLoading(false);
  };

  // Render preview based on payload type
  const renderPreview = (payload: string | null) => {
    if (!payload) return <div className="text-gray-400">No output generated.</div>;
    
    // Check if it's JSON (e.g. Edda or Bob output)
    if (payload.trim().startsWith('{') || payload.trim().startsWith('[')) {
       try {
         const json = JSON.parse(payload);
         if (json.fileUrl) {
            const slides = json.rawSlides || [];
            return (() => {
              const [viewSlide, setViewSlide] = React.useState(0);
              const currentS = slides[viewSlide];
              return (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                    <span className="text-xs font-bold text-gray-500">{json.summary}</span>
                    <a href={json.fileUrl} download className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-700 shadow-sm">
                      <Download className="w-3 h-3" /> {t('bristh.office.downloadPptx')}
                    </a>
                  </div>
                  <div className="flex gap-2 px-4 py-2 border-b border-gray-100 overflow-x-auto shrink-0 bg-gray-50/50">
                    {slides.map((s: any, i: number) => {
                      const titleEl = s.elements?.find((e: any) => e.style?.fontWeight === 'bold' && e.style?.fontSize >= 1.8);
                      return (
                        <button key={i} onClick={() => setViewSlide(i)}
                          className={`shrink-0 w-24 rounded-lg border-2 overflow-hidden transition-all ${viewSlide === i ? 'border-emerald-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="aspect-[16/9] bg-white relative p-1">
                            <div className="text-[5px] font-bold text-gray-800 truncate">{titleEl?.content || t('bristh.office.slideNum', {num: i+1})}</div>
                          </div>
                          <div className="px-1 py-0.5 bg-gray-50 border-t border-gray-100">
                            <span className={`text-[8px] font-bold ${viewSlide === i ? 'text-emerald-600' : 'text-gray-400'}`}>{t('bristh.office.pageNum', {num: i+1})}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 flex items-center justify-center p-4 bg-gray-100/30 overflow-auto">
                    {currentS && (
                      <div className="w-full max-w-2xl">
                        <div className="aspect-[16/9] rounded-xl overflow-hidden shadow-2xl border border-gray-200 relative"
                          style={{ backgroundColor: currentS.backgroundColor || '#ffffff' }}>
                          {currentS.elements?.map((el: any) => (
                            <div key={el.id} style={{
                              position: 'absolute',
                              left: `${el.x}%`, top: `${el.y}%`,
                              width: `${el.width}%`, height: `${el.height}%`,
                              fontSize: `${(el.style?.fontSize || 1) * 0.6}rem`,
                              fontWeight: el.style?.fontWeight || 'normal',
                              textAlign: el.style?.textAlign || 'left',
                              color: el.style?.color || '#333',
                              backgroundColor: el.style?.backgroundColor === 'transparent' ? undefined : el.style?.backgroundColor,
                              padding: el.style?.padding ? `${el.style.padding * 0.5}%` : undefined,
                              borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined,
                              overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                            }}>
                              {el.content}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-center gap-3 mt-3">
                          <button onClick={() => setViewSlide(Math.max(0, viewSlide - 1))} disabled={viewSlide === 0}
                            className="p-1.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 shadow-sm">
                            <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
                          </button>
                          <span className="text-[11px] font-bold text-gray-500">{viewSlide + 1} / {slides.length}</span>
                          <button onClick={() => setViewSlide(Math.min(slides.length - 1, viewSlide + 1))} disabled={viewSlide === slides.length - 1}
                            className="p-1.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 shadow-sm">
                            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })();
          } else if (json.icsContent) {
            return (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                  <span className="text-xs font-bold text-gray-500">{json.summary || t('bristh.office.calendarGenerated')}</span>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(json.icsContent)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-gray-200">
                      <Copy className="w-3 h-3" /> {t('bristh.office.copyBtn')}
                    </button>
                    <button onClick={() => { const blob = new Blob([json.icsContent], { type: 'text/calendar' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'meeting.ics'; a.click(); URL.revokeObjectURL(url); }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-100">
                      <Download className="w-3 h-3" /> {t('bristh.office.downloadIcsBtn')}
                    </button>
                  </div>
                </div>
                <pre className="flex-1 bg-gray-800 text-green-400 p-4 rounded-b-xl text-xs overflow-auto font-mono whitespace-pre-wrap m-0">
                  {json.icsContent}
                </pre>
              </div>
            );
          } else if (json.processedFiles && json.content) {
             // Kelly: Document Processing output with source file tracking
             return (
               <div className="flex flex-col h-full">
                 <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                   <span className="text-xs font-bold text-gray-500">{json.summary}</span>
                   <div className="flex gap-2">
                     <button onClick={() => navigator.clipboard.writeText(json.content)}
                       className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-gray-200">
                       <Copy className="w-3 h-3" /> {t('bristh.office.copyBtn')}
                     </button>
                     <button onClick={() => { const blob = new Blob([json.content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'kelly_output.md'; a.click(); URL.revokeObjectURL(url); }}
                       className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-teal-100">
                       <Download className="w-3 h-3" /> {t('bristh.office.downloadMdBtn')}
                     </button>
                   </div>
                 </div>
                 {/* Processed files badge bar */}
                 <div className="px-4 py-2 bg-teal-50/50 border-b border-teal-100 flex items-center gap-2 flex-wrap shrink-0">
                   <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">📎 {t('bristh.office.sourceFiles')}</span>
                   {json.processedFiles.map((f: any, i: number) => (
                     <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-teal-200 rounded text-[10px] text-teal-800 font-medium">
                       <FileText className="w-3 h-3 text-teal-500" />
                       {f.name}
                     </span>
                   ))}
                 </div>
                 <div className="flex-1 overflow-y-auto p-6">
                   <div className="prose prose-sm max-w-none prose-headings:text-teal-900 prose-a:text-teal-600"
                     dangerouslySetInnerHTML={{ __html: marked.parse(json.content) }} />
                 </div>
               </div>
             );
           } else if (json.content) {
            // Markdown agents (Alice, David, Eric, Fiona, Grace)
            return (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                  <span className="text-xs font-bold text-gray-500">{json.summary}</span>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(json.content)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-gray-200">
                      <Copy className="w-3 h-3" /> {t('bristh.office.copyBtn')}
                    </button>
                    <button onClick={() => { const blob = new Blob([json.content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'document.md'; a.click(); URL.revokeObjectURL(url); }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-100">
                      <Download className="w-3 h-3" /> {t('bristh.office.downloadMdBtn')}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="prose prose-sm max-w-none prose-headings:text-emerald-900 prose-a:text-emerald-600"
                    dangerouslySetInnerHTML={{ __html: marked.parse(json.content) }} />
                </div>
              </div>
            );
          }
       } catch (e) {
         // Fallback to markdown below if parsing fails
       }
    }

    // Markdown render
    return (
      <div 
        className="prose prose-sm max-w-none prose-headings:text-emerald-900 prose-a:text-emerald-600"
        dangerouslySetInnerHTML={{ __html: marked.parse(payload) }} 
      />
    );
  };

  const isIdle = status === 'idle' && activeNodes.length === 0;
  // 'pingfang' agents stay hidden from the roster (still dispatchable by Chief)
  const rosterAIs = subAIs.filter(ai => ai.category !== 'pingfang');
  const isRunning = status === 'analyzing' || status === 'dispatching';
  const lastLog = logs[logs.length - 1];

  // Group nodes into phases (top → bottom), each phase wraps its cards in a grid
  const phases = (() => {
    const map = new Map<number, typeof activeNodes>();
    activeNodes.forEach(n => map.set(n.depth || 1, [...(map.get(n.depth || 1) || []), n]));
    const PHASE_LABEL_MAP: Record<number, string> = { 1: t('bristh.office.phase1'), 2: t('bristh.office.phase2'), 3: t('bristh.office.phase3') };
    return [...map.keys()].sort((a, b) => a - b).map(d => ({ depth: d, label: PHASE_LABEL_MAP[d] || `Phase ${d}`, nodes: map.get(d)! }));
  })();

  const renderNodeCard = (node: typeof activeNodes[number]) => {
    const ai = subAIs.find(a => a.id === node.agent);
    const isDone = node.status === 'done';
    const isFailed = node.status === 'failed';
    const isWorking = node.status === 'working';
    const isAwaitingApproval = node.status === 'awaiting_approval';

    return (
      <div
        key={node.taskId || node.agent}
        onClick={() => {
          if ((isDone || isAwaitingApproval) && node.taskId) openCopilot(ai?.name || node.agent, node.taskId);
        }}
        className={`rounded-xl border-2 overflow-hidden transition-all duration-300 group relative flex flex-col ${
          isFailed ? 'bg-red-50/50 border-red-300' :
          isAwaitingApproval ? 'bg-amber-50/40 border-amber-400 shadow-amber-100/50 shadow-md' :
          isDone ? 'bg-white border-emerald-400 cursor-pointer hover:shadow-emerald-200/60 hover:shadow-lg hover:-translate-y-0.5' :
          isWorking ? 'bg-white border-indigo-300' :
          'bg-gray-50 border-gray-200 border-dashed'
        }`}
      >
        {/* Card Header */}
        <div className={`px-3 py-2.5 flex items-center gap-2.5 border-b ${
          isAwaitingApproval ? 'border-amber-100 bg-amber-50/50' : isDone ? 'border-emerald-50' : isFailed ? 'border-red-100' : 'border-gray-100'
        }`}>
          {ai?.image ? (
            <img src={ai.image} alt={node.agent} className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-100 shrink-0" style={{ imageRendering: 'pixelated' }} />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-xs font-black text-gray-600 shrink-0">{node.agent[0]}</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">
              {node.agent}
              {node.hasAttachments && <span className="ml-1 text-xs text-blue-400" title={t('bristh.office.hasAttachment')}>📎</span>}
            </p>
            {ai?.name && <p className="text-[11px] text-gray-400 truncate">{ai.name.split(',')[1]?.trim()}</p>}
          </div>
          {isDone && <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs shrink-0">✓</div>}
          {isFailed && <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs shrink-0">✗</div>}
          {isWorking && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />}
          {isAwaitingApproval && <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">!</div>}
        </div>

        {/* Card Body: instruction */}
        <div className="px-3 py-2.5 flex-1">
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{node.instruction}</p>
        </div>

        {/* Card Footer: summary or status */}
        {isAwaitingApproval ? (
          <div className="px-3 py-2.5 border-t border-amber-100 bg-amber-50/50">
            <p className="text-xs text-amber-700 font-bold mb-2">🟡 {t('bristh.office.waitManualApproval')}</p>
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); if (node.taskId) openCopilot(ai?.name || node.agent, node.taskId); }}
                className="flex-1 px-2 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
              >
                👁 {t('bristh.office.viewEditBtn')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (node.taskId) handleApproveTask(node.taskId, node.agent); }}
                className="flex-1 px-2 py-2 bg-emerald-500 border border-emerald-600 rounded-lg text-xs font-bold text-white hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/20"
              >
                ✅ {t('bristh.office.approveBtn')}
              </button>
            </div>
          </div>
        ) : (
          <div className={`px-3 py-2 text-xs font-medium border-t ${
            isDone ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' :
            isFailed ? 'bg-red-50/50 border-red-100 text-red-600' :
            isWorking ? 'bg-indigo-50/50 border-indigo-100 text-indigo-600' :
            'bg-gray-50 border-gray-100 text-gray-400'
          }`}>
            {isDone && node.summary ? (
              <div>
                <p className="line-clamp-2">{node.summary}</p>
                {node.summary.includes('工具中生成') && <p className="text-[11px] text-blue-500 mt-0.5 font-bold">→ {t('bristh.office.clickToToolDraft')}</p>}
              </div>
            ) : isDone ? (
              <p>✅ {t('bristh.office.completedStatus')}</p>
            ) : isFailed ? (
              <div className="flex items-center justify-between">
                <p>❌ {t('bristh.office.failedStatus')}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); if (node.taskId) handleRetryTask(node.taskId, node.agent); }}
                  className="px-3 py-1 bg-red-100 text-red-600 rounded-lg shadow-sm text-xs font-bold hover:bg-red-200 transition-colors"
                >{t('bristh.office.retrySmallBtn')}</button>
              </div>
            ) : isWorking ? (
              <p className="font-mono truncate flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
                {nodeProgress[node.taskId] || t('bristh.office.toolExecuting')}
              </p>
            ) : (
              <p>⏳ {t('bristh.office.waitingExecution')}</p>
            )}
          </div>
        )}

        {/* Hover overlay for Copilot */}
        {isDone && (
          <div className="absolute inset-0 bg-indigo-900/80 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white z-10 rounded-xl">
            <MessageSquare className="w-5 h-5 mb-1 text-violet-300" />
            <span className="text-xs font-bold">{t('bristh.office.enterCopilot')}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-auto md:h-full flex flex-col overflow-visible md:overflow-hidden relative">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>

      <div className="flex-1 relative z-10 md:overflow-y-auto">
        {isIdle ? (
          /* ── Idle: one clear call to action + the team ── */
          <div className="max-w-3xl mx-auto px-4 py-8 md:py-12 flex flex-col items-center">
            <div className="w-full bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-10 flex flex-col items-center text-center">
              <img src="/pixel-office.png" alt="BEP Virtual Office" className="w-44 h-44 md:w-60 md:h-60 object-contain" />
              <h1 className="mt-4 text-xl md:text-2xl font-black text-gray-900">{t('bristh.office.idleTitle')}</h1>
              <p className="mt-2 text-sm md:text-base text-gray-500 max-w-md leading-relaxed">{t('bristh.office.idleSubtitle')}</p>
              <button
                onClick={() => router.push('/new-task')}
                className="mt-6 w-full sm:w-auto sm:min-w-[240px] flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 text-white rounded-xl text-base font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-500/25 transition-colors"
              >
                <Plus className="w-5 h-5" /> {t('bristh.office.newTaskCta')}
              </button>
              <button
                onClick={() => loadHistory('latest')}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
              >
                <History className="w-4 h-4" /> {t('bristh.office.viewLatestCta')}
              </button>
            </div>

            {rosterAIs.length > 0 && (
              <div className="w-full mt-8">
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1">{t('bristh.office.teamTitle')} · {rosterAIs.length}</h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
                  {rosterAIs.map(ai => (
                    <Tooltip key={ai.id} title={ai.desc} placement="top">
                      <div className="bg-white rounded-xl border border-gray-200 p-2 flex flex-col items-center text-center cursor-default hover:border-emerald-300 transition-colors">
                        <img src={ai.image} alt={ai.id} className="w-14 h-14 object-contain" style={{ imageRendering: 'pixelated' }} />
                        <p className="mt-1 text-xs font-bold text-gray-700 leading-tight">{ai.name.split(',')[0]}</p>
                        <p className="text-[10px] text-gray-400 leading-tight line-clamp-2">{ai.name.split(',')[1]?.trim() || ''}</p>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Active: status bar + phases stacked top → bottom (no horizontal scrolling) ── */
          <div className="max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-6 space-y-5">
            {/* Task status bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                      isRunning ? 'bg-indigo-50 text-indigo-700' :
                      status === 'failed' ? 'bg-red-50 text-red-600' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      {isRunning && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />}
                      {isRunning ? t('bristh.office.executing') : status === 'failed' ? t('bristh.office.failedStatus') : t('bristh.office.completedStatus')}
                    </span>
                    {activeNodes.length > 0 && (
                      <span className="text-xs text-gray-400 font-medium">{t('bristh.office.teamSize', { count: activeNodes.length })}</span>
                    )}
                  </div>
                  <p className="text-sm md:text-base font-semibold text-gray-800 leading-relaxed line-clamp-2">{currentTaskDisplay}</p>
                  {lastLog && (
                    <p className="mt-2 text-xs text-gray-500 font-mono truncate">
                      <span className={lastLog.source === 'Chief' ? 'text-emerald-600 font-bold' : lastLog.source === 'System' ? 'text-gray-400' : 'text-blue-600 font-medium'}>[{lastLog.source}]</span>{' '}
                      {lastLog.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
                  {resumable && currentContextId && status !== 'dispatching' && (
                    <button onClick={() => drivePipeline(currentContextId)} className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 shadow-md shadow-emerald-500/20">
                      <Activity className="w-4 h-4 mr-1.5" /> {t('bristh.office.resumeBtn')}
                    </button>
                  )}
                  {status === 'failed' && !resumable && lastDispatchedInputRef.current && (
                    <button onClick={() => handleDispatch(lastDispatchedInputRef.current, 'text')} className="flex items-center justify-center px-4 py-2.5 bg-orange-50 text-orange-600 rounded-xl text-sm font-bold hover:bg-orange-100 border border-orange-200">
                      <Activity className="w-4 h-4 mr-1.5" /> {t('bristh.office.retryTaskBtn')}
                    </button>
                  )}
                  {status === 'completed' && (
                    <button onClick={() => {
                      const savedInput = lastDispatchedInputRef.current;
                      if (savedInput) {
                        terminateTask();
                        setTimeout(() => handleDispatch(savedInput, 'text'), 100);
                      }
                    }} className="flex items-center justify-center px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200">
                      <RefreshCw className="w-4 h-4 mr-1.5" /> {t('bristh.office.rerunBtn')}
                    </button>
                  )}
                  <button onClick={terminateTask} className="flex items-center justify-center px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100">
                    <StopCircle className="w-4 h-4 mr-1.5" /> {t('bristh.office.endTaskBtn')}
                  </button>
                </div>
              </div>
            </div>

            {/* Chief analyzing (before any agent is assigned) */}
            {activeNodes.length === 0 && (
              <div className="bg-white rounded-2xl border-2 border-dashed border-emerald-200 p-8 flex flex-col items-center text-center">
                <img src="/pixel_worker_analysis.png" alt="Chief" className="w-20 h-20 object-contain" style={{ imageRendering: 'pixelated' }} />
                <p className="mt-3 text-sm font-bold text-emerald-700 flex items-center gap-2">
                  {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isRunning ? t('bristh.office.chiefAnalyzing') : t('bristh.office.noAgentFallback')}
                </p>
              </div>
            )}

            {/* Phases */}
            {phases.map((phase, idx) => {
              const doneCount = phase.nodes.filter(n => n.status === 'done').length;
              const phaseActive = phase.nodes.some(n => n.status === 'working');
              const phaseDone = doneCount === phase.nodes.length;
              return (
                <div key={phase.depth}>
                  {idx > 0 && (
                    <div className="flex justify-center -mt-2 mb-3" aria-hidden>
                      <div className="flex flex-col items-center">
                        <div className={`w-0.5 h-5 ${phaseActive ? 'bg-indigo-400 animate-pulse' : 'bg-gray-300'}`} />
                        <ChevronDown className={`w-5 h-5 -mt-1.5 ${phaseActive ? 'text-indigo-500' : 'text-gray-400'}`} />
                      </div>
                    </div>
                  )}
                  <section className={`rounded-2xl border p-4 md:p-5 ${phaseActive ? 'bg-indigo-50/40 border-indigo-200' : phaseDone ? 'bg-white border-emerald-200' : 'bg-white/70 border-gray-200'}`}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="flex items-center gap-2 text-sm md:text-base font-black text-gray-800">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${phaseDone ? 'bg-emerald-500' : phaseActive ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                          {phaseDone ? '✓' : phase.depth}
                        </span>
                        {phase.label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 shrink-0">{t('bristh.office.stageProgress', { done: doneCount, total: phase.nodes.length })}</span>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                      {phase.nodes.map(renderNodeCard)}
                    </div>
                  </section>
                </div>
              );
            })}

            {/* Execution log — collapsed by default */}
            {logs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200">
                <button
                  onClick={() => setLogOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-2xl"
                >
                  <span className="flex items-center gap-2"><Terminal className="w-4 h-4" /> {logOpen ? t('bristh.office.hideLog') : t('bristh.office.showLog', { count: logs.length })}</span>
                  {logOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {logOpen && (
                  <div ref={logEndRef} className="max-h-80 overflow-y-auto border-t border-gray-100 px-4 py-3 font-mono text-xs text-slate-700 space-y-1.5">
                    {logs.map(log => (
                      <div key={log.id} className="leading-relaxed">
                        <span className="text-slate-400">[{log.time}]</span>{' '}
                        <span className={log.source === 'Chief' ? 'text-emerald-600 font-bold' : log.source === 'System' ? 'text-slate-500' : 'text-blue-600 font-medium'}>
                          [{log.source}]
                        </span>{' '}
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copilot Mode Modal */}
      <Modal
        title={
          <div className="flex items-center text-lg font-black text-gray-800">
            <MessageSquare className="w-5 h-5 mr-2 text-emerald-600" /> 
            {copilotNode?.agent.split(',')[0]} {t('bristh.office.copilotSpace')}
          </div>
        }
        open={copilotOpen}
        onCancel={() => setCopilotOpen(false)}
        footer={null}
        width={1100}
        centered
        destroyOnClose
        bodyStyle={{ padding: 0 }}
      >
        {copilotData ? (
          <div className="flex h-[75vh] w-full border-t border-gray-200">
            {/* 左侧：产物预览区 */}
            <div className="w-[60%] bg-[#fcfcfc] border-r border-gray-200 flex flex-col">
               <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('bristh.office.livePreview')}</span>
                  <span className="text-[10px] bg-blue-100 text-emerald-600 px-2 py-0.5 rounded font-bold">Auto-Sync</span>
               </div>
               <div className="flex-1 overflow-y-auto p-6 relative">
                 {/* 加载遮罩 */}
                 {copilotLoading && (
                   <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center transition-all">
                      <Spin size="large" />
                   </div>
                 )}
                 {renderPreview(copilotData.resultPayload)}
               </div>
            </div>

            {/* 右侧：对话调教区 */}
            <div className="w-[40%] bg-white flex flex-col">
               <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('bristh.office.agentChat')}</span>
               </div>
               
               {/* 聊天记录 */}
               <div className="flex-1 p-4 overflow-y-auto space-y-5 bg-white scrollbar-thin scrollbar-thumb-gray-200">
                 
                 {/* 初始 AI 消息与 Think+Work */}
                 <div className="flex items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-emerald-600 font-bold text-xs mr-3 shrink-0">AI</div>
                    <div className="w-[85%]">
                      {/* 初次执行的 Think+Work 过程 */}
                      {copilotData.thinkLog && <ThinkBlock content={copilotData.thinkLog} />}
                      {copilotData.toolCallsLog && <ToolCallsBlock calls={JSON.parse(copilotData.toolCallsLog)} />}
                      
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3 text-sm text-gray-800">
                        {t('bristh.office.aiGreeting', {name: copilotNode?.agent.split(',')[0]})}
                      </div>
                    </div>
                 </div>

                 {/* 历史对话 */}
                 {copilotData.copilotHistory && JSON.parse(copilotData.copilotHistory).map((msg: any, idx: number) => (
                   <div key={idx} className={`flex items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        msg.role === 'user' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white ml-3' : 'bg-emerald-50 text-emerald-600 mr-3'
                      }`}>
                        {msg.role === 'user' ? 'ME' : 'AI'}
                      </div>
                      
                      <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                         {/* 渲染 AI 回复时的 Think 和 ToolCalls 如果有的话 */}
                         {msg.role === 'assistant' && msg.think && <ThinkBlock content={msg.think} />}
                         {msg.role === 'assistant' && msg.toolCalls && <ToolCallsBlock calls={msg.toolCalls} />}
                         
                         <div className={`rounded-2xl p-3 text-sm inline-block text-left ${
                           msg.role === 'user' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-sm' : 'bg-gray-50 text-gray-800 rounded-tl-sm'
                         }`}>
                           {msg.content}
                         </div>
                      </div>
                   </div>
                 ))}
                 
                 {copilotLoading && (
                   <div className="flex items-start">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-emerald-600 font-bold text-xs mr-3 shrink-0">AI</div>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3 text-sm text-gray-800 flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                   </div>
                 )}
                 <div ref={chatEndRef} />
               </div>
               
               {/* 输入框 */}
               <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center bg-white border border-gray-300 rounded-full px-4 py-2 shadow-inner focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <input 
                      type="text" 
                      className="flex-1 outline-none text-sm bg-transparent placeholder-gray-400"
                      placeholder="Tell AI what to change..."
                      value={copilotMessage}
                      onChange={(e) => setCopilotMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendCopilotMessage()}
                      disabled={copilotLoading}
                    />
                    <button 
                      onClick={sendCopilotMessage}
                      disabled={copilotLoading || !copilotMessage.trim()}
                      className="ml-2 w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center text-white hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-md shadow-emerald-500/20"
                    >
                      <Send className="w-4 h-4 -ml-0.5 mt-0.5" />
                    </button>
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64">
            <Spin size="large" />
            <span className="ml-3 text-gray-500 font-bold">Loading task data...</span>
          </div>
        )}
      </Modal>

      <style dangerouslySetInnerHTML={{__html: `
        .animate-fade-in-up {
          animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}

export default function OfficePage() {
  const { setPendingPptData, setCopilotView } = useWorkspace();
  return <VirtualOfficeView onOpenPptCopilot={setPendingPptData} onOpenDocCopilot={setCopilotView} />;
}