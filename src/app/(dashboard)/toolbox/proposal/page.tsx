'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { marked } from 'marked';
import { Briefcase, Database, X, FileText, CheckCircle, Clock, Send, MessageSquare } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

const BUSINESS_MODELS = ['Fixed Retainer', 'Performance Partnership', 'Hybrid'];
const FOCUS_AREAS = ['Academics', 'Marketing', 'Pastoral Care', 'Full Management'];

export default function ProposalPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams?.get('jobId');
  const assetId = searchParams?.get('assetId');
  const autoStartedRef = useRef(false);

  const [proposalForm, setProposalForm] = useState({
    targetSchool: '',
    schoolProfile: '',
    businessModel: 'Fixed Retainer',
    focusAreas: [] as string[],
    additionalNotes: '',
    kbFiles: [] as KbFile[]
  });
  
  const [proposalResult, setProposalResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [logs, setLogs] = useState<{ message: string; step: string }[]>([]);
  const [copilotHistory, setCopilotHistory] = useState<{ role: 'user' | 'bot'; content: string }[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Mode A: assetId — load existing generated content, skip re-generation
  useEffect(() => {
    if (!assetId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    fetch(`/api/toolbox/assets?id=${assetId}`)
      .then(r => r.json())
      .then((asset) => {
        if (asset.error || !asset.payload) return;
        const payload = JSON.parse(asset.payload);
        if (payload.content) {
          setProposalResult(payload.content);
          if (payload.targetSchool) setProposalForm(prev => ({ ...prev, targetSchool: payload.targetSchool, businessModel: payload.businessModel || 'Fixed Retainer' }));
          setCopilotHistory([{ role: 'bot', content: `✅ Draft 1 loaded! You can now enter edit instructions in the Copilot panel.` }]);
        }
      })
      .catch(console.error);
  }, [assetId]);

  // Mode B: jobId — legacy flow (pre-fill form and auto-generate)
  useEffect(() => {
    if (!jobId || assetId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    fetch(`/api/toolbox/jobs?id=${jobId}`)
      .then(r => r.json())
      .then(async (job) => {
        if (job.error) return;
        const p = job.params || {};
        const filled = {
          targetSchool: p.targetSchool || '',
          schoolProfile: p.additionalNotes || '',
          businessModel: p.businessModel || 'Fixed Retainer',
          focusAreas: Array.isArray(p.focusAreas) ? p.focusAreas : [],
          additionalNotes: p.additionalNotes || '',
          kbFiles: [] as KbFile[],
        };
        setProposalForm(filled);
        // Kick off generation with Kelly's background injected
        setLoading(true);
        setLogs([]);
        const res = await fetch('/api/toolbox/proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...filled, background: job.background }),
        });
        if (!res.body) { setLoading(false); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false; let text = '';
        while (!done) {
          const { value, done: dr } = await reader.read();
          done = dr;
          if (value) {
            const lines = decoder.decode(value, { stream: true }).split('\n\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'log') setLogs(prev => [...prev, data.data]);
                else if (data.type === 'ai_chunk') { text += data.data; setProposalResult(text); }
                else if (data.type === 'done') {
                  setCopilotHistory([{ role: 'bot', content: `✅ Proposal Draft 1 generated! You can now enter edit instructions in the Copilot panel.` }]);
                }
              } catch { /* ignore */ }
            }
          }
        }
        setLoading(false);
      })
      .catch(console.error);
  }, [jobId]);

  const toggleFocusArea = (area: string) => {
    setProposalForm(prev => {
      const current = prev.focusAreas;
      if (current.includes(area)) {
        return { ...prev, focusAreas: current.filter(a => a !== area) };
      } else {
        return { ...prev, focusAreas: [...current, area] };
      }
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setProposalResult('');
    setLogs([]);
    try {
      const res = await fetch('/api/toolbox/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...proposalForm,
          kbFileIds: proposalForm.kbFiles.map(f => f.id)
        })
      });

      if (!res.body) throw new Error('No readable stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let aiText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'log') {
                  setLogs(prev => [...prev, { step: data.data.step, message: data.data.message }]);
                } else if (data.type === 'ai_chunk') {
                  aiText += data.data;
                  setProposalResult(aiText);
                } else if (data.type === 'error') {
                  alert(`Error: ${data.data.message}`);
                }
              } catch (e) { /* ignore parse errors */ }
            }
          }
        }
      }
    } catch {
      alert('Network error');
    }
    setLoading(false);
    setCopilotHistory([{ role: 'bot', content: `✅ Proposal Draft 1 complete!\n\nYou can enter edit instructions below, e.g.:\n- "Switch the model to Performance Partnership"\n- "Add a section about the Korean market"\n- "Include boarding enrolment data in Section 3"` }]);
  };

  const handleCopilot = async () => {
    if (!copilotInput.trim() || copilotLoading) return;
    const instruction = copilotInput.trim();
    setCopilotInput('');
    setCopilotHistory(p => [...p, { role: 'user', content: instruction }]);
    setCopilotLoading(true);
    try {
      const res = await fetch('/api/toolbox/proposal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentDocument: proposalResult, instruction, targetSchool: proposalForm.targetSchool, businessModel: proposalForm.businessModel })
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
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'reply') reply = data.data;
              else if (data.type === 'document') setProposalResult(data.data);
            } catch { /* ignore */ }
          }
        }
      }
      setCopilotHistory(p => [...p, { role: 'bot', content: reply || '✅ Proposal updated.' }]);
    } catch { setCopilotHistory(p => [...p, { role: 'bot', content: '❌ Network error, please try again.' }]); }
    setCopilotLoading(false);
  };

  if (proposalResult || loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-sm z-10">
          <div>
            <h2 className="text-lg font-black text-gray-900">{proposalForm.targetSchool} — Proposal</h2>
            <p className="text-xs text-gray-400">Model: {proposalForm.businessModel} | Focus: {proposalForm.focusAreas.join(', ') || 'General'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setProposalResult(''); setLogs([]); }} disabled={loading} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50">
              Regenerate
            </button>
            <button onClick={() => { navigator.clipboard.writeText(proposalResult); alert('Copied to clipboard'); }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 shadow-md">
              <FileText className="w-3.5 h-3.5" /> Copy Full Text
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 flex gap-6">
          
          {/* Left Panel: SSE Logs → Copilot Chat */}
          <div className="w-80 shrink-0">
            {!loading && proposalResult ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-[calc(100vh-130px)]">
                <div className="flex items-center gap-2 p-4 border-b border-gray-50">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-gray-800">Copilot Refinement</h3>
                  <span className="ml-auto text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">Draft 1 ✓</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {copilotHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
                        msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-50 border border-gray-100 text-gray-700 rounded-bl-sm'
                      }`}>{msg.content}</div>
                    </div>
                  ))}
                  {copilotLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl rounded-bl-sm"><Spin size="small" /></div>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-gray-50">
                  <div className="flex gap-2">
                    <input value={copilotInput} onChange={e => setCopilotInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCopilot()}
                      placeholder="Edit instruction (e.g. add Korean market analysis)..."
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    <button onClick={handleCopilot} disabled={copilotLoading || !copilotInput.trim()}
                      className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 shrink-0">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-0">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-50">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-gray-800">Pipeline Execution Log (SSE)</h3>
                </div>
                <div className="space-y-4">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="mt-0.5">
                        {log.message.includes('✅') ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-blue-500 animate-pulse" />}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400">{log.step}</div>
                        <div className="text-xs text-gray-700 mt-0.5">{log.message}</div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium pt-2">
                      <Spin size="small" /> Agent assembling...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>


          {/* Markdown Result */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-100 p-10 shadow-sm min-h-full">
              {proposalResult ? (
                <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: marked(proposalResult) as string }} />
              ) : (
                <div className="text-sm text-gray-400 text-center mt-20">Awaiting generation stream...</div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8 pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900">Proposal Generator</h1>
        <p className="text-sm text-gray-400 mt-1">Enter target school details. The system will auto-load BEP templates and company profile to generate a custom proposal draft.</p>
      </div>

      <div className="space-y-5">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">Target School</h3>
          </div>
          <div className="p-5 space-y-4">
            <input 
              value={proposalForm.targetSchool} 
              onChange={e => setProposalForm({ ...proposalForm, targetSchool: e.target.value })} 
              placeholder="School name (e.g. Queen's College) *" 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" 
            />
            <textarea 
              value={proposalForm.schoolProfile} 
              onChange={e => setProposalForm({ ...proposalForm, schoolProfile: e.target.value })} 
              placeholder="School context & challenges (e.g. 50 vacant beds, looking to expand in Asian markets but lacking local marketing team)" 
              rows={3} 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 resize-none" 
            />
          </div>
        </div>

        {/* Business Model & Focus */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">Business Model & Focus</h3>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-2">Partnership Model</p>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_MODELS.map(m => (
                  <button 
                    key={m} 
                    onClick={() => setProposalForm({ ...proposalForm, businessModel: m })} 
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${proposalForm.businessModel === m ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-2">Focus Areas (multi-select)</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map(f => (
                  <button 
                    key={f} 
                    onClick={() => toggleFocusArea(f)} 
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${proposalForm.focusAreas.includes(f) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Base */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-gray-600">Supplementary Knowledge Base</h3>
              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">BEP Core Docs auto-injected</span>
            </div>
            <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> Select from KB
            </button>
          </div>
          <div className="p-5">
            {proposalForm.kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {proposalForm.kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setProposalForm({ ...proposalForm, kbFiles: proposalForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                  </div>
                ))}
              </div>
            )}
            <textarea 
              value={proposalForm.additionalNotes} 
              onChange={e => setProposalForm({ ...proposalForm, additionalNotes: e.target.value })} 
              placeholder="Additional requirements, or paste historical email correspondence..." 
              rows={4} 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 resize-none" 
            />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button 
            onClick={handleGenerate} 
            disabled={!proposalForm.targetSchool || loading} 
            className="px-10 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-full shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <><Spin size="small" /> Gathering knowledge & generating...</> : <><Briefcase className="w-4 h-4" /> Generate Proposal Draft</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          initialSelected={proposalForm.kbFiles}
          onConfirm={(files) => { setProposalForm({ ...proposalForm, kbFiles: files }); setKbSelectorOpen(false); }}
        />
      )}
    </div>
  );
}
