
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Modal, Tooltip, Spin } from 'antd';
import { marked } from 'marked';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ThinkBlock, ToolCallsBlock, renderPreviewStandalone, COLOR_BORDER_MAP } from '@/components/shared/UIBlocks';
import { Building2, Cpu, Activity, History, BookOpen, Settings, Send, CheckCircle2, ChevronRight, ChevronLeft, Users, Layout, Plus, FileText, Calendar, Presentation, AlertTriangle, Scale, Mail, StopCircle, Edit, Edit3, Link2, UploadCloud, Terminal, Info, Download, MessageSquare, Wrench, PenTool, CheckCircle, XCircle, Hourglass, ChevronDown, ChevronUp, Database, Menu, X, Copy, RefreshCw, GitMerge, LogOut, UserCircle, Phone, AtSign, Camera, Save, ArrowLeft, ArrowRight, SaveAll, Loader2 } from 'lucide-react';

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
  const [currentTaskDisplay, setCurrentTaskDisplay] = useState(t('bristh.office.noTask'));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  
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
            return {
              id: a.name,  // Agent routes use Name (Alice, Bob...) as the identifier
              name: `${a.name}, ${a.title?.split('/')[0]?.trim() || ''}`,
              desc: a.description || '',
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
          { id: 'Alice', name: 'Alice, 方案架构师', desc: '撰写商业方案', image: '/pixel_worker_analysis.png', color: 'border-emerald-500', shadow: 'shadow-emerald-500/20' },
          { id: 'Bob', name: 'Bob, 日程安排专员', desc: '生成日历邀请', image: '/pixel_worker_social.png', color: 'border-emerald-500', shadow: 'shadow-emerald-500/20' },
          { id: 'Edda', name: 'Edda, PPT制作专员', desc: '生成幻灯片', image: '/pixel_worker_presentation.png', color: 'border-purple-500', shadow: 'shadow-purple-500/20' },
          { id: 'David', name: 'David, 内控纪检专员', desc: '内部整改', image: '/pixel_worker_support.png', color: 'border-red-500', shadow: 'shadow-red-500/20' },
          { id: 'Fiona', name: 'Fiona, 组织宣发专员', desc: '内部通报', image: '/pixel_worker.png', color: 'border-amber-500', shadow: 'shadow-amber-500/20' },
          { id: 'Eric', name: 'Eric, 法务写作专员', desc: '法律文书', image: '/pixel_worker_filing.png', color: 'border-cyan-500', shadow: 'shadow-cyan-500/20' },
          { id: 'Grace', name: 'Grace, 邮件分发专员', desc: '邮件发送', image: '/pixel_worker_social.png', color: 'border-pink-500', shadow: 'shadow-pink-500/20' },
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

  const activeAgentIds = activeNodes.map(n => n.agent);
  const idleAIs = subAIs.filter(ai => !activeAgentIds.includes(ai.id));
  const activeAIs = subAIs.filter(ai => activeAgentIds.includes(ai.id));

  const addLog = (source: string, message: string) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      source,
      message,
      time: new Date().toLocaleTimeString([], { hour12: false })
    }]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotData?.copilotHistory]);

  const loadHistory = async (contextId: string = 'latest') => {
    try {
      const res = await fetch(`/api/bristh/tasks?contextId=${contextId}`);
      const tasks = await res.json();
      if (!tasks || tasks.length === 0) {
        addLog('System', 'No historical tasks found.');
        return;
      }
      
      const statusMap = (s: string) => {
        if (s === 'COMPLETED' || s === 'APPROVED') return 'done';
        if (s === 'FAILED') return 'failed';
        if (s === 'AWAITING_APPROVAL') return 'awaiting_approval';
        if (s === 'RUNNING') return 'working';
        if (s === 'PENDING') return 'idle';
        return 'done';
      };

      const mappedNodes = tasks.map((t: any) => ({
        agent: t.agent,
        instruction: t.instruction,
        status: statusMap(t.status),
        taskId: t.id,
        summary: (() => { try { return JSON.parse(t.resultPayload || '{}').summary || ''; } catch { return ''; } })(),
        requiresApproval: t.requiresApproval,
        hasAttachments: !!t.attachmentIds,
      }));
      setActiveNodes(mappedNodes);
      setStatus('completed');
      setCurrentTaskDisplay(`[Restored] Context: ${tasks[0].contextId?.substring(0, 12)}...`);
      
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

  // Auto-restore active pipeline on mount
  // Only restore if there are RUNNING tasks (actively executing).
  // Stale AWAITING_APPROVAL tasks from old pipelines should not hijack the idle view.
  useEffect(() => {
    if (pendingDispatchTask) return; // Skip if we're about to dispatch
    
    fetch('/api/bristh/tasks?mode=history')
      .then(r => r.json())
      .then((contexts: any[]) => {
        if (!Array.isArray(contexts)) return;
        const activeCtx = contexts.find((c: any) => 
          c.tasks?.some((t: any) => t.status === 'RUNNING')
        );
        if (activeCtx) {
          loadHistory(activeCtx.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (pendingDispatchTask) {
      const { input, inputMode, contextId, tasks } = pendingDispatchTask;
      setPendingDispatchTask(null);
      if (contextId && tasks) {
        // Two-step flow: tasks already created in confirm step, go straight to execution
        handleDispatchWithTasks(input, tasks);
      } else {
        // Legacy flow: single-step dispatch (from old UI or email-daemon)
        handleDispatch(input, inputMode);
      }
    }
  }, [pendingDispatchTask]);

  const handleDispatch = async (dispatchInput: string, dispatchMode: string) => {
    if (dispatchMode === 'text' && !dispatchInput.trim()) return;
    
    setCurrentTaskDisplay(dispatchMode === 'text' ? dispatchInput.substring(0, 50) + '...' : `已关联${dispatchMode === 'file' ? '上传文件' : 'CRM邮件'}`);
    setStatus('analyzing');
    setActiveNodes([]);
    setLogs([]);
    
    addLog('System', 'Task initiated. Routing to Chief Master AI.');
    addLog('Chief', 'Reading context and analyzing intent...');

    try {
      const res = await fetch('/api/bristh/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'TEXT', rawContent: dispatchInput, locale: i18n.language })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API Error');

      setStatus('dispatching');
      const assignedTasks = data.tasks || [];
      addLog('Chief', `Orchestration complete. Participating agents: ${assignedTasks.map((t:any) => t.agent).join(', ')}.`);
      // Use Chief's phase assignments (dynamic pipeline)
      const PHASE_LABELS: Record<number, string> = { 1: '信息准备', 2: '核心工作', 3: '整合分发' };

      const initialActiveNodes = assignedTasks.map((t:any) => {
        const taskRecord = data.tasks.find((dbTask: any) => dbTask.agent === t.agent);
        return {
          agent: t.agent,
          instruction: t.instruction,
          status: 'working',
          taskId: taskRecord?.id,
          depth: taskRecord?.phase || t.phase || 1,
          hasAttachments: !!taskRecord?.attachmentIds || !!t.attachmentIds?.length,
        };
      });
      setActiveNodes(initialActiveNodes);

      // Collect results per phase for inter-phase data flow
      const phaseResults: Record<number, { agent: string; summary: string; content: string }[]> = {};

      const executeAgent = async (taskRecord: any, priorResults?: { agent: string; summary: string; content: string }[]) => {
        const agentName = taskRecord.agent;
        addLog(agentName, `Executing sub-task: ${taskRecord.instruction.substring(0, 40)}...`);
        try {
           const agentEndpoint = `/api/bristh/agents/${agentName.toLowerCase()}`;
           
           const agentRes = await fetch(agentEndpoint, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ taskId: taskRecord.id, locale: i18n.language, priorPhaseResults: priorResults || [] })
           });

           if (!agentRes.ok) {
             if (agentRes.status === 404) {
                addLog(agentName, `(Mock) Completed task successfully.`);
                setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: 'done'} : n));
                return null;
             }
             throw new Error(`Failed with status ${agentRes.status}`);
           }

           const agentData = await agentRes.json();
           
           if (agentData.task?.thinkLog) {
             addLog(agentName, `[Thinking Completed]`);
           }
           if (agentData.task?.toolCallsLog) {
             addLog(agentName, `[Tool Dispatched: ${JSON.parse(agentData.task.toolCallsLog)[0]?.tool}]`);
           }

           addLog(agentName, `✅ Completed. Output payload saved to asset DB.`);
           // Extract summary and content for inter-phase data flow
           let summary = '';
           let content = '';
           try {
             const payload = agentData.task?.resultPayload;
             if (payload) {
               const parsed = JSON.parse(payload);
               summary = parsed.summary || '';
               content = parsed.content || '';
             }
           } catch { summary = ''; }
           setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: 'done', summary} : n));
           return { agent: agentName, summary, content };
        } catch (err: any) {
           addLog(agentName, `❌ Error: ${err.message}`);
           setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: 'failed'} : n));
           return null;
        }
      };

      // Group tasks by phase (from Chief) and execute sequentially
      const phaseGroups = new Map<number, any[]>();
      data.tasks.forEach((t: any) => {
        const phase = t.phase || 1;
        phaseGroups.set(phase, [...(phaseGroups.get(phase) || []), t]);
      });

      // Collect all prior results across phases
      let allPriorResults: { agent: string; summary: string; content: string }[] = [];

      for (const phase of [...phaseGroups.keys()].sort()) {
        const group = phaseGroups.get(phase)!;
        const label = PHASE_LABELS[phase] || `Phase ${phase}`;
        if (phase > 1) addLog('System', `⏩ Phase ${phase} (${label}): ${group.map((t: any) => t.agent).join(', ')} — ${i18n.language === 'en' ? 'Previous phase outputs injected' : '前序阶段产出已注入'}`);
        
        const results = await Promise.all(group.map((t: any) => executeAgent(t, allPriorResults)));
        
        // Collect this phase's results for next phase
        const phaseOutput = results.filter(Boolean) as { agent: string; summary: string; content: string }[];
        phaseResults[phase] = phaseOutput;
        allPriorResults = [...allPriorResults, ...phaseOutput];
      }

      addLog('Chief', 'All sub-tasks reported back. Pipeline finished.');
      setStatus('completed');
      
    } catch (err: any) {
      addLog('System', `Error: ${err.message}`);
      setStatus('failed');
    }
  };

  // Two-step flow: tasks already created, go straight to execution
  const handleDispatchWithTasks = async (dispatchInput: string, preCreatedTasks: any[]) => {
    setCurrentTaskDisplay(dispatchInput.substring(0, 50) + '...');
    setStatus('dispatching');
    setActiveNodes([]);
    setLogs([]);

    addLog('System', 'Task confirmed. Executing pre-assigned pipeline.');
    addLog('Chief', `Dispatching ${preCreatedTasks.length} agents: ${preCreatedTasks.map((t: any) => t.agent).join(', ')}.`);

    // Use Chief's phase assignments (dynamic pipeline)
    const PHASE_LABELS2: Record<number, string> = { 1: '信息准备', 2: '核心工作', 3: '整合分发' };

    const initialActiveNodes = preCreatedTasks.map((t: any) => ({
      agent: t.agent,
      instruction: t.instruction,
      status: 'working',
      taskId: t.id,
      depth: t.phase || 1,
      hasAttachments: !!t.attachmentIds,
    }));
    setActiveNodes(initialActiveNodes);

    // Collect results per phase for inter-phase data flow
    const phaseResults2: Record<number, { agent: string; summary: string; content: string }[]> = {};

    const executeAgent = async (taskRecord: any, priorResults?: { agent: string; summary: string; content: string }[]) => {
      const agentName = taskRecord.agent;
      addLog(agentName, `Executing sub-task: ${taskRecord.instruction.substring(0, 40)}...`);
      try {
        const agentEndpoint = `/api/bristh/agents/${agentName.toLowerCase()}`;
        const agentRes = await fetch(agentEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: taskRecord.id, locale: i18n.language, priorPhaseResults: priorResults || [] })
        });

        if (!agentRes.ok) {
          if (agentRes.status === 404) {
            addLog(agentName, `(Mock) Completed task successfully.`);
            setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: 'done'} : n));
            return null;
          }
          const errData = await agentRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed with status ${agentRes.status}`);
        }
        const agentData = await agentRes.json();
        if (agentData.task?.thinkLog) addLog(agentName, `[Thinking Completed]`);
        if (agentData.task?.toolCallsLog) addLog(agentName, `[Tool Dispatched: ${JSON.parse(agentData.task.toolCallsLog)[0]?.tool}]`);

        addLog(agentName, `✅ Completed. Output payload saved to asset DB.`);
        let summary = '';
        let content = '';
        try {
          const payload = agentData.task?.resultPayload;
          if (payload) { const parsed = JSON.parse(payload); summary = parsed.summary || ''; content = parsed.content || ''; }
        } catch { summary = ''; }

        // Check if this task requires approval
        const finalStatus = taskRecord.requiresApproval ? 'awaiting_approval' : 'done';
        if (taskRecord.requiresApproval) {
          addLog(agentName, `🟡 ${i18n.language === 'en' ? 'Requires manual approval to continue.' : '需要人工审批确认才能继续。'}`);
        }
        setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: finalStatus, summary} : n));
        return { agent: agentName, summary, content };
      } catch (err: any) {
        addLog(agentName, `❌ Error: ${err.message}`);
        setActiveNodes(prev => prev.map(n => n.agent === agentName ? {...n, status: 'failed'} : n));
        return null;
      }
    };

    // Group tasks by phase and execute sequentially, respecting approval gates
    const phaseGroups2 = new Map<number, any[]>();
    preCreatedTasks.forEach((t: any) => {
      const phase = t.phase || 1;
      phaseGroups2.set(phase, [...(phaseGroups2.get(phase) || []), t]);
    });
    const sortedPhases = [...phaseGroups2.keys()].sort();
    let hasAwaitingApproval = false;
    let allPriorResults2: { agent: string; summary: string; content: string }[] = [];

    for (const phase of sortedPhases) {
      const group = phaseGroups2.get(phase)!;
      if (hasAwaitingApproval) {
        addLog('System', `⏸️ Phase ${phase} (${PHASE_LABELS2[phase] || `Phase ${phase}`}): ${group.map((t: any) => t.agent).join(', ')} ${i18n.language === 'en' ? 'waiting for approval to execute...' : '等待审批完成后执行...'}`);
        break;
      }
      if (phase > 1) addLog('System', `⏩ Phase ${phase} (${PHASE_LABELS2[phase] || `Phase ${phase}`}): ${group.map((t: any) => t.agent).join(', ')} — ${i18n.language === 'en' ? 'Previous phase outputs injected' : '前序阶段产出已注入'}`);
      
      const results = await Promise.all(group.map((t: any) => executeAgent(t, allPriorResults2)));
      const phaseOutput = results.filter(Boolean) as { agent: string; summary: string; content: string }[];
      phaseResults2[phase] = phaseOutput;
      allPriorResults2 = [...allPriorResults2, ...phaseOutput];
      
      hasAwaitingApproval = group.some((t: any) => t.requiresApproval);
    }

    if (!hasAwaitingApproval) {
      addLog('Chief', 'All sub-tasks reported back. Pipeline finished.');
      setStatus('completed');
    } else {
      // Send approval notification email
      const ctxId = preCreatedTasks[0]?.contextId;
      if (ctxId) {
        addLog('System', `📧 ${i18n.language === 'en' ? 'Sending approval notification email...' : '正在发送审批通知邮件...'}`);
        try {
          const notifyRes = await fetch('/api/bristh/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contextId: ctxId }),
          });
          const notifyData = await notifyRes.json();
          if (notifyData.success) {
            addLog('System', `✅ ${i18n.language === 'en' ? \`Approval notification sent to ${notifyData.emailSentTo} (${notifyData.tasksNotified} pending tasks)\` : \`审批通知已发送至 ${notifyData.emailSentTo}（${notifyData.tasksNotified} 项待审批）\`}`);
          } else {
            addLog('System', `⚠️ ${i18n.language === 'en' ? 'Failed to send notification email:' : '通知邮件发送失败:'} ${notifyData.error || notifyData.message || 'Unknown'}`);
          }
        } catch (err: any) {
          addLog('System', `⚠️ ${i18n.language === 'en' ? 'Failed to send notification email:' : '通知邮件发送失败:'} ${err.message}`);
        }
      }
      addLog('Chief', 'Pipeline paused. Waiting for human approval on flagged tasks.');
      setStatus('completed');
    }
  };

  // Handle retrying a failed task
  const handleRetryTask = async (taskId: string, agentName: string) => {
    addLog(agentName, `🔄 ${i18n.language === 'en' ? 'User manually retrying execution...' : '用户手动重试执行...'}`);
    setActiveNodes(prev => prev.map(n => n.taskId === taskId ? { ...n, status: 'working' } : n));
    try {
      const agentRes = await fetch(`/api/bristh/agents/${agentName.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, locale: i18n.language }),
      });
      if (!agentRes.ok) {
        const errData = await agentRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed with status ${agentRes.status}`);
      }
      const agentData = await agentRes.json();
      let summary = '';
      try {
        const payload = agentData.task?.resultPayload;
        if (payload) { const parsed = JSON.parse(payload); summary = parsed.summary || ''; }
      } catch {}
      addLog(agentName, '✅ Completed.');
      const requiresApproval = agentData.task?.requiresApproval;
      const finalStatus = requiresApproval ? 'awaiting_approval' : 'done';
      if (requiresApproval) addLog(agentName, `🟡 需要人工审批确认才能继续。`);
      setActiveNodes(prev => prev.map(n => n.taskId === taskId ? { ...n, status: finalStatus, summary } : n));
    } catch (err: any) {
      addLog(agentName, `❌ Error: ${err.message}`);
      setActiveNodes(prev => prev.map(n => n.taskId === taskId ? { ...n, status: 'failed' } : n));
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

      addLog('System', `✅ ${agentName} ${i18n.language === 'en' ? \`approved (${data.remainingApprovals} pending approvals remaining)\` : \`已批准 (剩余 ${data.remainingApprovals} 项待审批)\`}`);

      // If all tasks are approved, execute remaining pipeline stages in depth order
      if (data.allApproved) {
        addLog('System', `🎉 ${i18n.language === 'en' ? 'All approvals passed! Resuming pipeline execution...' : '所有审批已通过！正在恢复管线执行...'}`);
        
        // Helper to execute a single agent
        const executeAgent = async (node: { agent: string; taskId: string; depth: number }) => {
          addLog(node.agent, `Executing sub-task...`);
          setActiveNodes(prev => prev.map(n => n.taskId === node.taskId ? { ...n, status: 'working' } : n));
          try {
            const agentRes = await fetch(`/api/bristh/agents/${node.agent.toLowerCase()}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: node.taskId, locale: i18n.language }),
            });
            if (!agentRes.ok) {
              const errData = await agentRes.json().catch(() => ({}));
              throw new Error(errData.error || `Failed with status ${agentRes.status}`);
            }
            const agentData = await agentRes.json();
            let summary = '';
            try {
              const payload = agentData.task?.resultPayload;
              if (payload) { const parsed = JSON.parse(payload); summary = parsed.summary || ''; }
            } catch {}
            addLog(node.agent, '✅ Completed.');
            setActiveNodes(prev => prev.map(n => n.taskId === node.taskId ? { ...n, status: 'done', summary } : n));
          } catch (err: any) {
            addLog(node.agent, `❌ Error: ${err.message}`);
            setActiveNodes(prev => prev.map(n => n.taskId === node.taskId ? { ...n, status: 'failed' } : n));
          }
        };

        // Find all pending/working agents that haven't completed yet (depth > current approval depth)
        // Use latest state via callback
        const pendingNodes: { agent: string; taskId: string; depth: number }[] = [];
        setActiveNodes(prev => {
          prev.forEach(n => {
            if ((n.status === 'working' || n.status === 'idle') && n.taskId && n.agent.toLowerCase() !== 'chief') {
              pendingNodes.push({ agent: n.agent, taskId: n.taskId, depth: n.depth });
            }
          });
          return prev;
        });

        // Group by depth and execute sequentially
        const depthGroups = new Map<number, typeof pendingNodes>();
        pendingNodes.forEach(n => {
          depthGroups.set(n.depth, [...(depthGroups.get(n.depth) || []), n]);
        });

        for (const depth of [...depthGroups.keys()].sort()) {
          const group = depthGroups.get(depth)!;
          addLog('System', `Dependencies met. Starting stage ${depth}: ${group.map(n => n.agent).join(', ')}...`);
          await Promise.all(group.map(n => executeAgent(n)));
        }

        addLog('Chief', 'All approvals complete. Pipeline finished. ✅');
      }
    } catch (err: any) {
      addLog('System', `⚠️ ${i18n.language === 'en' ? 'Approval request failed:' : '审批请求失败:'} ${err.message}`);
      setActiveNodes(prev => prev.map(n => 
        n.taskId === taskId ? { ...n, status: 'awaiting_approval' } : n
      ));
    }
  };

  const terminateTask = () => {
    setStatus('idle');
    setActiveNodes([]);
    setCurrentTaskDisplay('暂无活动任务。点击新增接入任务。');
    setLogs([]);
  };

  // --- Copilot Methods ---
  const openCopilot = async (agent: string, taskId: string) => {
    // For Edda and Iris, redirect to the Toolbox for the full editor experience
    if (agent.startsWith('Edda') || agent.startsWith('Iris')) {
      try {
        const res = await fetch(`/api/bristh/tasks/${taskId}`);
        const data = await res.json();
        const payload = JSON.parse(data.resultPayload || '{}');
        if (payload.assetId) {
          router.push(`/toolbox?assetId=${payload.assetId}`);
          return;
        }
      } catch (e) {
        console.error('Failed to get assetId:', e);
      }
      
      // Do not fall through if assetId is missing
      router.push('/toolbox');
      return;
    }

    // For all other agents, open DocumentEditorView
    if (onOpenDocCopilot) {
      onOpenDocCopilot({ taskId, agent });
      return;
    }
    // Fallback: modal copilot
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
                      <Download className="w-3 h-3" /> 下载 .pptx
                    </a>
                  </div>
                  <div className="flex gap-2 px-4 py-2 border-b border-gray-100 overflow-x-auto shrink-0 bg-gray-50/50">
                    {slides.map((s: any, i: number) => {
                      const titleEl = s.elements?.find((e: any) => e.style?.fontWeight === 'bold' && e.style?.fontSize >= 1.8);
                      return (
                        <button key={i} onClick={() => setViewSlide(i)}
                          className={`shrink-0 w-24 rounded-lg border-2 overflow-hidden transition-all ${viewSlide === i ? 'border-emerald-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="aspect-[16/9] bg-white relative p-1">
                            <div className="text-[5px] font-bold text-gray-800 truncate">{titleEl?.content || `Slide ${i+1}`}</div>
                          </div>
                          <div className="px-1 py-0.5 bg-gray-50 border-t border-gray-100">
                            <span className={`text-[8px] font-bold ${viewSlide === i ? 'text-emerald-600' : 'text-gray-400'}`}>第 {i+1} 页</span>
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
                  <span className="text-xs font-bold text-gray-500">{json.summary || '日历邀请已生成'}</span>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(json.icsContent)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-gray-200">
                      <Copy className="w-3 h-3" /> 复制
                    </button>
                    <button onClick={() => { const blob = new Blob([json.icsContent], { type: 'text/calendar' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'meeting.ics'; a.click(); URL.revokeObjectURL(url); }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-100">
                      <Download className="w-3 h-3" /> 下载 .ics
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
                       <Copy className="w-3 h-3" /> 复制
                     </button>
                     <button onClick={() => { const blob = new Blob([json.content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'kelly_output.md'; a.click(); URL.revokeObjectURL(url); }}
                       className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-teal-100">
                       <Download className="w-3 h-3" /> 下载 .md
                     </button>
                   </div>
                 </div>
                 {/* Processed files badge bar */}
                 <div className="px-4 py-2 bg-teal-50/50 border-b border-teal-100 flex items-center gap-2 flex-wrap shrink-0">
                   <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">📎 源文件:</span>
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
                      <Copy className="w-3 h-3" /> 复制
                    </button>
                    <button onClick={() => { const blob = new Blob([json.content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'document.md'; a.click(); URL.revokeObjectURL(url); }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-100">
                      <Download className="w-3 h-3" /> 下载 .md
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

  return (
    <div className="w-full h-auto md:h-full flex flex-col md:flex-row overflow-visible md:overflow-hidden relative">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>

      {/* 左侧中枢区 (Command Center) */}
      <div className="w-full md:w-[380px] h-auto md:h-full border-b md:border-b-0 md:border-r border-gray-200/80 bg-white flex flex-col z-20 shadow-sm relative shrink-0">
        
        <div className="p-5 border-b border-gray-200 bg-white">
          <div className="flex justify-between items-center mb-3">
             <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center">
               当前任务卡片 <ChevronRight className="w-3 h-3 mx-1"/> {status === 'idle' ? '待命' : status === 'completed' ? '已完成' : status === 'failed' ? '遇到异常' : '执行中'}
             </h2>
             {(status !== 'idle' && status !== 'failed' && status !== 'completed') && (
               <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
             )}
          </div>
          <p className="font-mono text-[12px] text-gray-800 font-medium bg-gray-50 p-3 rounded-lg border border-gray-100 min-h-[60px] line-clamp-3">
             {currentTaskDisplay}
          </p>
          
          <div className="mt-4 flex space-x-2">
            {status === 'idle' ? (
              <>
                <button onClick={() => router.push('/new-task')} className="flex-1 flex items-center justify-center py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg text-xs font-bold hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-emerald-500/20">
                  <Plus className="w-3 h-3 mr-1" /> 新增 / 管理接入
                </button>
                <button onClick={() => loadHistory('latest')} className="flex-1 flex items-center justify-center py-2 bg-purple-50 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-100 shadow-sm border border-purple-200">
                  <History className="w-3 h-3 mr-1" /> 加载最新后台执行
                </button>
              </>
            ) : (
              <>
                <button onClick={terminateTask} className="flex-1 flex items-center justify-center py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100">
                  <StopCircle className="w-3 h-3 mr-1" /> 终止复位
                </button>
                {status === 'failed' && (
                  <button onClick={() => handleDispatch(input, 'text')} className="flex-1 flex items-center justify-center py-2 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 shadow-sm border border-orange-200">
                    <Activity className="w-3 h-3 mr-1" /> 重试任务
                  </button>
                )}
                {status === 'completed' && (
                  <button onClick={terminateTask} className="flex-1 flex items-center justify-center py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200">
                    归档复位
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-5 border-b border-gray-200">
          <div className={`relative w-full rounded-2xl bg-white border-2 shadow-lg transition-all duration-300 overflow-hidden flex items-center p-3 ${
              status === 'idle' ? 'border-gray-200' :
              (status === 'analyzing' || status === 'dispatching') ? 'border-emerald-500 shadow-emerald-500/20' : 'border-gray-200'
            }`}
          >
            <div className="w-20 h-20 bg-gray-50 rounded-xl flex items-center justify-center mr-4">
              <img src="/pixel_worker_analysis.png" alt="Chief AI" className="h-[90%] object-contain filter drop-shadow-md scale-125" style={{ imageRendering: 'pixelated' }} />
            </div>
            <div className="flex-1">
              <h3 className="font-extrabold text-base text-gray-900 leading-tight">Chief, 总裁特助</h3>
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wide">任务总管 / Orchestrator</p>
              <div className="mt-2 flex items-center space-x-1">
                 <div className={`w-2 h-2 rounded-full ${status !== 'idle' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                 <span className="text-[10px] font-bold text-gray-500">{status !== 'idle' ? 'ONLINE' : 'IDLE'}</span>
              </div>
            </div>

            {status === 'analyzing' && (
              <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-end pr-8 backdrop-blur-[1px]">
                 <div className="flex items-center text-emerald-600 font-bold text-sm tracking-widest animate-pulse">
                   <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                   INITIALIZING...
                 </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col p-5 overflow-hidden">
           <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
             <Terminal className="w-3 h-3 mr-1" /> 任务执行 Log
           </h3>
           <div className="flex-1 bg-white rounded-xl p-4 overflow-y-auto font-mono text-[11px] text-slate-700 space-y-2 shadow-inner border border-slate-200 scrollbar-thin scrollbar-thumb-slate-200">
             {logs.length === 0 ? (
               <div className="text-slate-400 italic">Waiting for incoming tasks...</div>
             ) : (
               logs.map(log => (
                 <div key={log.id} className="leading-relaxed">
                   <span className="text-slate-400">[{log.time}]</span>{' '}
                    <span className={log.source === 'Chief' ? 'text-emerald-600 font-bold' : log.source === 'System' ? 'text-slate-500' : 'text-blue-600 font-medium'}>
                     [{log.source}]
                   </span>{' '}
                   <span className="text-slate-700">{log.message}</span>
                 </div>
               ))
             )}
             <div ref={logEndRef} />
           </div>
        </div>
      </div>


      <div className="flex-1 flex flex-col p-4 md:p-6 relative z-20 min-h-[300px] overflow-y-auto">

        {activeAIs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center flex flex-col items-center max-w-md">
              <img src="/pixel-office.png" alt="BEP Virtual Office" className="w-96 h-96 object-contain mb-4" />
              <p className="text-gray-400 font-medium text-sm">暂无参与的智能体，等待 Chief 分派...</p>
              <p className="text-gray-300 text-xs mt-1">在上方输入框中提交任务，Chief 将自动调度 AI 团队</p>
            </div>
          </div>
        ) : (() => {
          // Group nodes by depth for Kanban columns
          const depthMap = new Map<number, typeof activeNodes>();
          activeNodes.forEach(n => {
            const list = depthMap.get(n.depth) || [];
            list.push(n);
            depthMap.set(n.depth, list);
          });
          const maxDepth = Math.max(...Array.from(depthMap.keys()));
          const columns: { depth: number; label: string; nodes: typeof activeNodes }[] = [
            { depth: 0, label: '编排', nodes: [{ agent: 'Chief', instruction: `分析意图 → 分派 ${activeNodes.length} 个任务`, status: status === 'completed' || status === 'dispatching' ? 'done' : 'working', taskId: '', depth: 0, summary: `参与: ${activeNodes.map(n => n.agent).join(', ')}` }] },
          ];
          for (let d = 1; d <= maxDepth; d++) {
            const PHASE_LABEL_MAP: Record<number, string> = { 1: 'Phase 1 · 信息准备', 2: 'Phase 2 · 核心工作', 3: 'Phase 3 · 整合分发' };
            columns.push({ depth: d, label: PHASE_LABEL_MAP[d] || `Phase ${d}`, nodes: depthMap.get(d) || [] });
          }

          const AGENT_ROLES: Record<string, string> = {};
          subAIs.forEach(ai => { AGENT_ROLES[ai.id] = ai.desc; });

          return (
            <div className="flex gap-4 md:gap-6 flex-1 min-h-0 items-start overflow-x-auto pb-4">
              {columns.map((col, colIdx) => (
                <div key={col.depth} className="flex items-start gap-0 shrink-0">
                  {/* Column */}
                  <div className="flex flex-col w-[200px] md:w-[240px]">
                    {/* Column header */}
                    <div className={`text-center mb-3 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      col.depth === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {col.label}
                    </div>

                    {/* Cards */}
                    <div className="space-y-3">
                      {col.nodes.map((node) => {
                        const ai = subAIs.find(a => a.id === node.agent);
                        const isDone = node.status === 'done';
                        const isFailed = node.status === 'failed';
                        const isWorking = node.status === 'working';
                        const isAwaitingApproval = node.status === 'awaiting_approval';
                        const isChief = node.agent === 'Chief';

                        return (
                          <div
                            key={node.agent}
                            onClick={() => {
                              if ((isDone || isAwaitingApproval) && node.taskId && !isChief) {
                                openCopilot(ai?.name || node.agent, node.taskId);
                              }
                            }}
                            className={`rounded-xl border-2 overflow-hidden transition-all duration-300 group relative ${
                              isChief ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-300 shadow-indigo-100/50 shadow-md' :
                              isFailed ? 'bg-red-50/50 border-red-300' :
                              isAwaitingApproval ? 'bg-amber-50/40 border-amber-400 shadow-amber-100/50 shadow-md' :
                              isDone ? 'bg-white border-emerald-400 cursor-pointer hover:shadow-emerald-200/60 hover:shadow-lg hover:-translate-y-0.5' :
                              isWorking ? 'bg-white border-indigo-300 animate-pulse' :
                              'bg-gray-50 border-gray-200 border-dashed'
                            }`}
                          >
                            {/* Card Header */}
                            <div className={`px-3 py-2 flex items-center gap-2 border-b ${
                              isChief ? 'border-emerald-100 bg-emerald-50/50' :
                              isAwaitingApproval ? 'border-amber-100 bg-amber-50/50' :
                              isDone ? 'border-emerald-50' :
                              isFailed ? 'border-red-100' :
                              'border-gray-100'
                            }`}>
                              {isChief ? (
                                <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-[9px] font-black shrink-0">C</div>
                              ) : ai?.image ? (
                                <img src={ai.image} alt={node.agent} className="w-6 h-6 rounded-lg object-contain bg-white border border-gray-100" style={{ imageRendering: 'pixelated' }} />
                              ) : (
                                <div className="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center text-[9px] font-black text-gray-600 shrink-0">{node.agent[0]}</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-gray-800 truncate">
                                  {node.agent}
                                  {node.hasAttachments && <span className="ml-1 text-[9px] text-blue-400" title="此任务关联附件">📎</span>}
                                </p>
                              </div>
                              {isDone && <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] shrink-0">✓</div>}
                              {isFailed && <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] shrink-0">✗</div>}
                              {isWorking && <Activity className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />}
                              {isAwaitingApproval && <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-[9px] shrink-0">!</div>}
                            </div>

                            {/* Card Body: instruction */}
                            <div className="px-3 py-2">
                              <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">{node.instruction}</p>
                            </div>

                            {/* Card Footer: summary or status */}
                            {isAwaitingApproval ? (
                              <div className="px-3 py-2 border-t border-amber-100 bg-amber-50/50">
                                <p className="text-[10px] text-amber-700 font-bold mb-2">🟡 等待人工审批确认</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (node.taskId) openCopilot(ai?.name || node.agent, node.taskId);
                                    }}
                                    className="flex-1 px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700 hover:bg-amber-50 transition-colors"
                                  >
                                    👁 查看 / 编辑
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (node.taskId) handleApproveTask(node.taskId, node.agent);
                                    }}
                                    className="flex-1 px-2 py-1.5 bg-emerald-500 border border-emerald-600 rounded-lg text-[10px] font-bold text-white hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/20"
                                  >
                                    ✅ 批准通过
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={`px-3 py-1.5 text-[10px] font-medium border-t ${
                                isDone ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' :
                                isFailed ? 'bg-red-50/50 border-red-100 text-red-600' :
                                isWorking ? 'bg-emerald-50/50 border-emerald-100 text-emerald-600' :
                                'bg-gray-50 border-gray-100 text-gray-400'
                              }`}>
                                {isDone && node.summary ? (
                                  <p className="truncate">{node.summary}</p>
                                ) : isDone ? (
                                  <p>✅ 已完成</p>
                                ) : isFailed ? (
                                  <div className="flex items-center justify-between">
                                    <p>❌ 执行失败</p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (node.taskId) handleRetryTask(node.taskId, node.agent);
                                      }}
                                      className="px-2 py-0.5 bg-red-100 text-red-600 rounded shadow-sm text-[9px] font-bold hover:bg-red-200 transition-colors"
                                    >重试</button>
                                  </div>
                                ) : isWorking ? (
                                  <p>🔄 执行中...</p>
                                ) : (
                                  <p>⏳ 等待执行</p>
                                )}
                              </div>
                            )}

                            {/* Hover overlay for Copilot */}
                            {isDone && !isChief && (
                              <div className="absolute inset-0 bg-indigo-900/80 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white z-10 rounded-xl">
                                <MessageSquare className="w-5 h-5 mb-1 text-violet-300" />
                                <span className="text-[10px] font-bold">进入 Copilot</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Arrow between columns */}
                  {colIdx < columns.length - 1 && (
                    <div className="flex flex-col justify-center self-stretch px-1 md:px-2 shrink-0">
                      {col.nodes.map((_, rowIdx) => {
                        const nextCol = columns[colIdx + 1];
                        const hasTarget = nextCol && (rowIdx === col.nodes.length - 1 || rowIdx < nextCol.nodes.length);
                        return (
                          <div key={rowIdx} className="flex items-center h-full flex-1">
                            {hasTarget && (
                              <div className="flex items-center">
                                <div className="w-6 md:w-10 h-[2px] bg-gradient-to-r from-indigo-300 to-indigo-400 relative">
                                  {status === 'dispatching' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                      <div className="w-2 h-full bg-emerald-500 rounded-full animate-pulse" style={{ animation: 'flowRight 1s linear infinite' }} />
                                    </div>
                                  )}
                                </div>
                                <ChevronRight className="w-3 h-3 text-emerald-400 -ml-1" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 右侧闲置区 (Idle Agents) */}
      <div className="hidden md:flex w-[520px] bg-white/80 backdrop-blur-xl border-l border-gray-200/80 flex-col p-6 z-20 shadow-sm shrink-0">
        <h2 className="text-base font-black text-gray-600 text-center mb-4">闲置 AI</h2>
        
        <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200">
          {/* 通用能力 AI */}
          {idleAIs.filter(ai => ai.category !== 'pingfang').length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="h-px flex-1 bg-gray-200"></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">通用能力</span>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mb-5">
                {idleAIs.filter(ai => ai.category !== 'pingfang').map((ai) => (
                  <div key={ai.id} className="w-[140px] flex flex-col items-center transition-all cursor-default hover:scale-105 relative">
                    <div className="absolute top-1 right-1 z-30">
                      <Tooltip title={ai.desc} placement="top">
                        <div className="p-1 cursor-pointer hover:bg-gray-100 rounded-full transition-colors bg-white/80">
                          <Info className="w-4 h-4 text-gray-500 hover:text-emerald-600" />
                        </div>
                      </Tooltip>
                    </div>
                    <div className="w-full bg-white rounded-xl border-2 border-gray-200 overflow-hidden flex flex-col shadow-sm">
                      <div className="h-[120px] bg-white flex items-center justify-center p-2 relative">
                        <img src={ai.image} alt={ai.name} className="max-h-[90%] max-w-[90%] object-contain filter drop-shadow-sm scale-125 pt-2" style={{ imageRendering: 'pixelated' }} />
                      </div>
                      <div className="pb-3 text-center bg-white border-t border-gray-50 pt-2 px-1">
                        <h4 className="font-extrabold text-[12px] text-gray-500 leading-tight">{ai.name.split(',')[0]}</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{ai.name.split(',')[1]?.trim() || ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 平方专业能力 AI — 隐藏显示，功能仍可通过 Chief 调度 */}
        </div>
      </div>

      

      {/* Copilot Mode Modal */}
      <Modal
        title={
          <div className="flex items-center text-lg font-black text-gray-800">
            <MessageSquare className="w-5 h-5 mr-2 text-emerald-600" /> 
            {copilotNode?.agent} Copilot 共创空间
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
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">产物预览 (Live Preview)</span>
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
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">反馈与微调 (Agent Chat)</span>
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
                        你好，我是 {copilotNode?.agent.split(',')[0]}。我已经完成了初步的任务。在左侧您可以预览最终的产物，如果有任何需要修改的地方，请直接告诉我！
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
                      placeholder="告诉 AI 哪里需要修改..."
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
            <span className="ml-3 text-gray-500 font-bold">加载任务数据中...</span>
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