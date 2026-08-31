'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { Mail, UploadCloud, Link2, Send, ChevronLeft, Type, ChevronRight, AlertTriangle, Shield, ShieldCheck, ShieldAlert, AtSign, Loader2, Info, CheckCircle2, Zap, UserCheck, X, Paperclip, FileText } from 'lucide-react';
import VoiceInputButton from '@/components/ui/VoiceInputButton';
import { Tooltip } from 'antd';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { Database } from 'lucide-react';

interface AnalyzedTask {
  agent: string;
  instruction: string;
  complexity: 'high' | 'medium' | 'low';
  reason: string;
}

export default function NewTaskPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { setPendingDispatchTask, pendingNewTaskInput, setPendingNewTaskInput } = useWorkspace();

  // Step management
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 states
  const [inputMode, setInputMode] = useState<'text' | 'email'>('text');
  const [input, setInput] = useState('');

  // Auto-fill from group chat conversion
  useEffect(() => {
    if (pendingNewTaskInput) {
      setInput(pendingNewTaskInput);
      setInputMode('text');
      setPendingNewTaskInput(null);
    }
  }, [pendingNewTaskInput]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // Attachment states
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [emailSelectorOpen, setEmailSelectorOpen] = useState(false);

  const handleKbFileConfirm = (files: KbFile[]) => {
    const newAttachments = files.map(f => ({
      id: f.id,
      originalName: f.title,
      storagePath: '',
      storageType: 'kb',
      mimeType: f.fileType || 'unknown',
      size: f.fileSize || 0,
      extractedText: '', // Backend agent will fetch full content from DB
      summary: '[Knowledge Base File]',
      isKbFile: true
    }));
    setAttachments(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      return [...prev, ...newAttachments.filter(a => !existingIds.has(a.id))];
    });
  };

  // Handle attachment upload
  const handleAttachmentUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('files', f));
      const res = await fetch('/api/bristh/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.attachments) {
        setAttachments(prev => [...prev, ...data.attachments]);
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
    setUploading(false);
    if (attachInputRef.current) attachInputRef.current.value = '';
  };

  const removeAttachment = (attId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Step 2 states
  const [analyzing, setAnalyzing] = useState(false);
  const [autoDispatching, setAutoDispatching] = useState(false);
  const [contextId, setContextId] = useState<string | null>(null);
  const [analyzedTasks, setAnalyzedTasks] = useState<AnalyzedTask[]>([]);
  const [approvalSelections, setApprovalSelections] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  // User email state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailCheckDone, setEmailCheckDone] = useState(false);

  // Check user email on mount
  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        if (d.user?.email) {
          setUserEmail(d.user.email);
          setEmailInput(d.user.email);
        }
        setEmailCheckDone(true);
      })
      .catch(() => setEmailCheckDone(true));
  }, []);

  const hasApprovalSelected = Object.values(approvalSelections).some(v => v);

  const fetchEmails = async () => {
    setLoadingEmails(true);
    try {
      const res = await fetch('/api/crm/emails/list');
      const data = await res.json();
      setEmails(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoadingEmails(false);
  };

  useEffect(() => {
    if (emailSelectorOpen) {
      fetchEmails();
    }
  }, [emailSelectorOpen]);

  const handleEmailSelect = (emailItem: any) => {
    let content = '';
    try {
      const parsedMsgs = JSON.parse(emailItem.messages);
      content = parsedMsgs[0]?.content || '';
    } catch (e) {
      content = emailItem.messages;
    }
    
    const newAttachment = {
      id: `email-${emailItem.id}`,
      originalName: emailItem.summary || t('bristh.newTask.noSubject'),
      storagePath: '',
      storageType: 'crm',
      mimeType: 'email',
      size: content.length,
      extractedText: content,
      summary: `[CRM Email] From: ${emailItem.customer?.email || 'Unknown'}`,
      isEmail: true,
      emailId: emailItem.id
    };

    setAttachments(prev => {
      if (!prev.find(a => a.id === newAttachment.id)) {
        return [...prev, newAttachment];
      }
      return prev;
    });

    setEmailSelectorOpen(false);
  };

  // Legacy file upload removed — now using attachment system

  // Full-auto mode: skip Step 2, use legacy orchestrate flow
  const handleAutoDispatch = async () => {
    if (!input.trim()) return;
    setAutoDispatching(true);
    try {
      // Use the original single-step orchestrate (no approval)
      setPendingDispatchTask({ input, inputMode: 'text', attachments });
      router.push('/office');
    } catch (err: any) {
      alert(err.message || t('bristh.newTask.errDispatch'));
    }
    setAutoDispatching(false);
  };

  // Step 1 → Step 2: Analyze
  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setAnalyzing(true);

    try {
      const res = await fetch('/api/bristh/orchestrate/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'TEXT', rawContent: input, locale: i18n.language, attachments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      setContextId(data.contextId);
      setAnalyzedTasks(data.tasks || []);

      // Pre-select high complexity tasks for approval
      const initialSelections: Record<string, boolean> = {};
      (data.tasks || []).forEach((t: AnalyzedTask) => {
        initialSelections[t.agent] = t.complexity === 'high';
      });
      setApprovalSelections(initialSelections);

      setStep(2);
    } catch (err: any) {
      alert(err.message || t('bristh.newTask.errAnalysis'));
    }
    setAnalyzing(false);
  };

  // Save email to profile
  const handleSaveEmail = async () => {
    if (!emailInput.trim() || !emailInput.includes('@')) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      if (res.ok) {
        setUserEmail(emailInput.trim());
      }
    } catch {}
    setSavingEmail(false);
  };

  // Step 2 → Confirm & Dispatch
  const handleConfirm = async () => {
    if (!contextId) return;

    // If approval is selected but no email, block
    if (hasApprovalSelected && !userEmail) {
      alert(t('bristh.newTask.errBindEmail'));
      return;
    }

    setConfirming(true);
    try {
      const approvalConfig = Object.entries(approvalSelections)
        .filter(([_, v]) => v)
        .map(([agent]) => agent);

      const res = await fetch('/api/bristh/orchestrate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId, approvalConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirm failed');

      // Dispatch to office for execution
      setPendingDispatchTask({ input, inputMode: 'text', contextId, tasks: data.tasks, attachments });
      router.push('/office');
    } catch (err: any) {
      alert(err.message || t('bristh.newTask.errConfirm'));
    }
    setConfirming(false);
  };

  const toggleApproval = (agent: string) => {
    setApprovalSelections(prev => ({ ...prev, [agent]: !prev[agent] }));
  };

  const complexityConfig = {
    high: { label: t('bristh.newTask.highComplexity'), icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
    medium: { label: t('bristh.newTask.mediumComplexity'), icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    low: { label: t('bristh.newTask.lowComplexity'), icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f8f9fc] overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200/80 px-6 py-4 flex items-center shadow-sm shrink-0">
        <button 
          onClick={() => step === 2 ? setStep(1) : router.push('/office')}
          className="mr-4 p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-gray-800">{t('bristh.newTask.title')}</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            {step === 1 ? t('bristh.newTask.step1Desc') : t('bristh.newTask.step2Desc')}
          </p>
        </div>
        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${step === 1 ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30' : 'bg-blue-100 text-emerald-600'}`}>1</div>
          <div className={`w-6 h-[2px] ${step === 2 ? 'bg-blue-500' : 'bg-gray-200'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${step === 2 ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30' : 'bg-gray-200 text-gray-400'}`}>2</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 flex justify-center items-start">
        <div className="w-full max-w-3xl">

          {/* ========== STEP 1: Input ========== */}
          {step === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-fade-in-up">
              {/* Form Content */}
              <div className="min-h-[300px] flex flex-col space-y-8">
                {/* Text Area */}
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-3">{t('bristh.newTask.taskReq')}</h3>
                  <div className="relative">
                    <textarea
                      className="w-full h-52 p-5 pb-14 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-emerald-500 focus:outline-none resize-none shadow-inner"
                      placeholder={t('bristh.newTask.placeholder')}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <div className="absolute bottom-4 left-4">
                      <VoiceInputButton
                        onTranscript={(text) => setInput(prev => prev + text)}
                        lang={i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US'}
                      />
                    </div>
                    <div className="absolute bottom-4 right-4 text-xs text-gray-400 font-mono">
                      {t('bristh.newTask.charCount', { count: input.length })}
                    </div>
                  </div>
                </div>

                {/* Unified Add Context Toolbar */}
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-3">{t('bristh.newTask.addContext')}</h3>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => attachInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 px-5 py-3 border-2 border-gray-200 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-all"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Paperclip className="w-4 h-4 text-gray-400" />}
                      <span className="text-sm font-medium text-gray-600">{t('bristh.newTask.localFile')}</span>
                    </button>
                    <input
                      type="file"
                      ref={attachInputRef}
                      onChange={(e) => e.target.files && handleAttachmentUpload(e.target.files)}
                      className="hidden"
                      multiple
                      accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.json,.csv,.yaml,.yml"
                    />

                    <button
                      onClick={() => setKbSelectorOpen(true)}
                      className="flex items-center justify-center gap-2 px-5 py-3 border-2 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl transition-all"
                    >
                      <Database className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-medium text-indigo-600">{t('bristh.newTask.kbImport')}</span>
                    </button>

                    <button
                      onClick={() => setEmailSelectorOpen(true)}
                      className="flex items-center justify-center gap-2 px-5 py-3 border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 rounded-xl transition-all"
                    >
                      <Mail className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-600">{t('bristh.newTask.fromCrm')}</span>
                    </button>
                  </div>
                </div>

                {/* Uploaded Attachments List */}
                {attachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> {t('bristh.newTask.uploadedCount', { count: attachments.length })}
                    </p>
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg group hover:border-blue-200 transition-colors">
                        {att.isEmail ? (
                          <Mail className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{att.originalName}</p>
                          <p className="text-[10px] text-gray-400">
                            {formatFileSize(att.size)}
                            {att.isKbFile && ` · ${t('bristh.newTask.kbFile')}`}
                            {att.isEmail && ` · ${t('bristh.newTask.fromCrm')}`}
                            {!att.isKbFile && !att.isEmail && att.storageType === 'cloud' && ` · ${t('bristh.newTask.cloudFile')}`}
                            {att.pageCount && ` · ${t('bristh.newTask.pagesCount', { count: att.pageCount })}`}
                            {att.sheetNames?.length && ` · ${t('bristh.newTask.sheetsCount', { count: att.sheetNames.length })}`}
                          </p>
                        </div>
                        <Tooltip title={att.summary}>
                          <Info className="w-3.5 h-3.5 text-gray-300 hover:text-blue-500 cursor-help shrink-0" />
                        </Tooltip>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
                          className="p-1 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dispatch Mode Selection */}
              <div className="mt-8 flex gap-3">
                <button
                  onClick={handleAutoDispatch}
                  disabled={(!input.trim()) || analyzing || autoDispatching}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                >
                  {autoDispatching ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  {t('bristh.newTask.autoExec')}
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={(!input.trim()) || analyzing || autoDispatching}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4 mr-2" />
                  )}
                  {t('bristh.newTask.manualReview')} <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
              <p className="text-center text-[11px] text-gray-400 mt-2">
                {t('bristh.newTask.modeHint')}
              </p>
            </div>
          )}

          {/* ========== STEP 2: Review & Approval Config ========== */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Analysis Results */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-black text-gray-800">{t('bristh.newTask.analysisResults')}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{t('bristh.newTask.subTasksCount', { count: analyzedTasks.length })}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{t('bristh.newTask.highRec')}</span>
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{t('bristh.newTask.med')}</span>
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">{t('bristh.newTask.low')}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {analyzedTasks.map((task) => {
                    const cc = complexityConfig[task.complexity];
                    const isSelected = approvalSelections[task.agent] || false;
                    const ComplexityIcon = cc.icon;

                    return (
                      <div
                        key={task.agent}
                        className={`rounded-xl border-2 p-4 transition-all duration-200 ${
                          isSelected
                            ? 'border-blue-400 bg-blue-50/50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Toggle */}
                          <button
                            onClick={() => toggleApproval(task.agent)}
                            className={`mt-0.5 w-11 h-6 rounded-full transition-all duration-200 relative shrink-0 ${
                              isSelected ? 'bg-blue-500' : 'bg-gray-200'
                            }`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${
                              isSelected ? 'left-[22px]' : 'left-0.5'
                            }`} />
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-black text-gray-800">{task.agent}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cc.badge}`}>
                                <ComplexityIcon className="w-3 h-3" />
                                {cc.label}
                              </span>
                              {isSelected && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                                  {t('bristh.newTask.needsApproval')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed mb-1.5">{task.instruction}</p>
                            <Tooltip title={task.reason}>
                              <p className="text-[11px] text-gray-400 flex items-center gap-1 cursor-help">
                                <Info className="w-3 h-3" />
                                {task.reason}
                              </p>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Email Binding (only show when approval is selected) */}
              {hasApprovalSelected && (
                <div className={`rounded-2xl border-2 p-5 transition-all ${
                  userEmail ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-300 bg-amber-50/50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      userEmail ? 'bg-emerald-100' : 'bg-amber-100'
                    }`}>
                      {userEmail ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-sm font-bold ${userEmail ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {userEmail ? t('bristh.newTask.emailBound') : t('bristh.newTask.bindEmail')}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {userEmail
                          ? t('bristh.newTask.emailNotice', { email: userEmail })
                          : t('bristh.newTask.emailNoticeEmpty')}
                      </p>
                      {!userEmail && emailCheckDone && (
                        <div className="flex items-center gap-2 mt-3">
                          <div className="relative flex-1">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="email"
                              value={emailInput}
                              onChange={e => setEmailInput(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              placeholder="your@email.com"
                            />
                          </div>
                          <button
                            onClick={handleSaveEmail}
                            disabled={savingEmail || !emailInput.includes('@')}
                            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shrink-0"
                          >
                            {savingEmail ? '...' : t('bristh.newTask.bindBtn')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm Button */}
              <button
                onClick={handleConfirm}
                disabled={confirming || (hasApprovalSelected && !userEmail)}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-base"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('bristh.newTask.dispatching')}
                  </>
                ) : (
                  <>
                    {t('bristh.newTask.confirmDispatch')} <Send className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>
            </div>
          )}

        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .animate-fade-in-up {
          animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
      
      {kbSelectorOpen && (
        <KbFileSelector 
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          onConfirm={handleKbFileConfirm}
          initialSelected={attachments.filter(a => a.isKbFile).map(a => ({
            id: a.id,
            title: a.originalName,
            type: 'FILE',
            fileType: a.mimeType,
            fileSize: a.size
          }))}
        />
      )}

      {/* Email Selector Modal */}
      {emailSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{t('bristh.newTask.selectEmailTitle')}</h2>
              <button onClick={() => setEmailSelectorOpen(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50/30">
               {loadingEmails ? (
                  <div className="flex items-center justify-center h-40 space-x-2">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
               ) : emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <Mail className="w-8 h-8 mb-2 opacity-20" />
                    <span className="text-sm">{t('bristh.newTask.emptyInbox')}</span>
                  </div>
               ) : (
                  <div className="space-y-1 p-2">
                    {emails.map((email: any) => (
                      <div 
                        key={email.id} 
                        onClick={() => handleEmailSelect(email)}
                        className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all group"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Mail className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-gray-800 line-clamp-1 group-hover:text-blue-600 mb-1">
                            {email.summary || t('bristh.newTask.noSubject')}
                          </div>
                          <div className="text-xs text-gray-500 flex justify-between items-center">
                            <span className="truncate pr-4 flex-1">From: {email.customer?.email || 'Unknown'}</span>
                            <span className="shrink-0">{new Date(email.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
