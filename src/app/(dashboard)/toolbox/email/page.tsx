'use client';

import React, { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import {
  Mail, Inbox, Send, RefreshCw, Sparkles, User, Paperclip,
  ChevronRight, ArrowLeft, Database, FileText, X, Clock, CheckCircle, AlertCircle,
  Zap
} from 'lucide-react';
import { KbFileSelector } from '@/components/shared/KbFileSelector';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────
interface EmailItem {
  uid: number;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody: string;
  hasAttachments: boolean;
}

interface AccountInfo {
  email: string;
  configured: boolean;
  provider: string;
}

interface KbFile {
  id: string;
  title: string;
}

// ── Helpers ────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string) {
  const parts = name.replace(/<[^>]+>/g, '').trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

const AVATAR_COLORS = [
  'from-emerald-400 to-teal-500',
  'from-violet-400 to-purple-500',
  'from-blue-400 to-indigo-500',
  'from-teal-400 to-emerald-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-sky-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Main Component ─────────────────────────────────────────────────
export default function AIEmailPage() {
  // Account
  const [account, setAccount] = useState<AccountInfo | null>(null);

  // Inbox
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

  // Compose
  const [composeForm, setComposeForm] = useState({ to: '', cc: '', subject: '', prompt: '' });
  const [kbFiles, setKbFiles] = useState<KbFile[]>([]);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [sending, setSending] = useState(false);
  
  // Signature & Attachments
  const [globalSignature, setGlobalSignature] = useState('');
  const [attachments, setAttachments] = useState<{ filename: string; content: string; contentType: string }[]>([]);

  // View mode: 'inbox' | 'compose' | 'read'
  const [view, setView] = useState<'inbox' | 'compose' | 'read'>('inbox');

  // ── Init ──
  useEffect(() => {
    fetch('/api/toolbox/email/account').then(r => r.json()).then(setAccount).catch(() => {});
    fetch('/api/toolbox/signature').then(r => r.json()).then(data => setGlobalSignature(data.signature || '')).catch(() => {});
    fetchInbox();
  }, []);

  const fetchInbox = async () => {
    setInboxLoading(true);
    try {
      const res = await fetch('/api/toolbox/email/inbox');
      const data = await res.json();
      if (Array.isArray(data)) setEmails(data);
      else if (data.error) message.error(data.error);
    } catch {
      message.error('Failed to fetch inbox');
    } finally {
      setInboxLoading(false);
    }
  };

  // ── Attachments ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        if (base64) {
          setAttachments(prev => [...prev, { filename: file.name, content: base64, contentType: file.type }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // ── Generate ──
  const handleGenerate = async () => {
    if (!composeForm.prompt.trim()) {
      message.warning('Please describe what email to compose');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/toolbox/email/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: composeForm.prompt,
          to: composeForm.to || undefined,
          replyToBody: selectedEmail?.body || undefined,
          kbFileIds: kbFiles.map(f => f.id),
        }),
      });
      const data = await res.json();
      if (data.error) {
        message.error(data.error);
      } else {
        setGeneratedSubject(data.subject || composeForm.subject || '');
        
        let newHtml = data.htmlBody || '';
        if (globalSignature) {
          newHtml += `<br><br>${globalSignature}`;
        }
        setGeneratedHtml(newHtml);
        
        if (data.subject && !composeForm.subject) {
          setComposeForm(prev => ({ ...prev, subject: data.subject }));
        }
        message.success('Email drafted successfully');
      }
    } catch {
      message.error('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Send ──
  const handleSend = async () => {
    if (!composeForm.to) { message.warning('Please enter a recipient'); return; }
    if (!generatedHtml && !composeForm.subject) { message.warning('Generate an email first'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/toolbox/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeForm.to,
          cc: composeForm.cc || undefined,
          subject: composeForm.subject || generatedSubject,
          htmlBody: generatedHtml,
          requestAttachments: attachments,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Email sent to ${composeForm.to}`);
        setComposeForm({ to: '', cc: '', subject: '', prompt: '' });
        setGeneratedHtml('');
        setGeneratedSubject('');
        setKbFiles([]);
        setAttachments([]);
        setView('inbox');
      } else {
        message.error(data.error || 'Send failed');
      }
    } catch {
      message.error('Send failed');
    } finally {
      setSending(false);
    }
  };

  // ── Reply ──
  const handleReply = (email: EmailItem) => {
    setComposeForm({
      to: email.fromAddress,
      cc: '',
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      prompt: '',
    });
    setSelectedEmail(email);
    setGeneratedHtml('');
    setGeneratedSubject('');
    setView('compose');
  };

  return (
    <div className="h-full flex flex-col bg-[#f8f9fc] overflow-hidden">
      {/* ── Top Bar: Account Info ── */}
      <div className="shrink-0 px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight">AI Email</h1>
              {account && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  {account.configured ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Connected: {account.email} ({account.provider})</>
                  ) : (
                    <><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Not configured</>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setView('compose'); setSelectedEmail(null); setComposeForm({ to: '', cc: '', subject: '', prompt: '' }); setGeneratedHtml(''); }}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:shadow-lg transition-all"
            >
              <Zap className="w-3.5 h-3.5" /> Compose with AI
            </button>
            <button
              onClick={fetchInbox}
              disabled={inboxLoading}
              className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${inboxLoading ? 'animate-spin' : ''}`} /> Sync
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-hidden">
        <div className="w-full h-full flex">

          {/* ── LEFT: Inbox List ── */}
          <div className={`${view === 'inbox' ? 'w-full md:w-[400px]' : 'hidden md:block md:w-[400px]'} border-r border-gray-100 bg-white flex flex-col shrink-0`}>
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Inbox className="w-3.5 h-3.5" /> Inbox
                {emails.length > 0 && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">{emails.length}</span>}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              {inboxLoading && emails.length === 0 ? (
                <div className="flex items-center justify-center h-48"><Spin /></div>
              ) : emails.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <div className="w-14 h-14 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                    <Inbox className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-400 mb-1">No emails</p>
                  <p className="text-xs text-gray-300">Click Sync to fetch your inbox</p>
                </div>
              ) : (
                emails.map(email => (
                  <button
                    key={email.uid}
                    onClick={() => { setSelectedEmail(email); setView('read'); }}
                    className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${selectedEmail?.uid === email.uid ? 'bg-emerald-50/40 border-l-2 border-l-emerald-400' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getAvatarColor(email.from)} flex items-center justify-center shrink-0 mt-0.5`}>
                        <span className="text-[10px] font-bold text-white">{getInitials(email.from)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-gray-800 truncate">{email.from.replace(/<[^>]+>/g, '').trim()}</span>
                          <span className="text-[10px] text-gray-300 shrink-0 ml-2">{timeAgo(email.date)}</span>
                        </div>
                        <p className="text-xs font-semibold text-gray-700 truncate mb-0.5">{email.subject}</p>
                        <p className="text-[11px] text-gray-400 truncate">{email.snippet}</p>
                      </div>
                      {email.hasAttachments && <Paperclip className="w-3 h-3 text-gray-300 shrink-0 mt-1" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── RIGHT: Read / Compose Panel ── */}
          <div className={`${view === 'inbox' ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-hidden bg-[#f8f9fc]`}>

            {/* ── Read View ── */}
            {view === 'read' && selectedEmail && (
              <div className="flex-1 overflow-y-auto p-6">
                <button onClick={() => { setView('inbox'); setSelectedEmail(null); }} className="md:hidden mb-4 text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to inbox
                </button>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-50">
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{selectedEmail.subject}</h2>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(selectedEmail.from)} flex items-center justify-center`}>
                          <span className="text-[11px] font-bold text-white">{getInitials(selectedEmail.from)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{selectedEmail.from.replace(/<[^>]+>/g, '').trim()}</p>
                          <p className="text-[10px] text-gray-400">{selectedEmail.fromAddress} · {new Date(selectedEmail.date).toLocaleString('en-GB')}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleReply(selectedEmail)}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:shadow-lg transition-all"
                      >
                        <Send className="w-3.5 h-3.5" /> Reply with AI
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    {selectedEmail.htmlBody ? (
                      <div className="pemerald pemerald-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody }} />
                    ) : (
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{selectedEmail.body}</pre>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Compose View ── */}
            {view === 'compose' && (
              <div className="flex-1 overflow-y-auto p-6">
                <button onClick={() => setView('inbox')} className="md:hidden mb-4 text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to inbox
                </button>
                <div className="space-y-4">
                  {/* Reply context */}
                  {selectedEmail && (
                    <div className="bg-amber-50/50 rounded-xl border border-amber-100 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> Replying to: {selectedEmail.subject}
                        </p>
                        <button onClick={() => setSelectedEmail(null)} className="text-amber-400 hover:text-amber-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <p className="text-[11px] text-amber-600 mt-1 line-clamp-2">{selectedEmail.snippet}</p>
                    </div>
                  )}

                  {/* To / CC / Subject */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      <div className="flex items-center px-5 py-3">
                        <span className="text-xs font-bold text-gray-400 w-16 shrink-0">To</span>
                        <input
                          value={composeForm.to}
                          onChange={e => setComposeForm(prev => ({ ...prev, to: e.target.value }))}
                          className="flex-1 text-sm text-gray-800 outline-none"
                          placeholder="recipient@example.com"
                        />
                      </div>
                      <div className="flex items-center px-5 py-3">
                        <span className="text-xs font-bold text-gray-400 w-16 shrink-0">CC</span>
                        <input
                          value={composeForm.cc}
                          onChange={e => setComposeForm(prev => ({ ...prev, cc: e.target.value }))}
                          className="flex-1 text-sm text-gray-800 outline-none"
                          placeholder="(optional)"
                        />
                      </div>
                      <div className="flex items-center px-5 py-3">
                        <span className="text-xs font-bold text-gray-400 w-16 shrink-0">Subject</span>
                        <input
                          value={composeForm.subject}
                          onChange={e => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                          className="flex-1 text-sm text-gray-800 outline-none"
                          placeholder="Auto-generated if blank"
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Prompt */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> AI Instructions
                      </h3>
                    </div>
                    <div className="p-5">
                      <textarea
                        value={composeForm.prompt}
                        onChange={e => setComposeForm(prev => ({ ...prev, prompt: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-emerald-300 resize-none"
                        rows={4}
                        placeholder='e.g. "Write a partnership introduction email to Oxford Brookes, highlighting our agent network in China and Southeast Asia"'
                      />
                    </div>
                  </div>

                  {/* KB Selector */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-gray-600">Knowledge Base</h3>
                        <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">BEP Core auto-injected</span>
                      </div>
                      <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 flex items-center gap-1">
                        <Database className="w-3 h-3" /> Select from KB
                      </button>
                    </div>
                    <div className="p-5">
                      {kbFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {kbFiles.map(f => (
                            <div key={f.id} className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-[11px]">
                              <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                              <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setKbFiles(kbFiles.filter(kf => kf.id !== f.id))} />
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400">
                        {kbFiles.length === 0 ? 'No specific documents selected — AI will search across all KB automatically.' : `${kbFiles.length} document(s) selected as additional context.`}
                      </p>
                    </div>
                  </div>

                  {/* Generate Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleGenerate}
                      disabled={!composeForm.prompt.trim() || generating}
                      className="px-10 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {generating ? <><Spin size="small" /> Generating draft...</> : <><Sparkles className="w-4 h-4" /> Generate Email Draft</>}
                    </button>
                  </div>

                  {/* Generated Preview */}
                  {generatedHtml && (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 bg-emerald-50/50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Generated Draft
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Regenerate
                          </button>
                          <button
                            onClick={handleSend}
                            disabled={sending || !composeForm.to}
                            className="text-[11px] font-medium text-white bg-emerald-600 px-3 py-1 rounded hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50"
                          >
                            {sending ? <Spin size="small" /> : <Send className="w-3 h-3" />} Send
                          </button>
                        </div>
                      </div>
                      {composeForm.subject && (
                        <div className="px-5 py-2 bg-gray-50 border-b border-gray-50 text-xs text-gray-500">
                          <strong>Subject:</strong> {composeForm.subject}
                        </div>
                      )}
                      <div className="p-5">
                        <ReactQuill theme="snow" value={generatedHtml} onChange={setGeneratedHtml} className="bg-white" />
                        
                        {/* Attachments Section */}
                        <div className="mt-4 border-t border-gray-100 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-bold text-gray-500 cursor-pointer flex items-center gap-1 hover:text-emerald-600">
                              <Paperclip className="w-3.5 h-3.5" /> Attach Files
                              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                            </label>
                          </div>
                          {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {attachments.map((att, i) => (
                                <div key={i} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-[11px] text-gray-600">
                                  <span className="truncate max-w-[150px]">{att.filename}</span>
                                  <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Empty state for desktop when nothing selected ── */}
            {view === 'inbox' && !selectedEmail && (
              <div className="hidden md:flex flex-1 items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <Mail className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-400 mb-1">Select an email to read</p>
                  <p className="text-xs text-gray-300">Or compose a new one with AI</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KB Selector Modal ── */}
      {kbSelectorOpen && (
        <KbFileSelector
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          initialSelected={kbFiles}
          onConfirm={(files) => { setKbFiles(files); setKbSelectorOpen(false); }}
        />
      )}
    </div>
  );
}
