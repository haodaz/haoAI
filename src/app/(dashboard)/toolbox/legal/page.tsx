'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { marked } from 'marked';
import { FileText, Database, X, CheckCircle, Clock, Scale, Send, MessageSquare } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import { useToolbox } from '../layout';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

const DOC_TYPES = ['NDA', 'MOU', 'Service Agreement', 'Partnership Contract', 'Employment Contract'];
const STYLES = ['Standard British', 'Bilingual (EN/CN)', 'Plain Language'];

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  NDA: 'Non-Disclosure Agreement — Governs mutual confidentiality obligations and breach remedies',
  MOU: 'Memorandum of Understanding — Non-binding cooperation framework',
  'Service Agreement': 'Service Agreement — Defines service scope, fees and delivery terms',
  'Partnership Contract': 'Partnership Contract — Profit sharing, exit provisions and governance',
  'Employment Contract': 'Employment Contract — Role, compensation and restrictive covenants',
};

export default function LegalPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams?.get('jobId');
  const assetId = searchParams?.get('assetId');
  const autoStartedRef = useRef(false);
  const { setSidebarCollapsed } = useToolbox();

  const [form, setForm] = useState({
    docType: 'NDA', partyA: '', partyB: '',
    keyTerms: '', background: '', templateStyle: 'Standard British',
    kbFiles: [] as KbFile[]
  });
  
  const [result, setResult] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [logs, setLogs] = useState<{ step: string; message: string }[]>([]);
  const [copilotHistory, setCopilotHistory] = useState<{ role: 'user' | 'bot'; content: string }[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);

  useEffect(() => {
    if (result || loading) setSidebarCollapsed(true);
  }, [result, loading, setSidebarCollapsed]);

  // Mode A: assetId — load existing generated content into Copilot
  useEffect(() => {
    if (!assetId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    fetch(`/api/toolbox/assets?id=${assetId}`)
      .then(r => r.json())
      .then((asset) => {
        if (asset.error || !asset.payload) return;
        const payload = JSON.parse(asset.payload);
        if (payload.content) {
          setResult(payload.content);
          setEditorHtml(marked(payload.content) as string);
          if (payload.docType) setForm(prev => ({ ...prev, docType: payload.docType, partyA: payload.partyA || '', partyB: payload.partyB || '', templateStyle: payload.templateStyle || 'Standard British' }));
          setCopilotHistory([{ role: 'bot', content: `✅ Loaded ${payload.docType || 'Legal Document'} Draft 1! You can enter edit instructions in the Copilot panel.` }]);
        }
      })
      .catch(console.error);
  }, [assetId]);

  // Mode B: jobId — legacy flow
  useEffect(() => {
    if (!jobId || assetId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    fetch(`/api/toolbox/jobs?id=${jobId}`)
      .then(r => r.json())
      .then(async (job) => {
        if (job.error) return;
        const p = job.params || {};
        const filled = {
          docType: p.docType || 'NDA',
          partyA: p.partyA || '',
          partyB: p.partyB || '',
          keyTerms: p.keyTerms || '',
          background: '',
          templateStyle: p.templateStyle || 'Standard British',
          kbFiles: [] as KbFile[],
        };
        setForm(filled);
        setLoading(true);
        setLogs([]);
        const res = await fetch('/api/toolbox/legal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...filled, background: job.background }),
        });
        if (!res.body) { setLoading(false); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false; let textBuffer = '';
        while (!done) {
          const { value, done: dr } = await reader.read();
          done = dr;
          if (value) {
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'log') setLogs(prev => [...prev, data.data]);
                else if (data.type === 'ai_chunk') { textBuffer += data.data; setResult(textBuffer); }
                else if (data.type === 'done') {
                  setEditorHtml(marked(textBuffer) as string);
                  setCopilotHistory([{ role: 'bot', content: `✅ Legal document (Draft 1) generated! You can enter edit instructions in the Copilot panel.` }]);
                }
              } catch { /* ignore */ }
            }
          }
        }
        setLoading(false);
      })
      .catch(console.error);
  }, [jobId]);

  const handleGenerate = async () => {
    setLoading(true);
    setResult('');
    setEditorHtml('');
    setLogs([]);
    let textBuffer = '';
    try {
      const res = await fetch('/api/toolbox/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, kbFileIds: form.kbFiles.map(f => f.id) })
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'log') {
                  setLogs(prev => [...prev, { step: data.data.step, message: data.data.message }]);
                } else if (data.type === 'ai_chunk') {
                  textBuffer += data.data;
                  setResult(textBuffer);
                } else if (data.type === 'error') { alert(`Error: ${data.data.message}`); }
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch { alert('Network error'); }
    setResult(textBuffer);
    setEditorHtml(marked(textBuffer) as string);
    setLoading(false);
    setCopilotHistory([{ role: 'bot', content: `✅ Legal document (Draft 1) complete!\n\nYou can enter edit instructions in the Copilot below, e.g.:\n- "Change Party A name to ABC Ltd"\n- "Set the term to 5 years"\n- "Add a data privacy clause"` }]);
  };

  const handleCopilot = async () => {
    if (!copilotInput.trim() || copilotLoading) return;
    const instruction = copilotInput.trim();
    setCopilotInput('');
    setCopilotHistory(p => [...p, { role: 'user', content: instruction }]);
    setCopilotLoading(true);
    try {
      const res = await fetch('/api/toolbox/legal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentDocument: result, instruction, docType: form.docType, templateStyle: form.templateStyle })
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let reply = '';
      while (!done) {
        const { value, done: dr } = await reader.read();
        done = dr;
        if (value) {
          const lines = decoder.decode(value, { stream: true }).split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'reply') reply = data.data;
                else if (data.type === 'document') {
                  setResult(data.data);
                  setEditorHtml(marked(data.data) as string);
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
      setCopilotHistory(p => [...p, { role: 'bot', content: reply || '✅ Document updated.' }]);
    } catch { setCopilotHistory(p => [...p, { role: 'bot', content: '❌ Network error, please try again.' }]); }
    setCopilotLoading(false);
  };

  if (result || loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              <Scale className="w-5 h-5 inline mr-2 text-violet-500 mb-0.5" />
              {form.docType} — Generating
            </h2>
            <p className="text-xs text-gray-400">Party A: {form.partyA} | Party B: {form.partyB || 'TBC'} | Style: {form.templateStyle}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setResult(''); setEditorHtml(''); setLogs([]); }} disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50">
              Regenerate
            </button>
            <button onClick={() => { navigator.clipboard.writeText(result); alert('Copied to clipboard'); }}
              className="px-5 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-violet-700 shadow-md">
              <FileText className="w-3.5 h-3.5" /> Copy Raw Markdown
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 flex gap-5 items-start">
          <div className="w-[360px] shrink-0">
            {!loading && result ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-[calc(100vh-130px)]">
                <div className="flex items-center gap-2 p-4 border-b border-gray-50">
                  <MessageSquare className="w-5 h-5 text-violet-500" />
                  <h3 className="text-base font-bold text-gray-800">Copilot Refinement</h3>
                  <span className="ml-auto text-xs bg-violet-50 text-violet-600 px-2 py-1 rounded font-bold">Draft 1 ✓</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {copilotHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 whitespace-pre-wrap'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {copilotLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 p-2">
                      <Spin size="small" /> AI is revising...
                    </div>
                  )}
                </div>
                <div className="p-3 border-t bg-white">
                  <div className="relative">
                    <textarea value={copilotInput} onChange={e => setCopilotInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && handleCopilot()}
                      placeholder="Enter edit instruction..." rows={3} className="w-full p-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-violet-500/20" />
                    <button onClick={handleCopilot} className="absolute right-3 bottom-3 p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 px-1">Cmd + Enter to send</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-gray-800">Pipeline Execution Log (SSE)</h3>
                </div>
                <div className="space-y-4">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="mt-0.5">
                        {log.message.includes('✅') ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-violet-500 animate-pulse" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-400">{log.step}</div>
                        <div className="text-sm text-gray-700 mt-0.5 leading-relaxed">{log.message}</div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-sm text-violet-500 font-medium pt-2">
                      <Spin size="small" /> Assembling document...
                    </div>
                  )}
                </div>
                <div className="mt-5 pt-4 border-t border-gray-50">
                  <div className="text-xs text-gray-400 leading-relaxed">
                    🔒 Governing law, confidentiality, breach remedies and other standard clauses are <strong>hardcoded</strong> and not AI-generated.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 bg-gray-100 overflow-y-auto max-h-[calc(100vh-130px)] flex flex-col items-center">
            {loading ? (
              <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] p-12 md:p-16 shrink-0 rounded-sm my-10">
                <div className="prose prose-slate max-w-none text-gray-800 prose-headings:font-black prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-a:text-blue-600 prose-li:my-1"
                  dangerouslySetInnerHTML={{ __html: marked(result) as string }} />
              </div>
            ) : editorHtml ? (
              <div className="a4-editor-wrapper w-full flex flex-col items-center relative pb-20">
                <ReactQuill theme="snow" value={editorHtml} onChange={setEditorHtml} />
                <style>{`
                  .a4-editor-wrapper .quill { width: 100%; display: flex; flex-direction: column; align-items: center; }
                  .a4-editor-wrapper .ql-toolbar.ql-snow { width: 100%; border: none; border-bottom: 1px solid #e5e7eb; padding: 12px; position: sticky; top: 0; z-index: 50; background: white; display: flex; justify-content: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
                  .a4-editor-wrapper .ql-container.ql-snow { border: none; background: white; width: 100%; max-width: 210mm; min-height: 297mm; padding: 60px; margin-top: 40px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); border-radius: 4px; font-size: 15px; font-family: inherit; }
                  .a4-editor-wrapper .ql-editor { padding: 0; line-height: 1.8; color: #374151; }
                  .a4-editor-wrapper .ql-editor h1 { font-size: 1.875rem; font-weight: 900; margin-bottom: 1rem; color: #111827; }
                  .a4-editor-wrapper .ql-editor h2 { font-size: 1.5rem; font-weight: 800; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #111827; }
                  .a4-editor-wrapper .ql-editor h3 { font-size: 1.25rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #111827; }
                `}</style>
              </div>
            ) : (
              <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] p-12 md:p-16 shrink-0 rounded-sm my-10 flex flex-col items-center justify-center">
                <div className="animate-pulse w-16 h-16 bg-gray-50 rounded-full mb-4 flex items-center justify-center text-2xl">⚖️</div>
                <div className="text-sm text-gray-400">Awaiting document stream...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8 pb-20">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Scale className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Legal Document Generator</h1>
        </div>
        <p className="text-sm text-gray-400 ml-12">AI generates core business clauses + Governing law and other protective clauses are hardcoded from approved templates</p>
      </div>

      <div className="space-y-5">
        {/* Doc Type */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Document Type</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map(t => (
                <button key={t} onClick={() => setForm({ ...form, docType: t })}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${form.docType === t ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
            {form.docType && (
              <p className="text-[11px] text-gray-500 bg-violet-50/60 px-3 py-1.5 rounded-lg border border-violet-100">
                {DOC_TYPE_DESCRIPTIONS[form.docType]}
              </p>
            )}
          </div>
        </div>

        {/* Parties */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Parties</h3>
          </div>
          <div className="p-5 space-y-3">
            <input value={form.partyA} onChange={e => setForm({ ...form, partyA: e.target.value })}
              placeholder="Party A *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50" />
            <input value={form.partyB} onChange={e => setForm({ ...form, partyB: e.target.value })}
              placeholder="Party B" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50" />
          </div>
        </div>

        {/* Key Terms */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Key Terms</h3>
          </div>
          <div className="p-5">
            <textarea value={form.keyTerms} onChange={e => setForm({ ...form, keyTerms: e.target.value })}
              placeholder="Key business terms (e.g. 60:40 revenue split, 3-year term, £3,000/month service fee)" rows={4}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        {/* Style */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Template Style</h3>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              {STYLES.map(s => (
                <button key={s} onClick={() => setForm({ ...form, templateStyle: s })}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${form.templateStyle === s ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Background */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Background (Optional)</h3>
            <button onClick={() => setKbSelectorOpen(true)}
              className="text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded hover:bg-violet-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> Select from KB
            </button>
          </div>
          <div className="p-5">
            {form.kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {form.kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setForm({ ...form, kbFiles: form.kbFiles.filter(kf => kf.id !== f.id) })} />
                  </div>
                ))}
              </div>
            )}
            <textarea value={form.background} onChange={e => setForm({ ...form, background: e.target.value })}
              placeholder="Supplementary business context, negotiation points, historical correspondence..." rows={4}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button onClick={handleGenerate} disabled={!form.partyA || loading}
            className="px-10 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-full shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
            {loading ? <><Spin size="small" /> Generating step by step...</> : <><Scale className="w-4 h-4" /> Generate Document</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector isOpen onClose={() => setKbSelectorOpen(false)}
          initialSelected={form.kbFiles}
          onConfirm={(files) => { setForm({ ...form, kbFiles: files }); setKbSelectorOpen(false); }} />
      )}
    </div>
  );
}
