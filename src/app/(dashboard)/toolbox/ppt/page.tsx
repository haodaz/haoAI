'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { Presentation, FileText, Send, Download, ChevronLeft, ChevronRight, Plus, XCircle, MessageSquare, Database, X, Wand2, ArrowRight } from 'lucide-react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { useToolbox } from '../layout';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

const THEMES = [
  { id: 'graphite', name: 'Modern Graphite', colors: ['#2D3436', '#DFE6E9', '#0984E3'] },
  { id: 'blue', name: 'Professional Blue', colors: ['#1E3A8A', '#3B82F6', '#DBEAFE'] },
  { id: 'emerald', name: 'Creative Emerald', colors: ['#065F46', '#10B981', '#D1FAE5'] },
  { id: 'light', name: 'Minimalist Light', colors: ['#64748B', '#94A3B8', '#F1F5F9'] },
];
const DENSITIES = [
  { id: 'comprehensive', name: 'Comprehensive', desc: 'Content-rich, ideal for detailed reports' },
  { id: 'standard', name: 'Standard', desc: 'Balanced text & visuals, suits most scenarios' },
  { id: 'concise', name: 'Concise', desc: 'Key points only, ideal for executive briefings' },
  { id: 'minimalist', name: 'Minimalist', desc: 'One image one message, ideal for talks' },
];

function PptView() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');
  const { pendingPptData, setPendingPptData } = useWorkspace();
  const { setSidebarCollapsed } = useToolbox();
  const initialPpt = pendingPptData;

  const [pptForm, setPptForm] = useState({ topic: initialPpt?.topic || '', slideCount: '~10 slides', theme: 'blue', density: 'standard', background: '', preferences: '', kbFiles: [] as KbFile[] });
  const [pptResult, setPptResult] = useState<{ slides: any[]; fileUrl: string } | null>(initialPpt ? { slides: initialPpt.slides, fileUrl: initialPpt.fileUrl } : null);
  const [pptLoading, setPptLoading] = useState(false);
  const [pptLogs, setPptLogs] = useState<{ step: string; message: string }[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [pptView, setPptView] = useState<'presentation' | 'outline'>('presentation');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [pptChatHistory, setPptChatHistory] = useState<{ role: 'user' | 'bot'; content: string }[]>(initialPpt ? [{ role: 'bot', content: `Loaded ${initialPpt.slides.length}-slide PPT from Edda. You can enter edit instructions on the left.` }] : []);
  const [pptChatInput, setPptChatInput] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);

  useEffect(() => {
    if (pptResult || pptLoading) setSidebarCollapsed(true);
  }, [pptResult, pptLoading, setSidebarCollapsed]);

  useEffect(() => {
    if (initialPpt && setPendingPptData) setPendingPptData(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (assetId) {
      fetch(`/api/toolbox/assets?id=${assetId}`)
        .then(r => r.json())
        .then(data => {
          if (data.error || data.type !== 'PPT') return;
          const payload = JSON.parse(data.payload);
          setPptResult({ slides: payload.slides || payload.rawSlides || [], fileUrl: payload.fileUrl });
          setPptForm(prev => ({ ...prev, topic: data.title }));
          setPptChatHistory([{ role: 'bot', content: `Loaded PPT from history: ${data.title}` }]);
        }).catch(console.error);
    }
  }, [assetId]);

  const handleGeneratePPT = async () => {
    setPptLoading(true); setPptResult(null); setPptLogs([]);
    try {
      const res = await fetch('/api/toolbox/ppt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pptForm, kbFileIds: pptForm.kbFiles.map(f => f.id) }) });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: dr } = await reader.read();
        done = dr;
        if (value) {
          const lines = decoder.decode(value, { stream: true }).split('\n\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'log') setPptLogs(p => [...p, data.data]);
              else if (data.type === 'result') setPptResult({ slides: data.data.slides, fileUrl: data.data.fileUrl });
              else if (data.type === 'error') alert(data.data.message || 'Generation failed');
            } catch { /* ignore */ }
          }
        }
      }
    } catch { alert('Network error'); }
    setPptLoading(false);
  };

  if (!pptResult && pptLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
            <h3 className="text-sm font-bold text-gray-800">SSE Pipeline — Generating PPT</h3>
          </div>
          <div className="space-y-4">
            {pptLogs.map((log, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-base">
                  {log.message.includes('✅') ? '✅' : '🔄'}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{log.step}</div>
                  <div className="text-xs text-gray-700 mt-0.5 leading-relaxed">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-50 text-xs text-gray-400">Slide content will auto-render to PPTX once generation is complete...</div>
        </div>
      </div>
    );
  }

  if (!pptResult) {
    return (
      <div className="max-w-3xl mx-auto p-8 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900">PPT Generator</h1>
          <p className="text-sm text-gray-400 mt-1">Fill parameters → AI generates outline → pptxgenjs renders physical file</p>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">Step 1: Basic Info</h3></div>
            <div className="p-5 space-y-3">
              <input value={pptForm.topic} onChange={e => setPptForm({ ...pptForm, topic: e.target.value })} placeholder="Presentation topic *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              <input value={pptForm.slideCount} onChange={e => setPptForm({ ...pptForm, slideCount: e.target.value })} placeholder="Slide count" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400" />
              <textarea value={pptForm.preferences} onChange={e => setPptForm({ ...pptForm, preferences: e.target.value })} placeholder="Preferences (tone, style, target audience...)" rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 resize-none" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">Step 2: Visual Style</h3></div>
            <div className="p-5 space-y-4">
              <p className="text-[11px] font-bold text-gray-500">Theme Colour</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {THEMES.map(t => (
                  <button key={t.id} onClick={() => setPptForm({ ...pptForm, theme: t.id })} className={`p-3 rounded-xl border-2 text-left transition-all ${pptForm.theme === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className="flex gap-1 mb-2">{t.colors.map((c, i) => <div key={i} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />)}</div>
                    <span className="text-[10px] font-bold text-gray-700">{t.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-bold text-gray-500 mt-4">Content Density</p>
              <div className="grid grid-cols-2 gap-3">
                {DENSITIES.map(d => (
                  <button key={d.id} onClick={() => setPptForm({ ...pptForm, density: d.id })} className={`p-3 rounded-xl border-2 text-left transition-all ${pptForm.density === d.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className="text-xs font-bold text-gray-700 block">{d.name}</span>
                    <span className="text-[10px] text-gray-400">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-600">Step 3: Background Material</h3>
              <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1"><Database className="w-3 h-3" /> Select from KB</button>
            </div>
            <div className="p-5">
              {pptForm.kbFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {pptForm.kbFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[11px]">
                      <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setPptForm({ ...pptForm, kbFiles: pptForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                    </div>
                  ))}
                </div>
              )}
              <textarea value={pptForm.background} onChange={e => setPptForm({ ...pptForm, background: e.target.value })} placeholder="Paste background material, meeting notes, project descriptions..." rows={6} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 resize-none" />
            </div>
          </div>
          <div className="flex justify-center pt-4">
            <button onClick={handleGeneratePPT} disabled={!pptForm.topic || pptLoading} className="px-10 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-full shadow-lg shadow-indigo-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
              {pptLoading ? <><Spin size="small" /> Generating...</> : <><Presentation className="w-4 h-4" /> Generate PPT</>}
            </button>
          </div>
        </div>
        {kbSelectorOpen && (
          <KbFileSelector isOpen={true} onClose={() => setKbSelectorOpen(false)} initialSelected={pptForm.kbFiles} onConfirm={(files) => { setPptForm({ ...pptForm, kbFiles: files }); setKbSelectorOpen(false); }} />
        )}
      </div>
    );
  }

  const slides = pptResult.slides;
  const slide = slides[currentSlide];
  const selectedElement = slide?.elements?.find((el: any) => el.id === selectedElementId);

  const updateElement = (elementId: string, updates: any) => {
    const newSlides = [...slides];
    const s = newSlides[currentSlide];
    s.elements = s.elements.map((el: any) => {
      if (el.id !== elementId) return el;
      const { style, ...rest } = updates;
      return { ...el, ...rest, style: style ? { ...el.style, ...style } : el.style };
    });
    setPptResult({ ...pptResult, slides: newSlides });
  };

  const updateStyle = (key: string, value: any) => {
    if (!selectedElementId) return;
    updateElement(selectedElementId, { style: { [key]: value } });
  };

  const handleCopilotSend = async () => {
    if (!pptChatInput.trim()) return;
    const msg = pptChatInput;
    setPptChatInput('');
    setPptChatHistory(prev => [...prev, { role: 'user', content: msg }]);
    setPptLoading(true);
    try {
      const res = await fetch('/api/toolbox/ppt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slides, instruction: msg }) });
      if (res.ok) {
        const data = await res.json();
        if (data.slides) setPptResult({ ...pptResult, slides: data.slides });
        setPptChatHistory(prev => [...prev, { role: 'bot', content: data.reply || 'Slides updated.' }]);
      } else {
        setPptChatHistory(prev => [...prev, { role: 'bot', content: 'Update failed, please try again.' }]);
      }
    } catch {
      setPptChatHistory(prev => [...prev, { role: 'bot', content: 'Network error.' }]);
    }
    setPptLoading(false);
  };

  const insertSlideAt = (idx: number) => {
    const ts = Date.now();
    const newSlide = {
      backgroundColor: '#ffffff',
      elements: [
        { id: `title-${ts}`, type: 'TEXT_BOX', content: 'New Slide Title', x: 10, y: 10, width: 80, height: 15, style: { fontSize: 2.4, fontWeight: 'bold', textAlign: 'left', color: '#000000', backgroundColor: 'transparent', padding: 1, borderRadius: 0 } },
        { id: `body-${ts}`, type: 'TEXT_BOX', content: 'Enter content here...', x: 10, y: 30, width: 80, height: 60, style: { fontSize: 1.1, fontWeight: 'normal', textAlign: 'left', color: '#333333', backgroundColor: 'transparent', padding: 1, borderRadius: 0 } },
      ],
    };
    const ns = [...slides];
    ns.splice(idx, 0, newSlide);
    setPptResult({ ...pptResult, slides: ns });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { setPptResult(null); setCurrentSlide(0); setPptChatHistory([]); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-sm font-black text-gray-900 hidden md:block">{pptForm.topic}</h2>
          {pptLoading && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
        </div>
        <div className="flex bg-gray-100 p-0.5 rounded-xl">
          <button onClick={() => setPptView('presentation')} className={`px-4 py-1 rounded-lg text-[11px] font-black transition-all ${pptView === 'presentation' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>Presentation</button>
          <button onClick={() => setPptView('outline')} className={`px-4 py-1 rounded-lg text-[11px] font-black transition-all ${pptView === 'outline' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>Outline</button>
        </div>
        <div className="flex gap-2">
          <a href={pptResult.fileUrl} download className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 hover:bg-blue-700 shadow-md"><Download className="w-3 h-3" /> Download PPT</a>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden md:flex w-[360px] shrink-0 bg-white border-r border-gray-100 flex-col">
          <div className="p-4 border-b border-gray-50"><h3 className="text-sm font-black text-gray-800">Edit Slides</h3></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {pptChatHistory.length === 0 && (
              <div className="text-center text-gray-300 text-xs mt-10">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Enter instructions to modify slides</p>
                <p className="mt-1 text-[10px]">e.g. &quot;Add a market analysis slide after slide 3&quot;</p>
              </div>
            )}
            {pptChatHistory.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'bot' && <div className="w-6 h-6 rounded-lg bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white text-[8px] font-bold">AI</div>}
                <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-700'}`}>{msg.content}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-white">
            <div className="relative">
              <textarea value={pptChatInput} onChange={e => setPptChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && handleCopilotSend()} placeholder="Enter instruction..." rows={2} className="w-full p-3 pr-10 bg-gray-50 border rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-indigo-500/20" />
              <button onClick={handleCopilotSend} className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Send className="w-3 h-3" /></button>
            </div>
            <p className="text-[9px] text-gray-300 mt-1 px-1">Cmd + Enter to send</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {pptView === 'presentation' ? (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex items-center justify-center p-4 md:p-10 bg-gray-50 overflow-hidden relative group">
                  <div style={{ backgroundColor: slide?.backgroundColor || '#fff', aspectRatio: '16 / 9' }} className="w-full max-w-[900px] shadow-2xl relative rounded-sm overflow-hidden border border-gray-100" onClick={() => setSelectedElementId(null)}>
                    {slide?.elements?.map((element: any) => {
                      const isShape = element.type === 'SHAPE_BOX';
                      const isSelected = selectedElementId === element.id;
                      return (
                        <div key={element.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedElementId(element.id); }}
                          style={{
                            position: 'absolute',
                            left: `${element.x}%`, top: `${element.y}%`,
                            width: `${element.width}%`, height: `${element.height}%`,
                            backgroundColor: element.style?.backgroundColor || (isShape ? '#1a2f5e' : 'transparent'),
                            borderRadius: element.style?.borderRadius ? `${element.style.borderRadius}px` : '0',
                            zIndex: isShape ? 0 : 1,
                            transition: 'all 0.1s ease-out',
                            // TEXT_BOX only
                            ...(!isShape ? {
                              color: element.style?.color || '#000',
                              fontSize: `clamp(0.35rem, ${(element.style?.fontSize || 1) * 0.9}vw, ${element.style?.fontSize || 1}rem)`,
                              fontWeight: element.style?.fontWeight || 'normal',
                              textAlign: element.style?.textAlign || 'left',
                              padding: `${(element.style?.padding || 0) * 0.4}rem`,
                              display: 'flex', alignItems: 'center',
                              justifyContent: element.style?.textAlign === 'center' ? 'center' : element.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
                              overflow: 'hidden',
                              lineHeight: 1.5,
                            } : {}),
                          }}
                          className={`cursor-pointer ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : isShape ? 'hover:brightness-110' : 'hover:ring-1 hover:ring-indigo-300'}`}
                        >
                          {!isShape && (
                            <div className="w-full h-full whitespace-pre-wrap leading-snug">{element.content}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur p-1 rounded-lg shadow border border-white opacity-0 group-hover:opacity-100 transition-all">
                    <span className="text-[8px] font-bold text-gray-400 px-1">BG</span>
                    <input type="color" value={slide?.backgroundColor || '#ffffff'} onChange={e => { const ns = [...slides]; ns[currentSlide].backgroundColor = e.target.value; setPptResult({ ...pptResult, slides: ns }); }} className="w-6 h-6 rounded-full cursor-pointer border border-gray-100 bg-transparent" />
                  </div>
                </div>
                <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-center gap-4 px-4 shrink-0">
                  <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="p-2 rounded-full bg-gray-50 text-gray-400 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-20"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs font-black text-gray-900">{currentSlide + 1} / {slides.length}</span>
                  <button onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))} disabled={currentSlide === slides.length - 1} className="p-2 rounded-full bg-gray-50 text-gray-400 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-20"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              {selectedElement && (
                <aside className="hidden md:flex w-[260px] bg-white border-l border-gray-100 flex-col shadow-lg shrink-0">
                  <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-black text-gray-900 text-xs">Element Editor</h3>
                    <button onClick={() => setSelectedElementId(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"><XCircle className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="border-b pb-3">
                      <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2"><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Layout</span></div>
                      <div className="px-3 grid grid-cols-2 gap-3">
                        {(['x', 'y', 'width', 'height'] as const).map(key => (
                          <div key={key} className="space-y-0.5">
                            <label className="text-[8px] font-bold text-gray-400 uppercase">{key} (%)</label>
                            <input type="number" value={selectedElement[key]} onChange={e => updateElement(selectedElementId!, { [key]: +e.target.value })} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none focus:border-indigo-500" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-b pb-3 pt-2">
                      <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2"><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Text</span></div>
                      <div className="px-3 space-y-3">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">Size (rem)</label>
                          <input type="number" step="0.1" value={selectedElement.style?.fontSize || 1} onChange={e => updateStyle('fontSize', +e.target.value)} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateStyle('fontWeight', selectedElement.style?.fontWeight === 'bold' ? 'normal' : 'bold')} className={`flex-1 p-2 rounded-lg border flex justify-center text-xs transition-all ${selectedElement.style?.fontWeight === 'bold' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-400'}`}>B</button>
                          <div className="flex bg-gray-100 p-0.5 rounded-lg flex-[2]">
                            {(['left', 'center', 'right'] as const).map(a => (
                              <button key={a} onClick={() => updateStyle('textAlign', a)} className={`flex-1 flex justify-center py-1.5 rounded-md text-[10px] transition-all ${selectedElement.style?.textAlign === a ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>{a === 'left' ? '◀' : a === 'center' ? '◆' : '▶'}</button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">Text Color</label>
                          <input type="color" value={selectedElement.style?.color || '#000000'} onChange={e => updateStyle('color', e.target.value)} className="w-full h-8 rounded-lg cursor-pointer border-none p-0.5 bg-gray-50" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-2">
                      <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2"><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Style</span></div>
                      <div className="px-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">Background</label>
                          <button onClick={() => updateStyle('backgroundColor', 'transparent')} className="text-[8px] font-black text-indigo-600 underline">Transparent</button>
                        </div>
                        <input type="color" value={selectedElement.style?.backgroundColor === 'transparent' ? '#ffffff' : (selectedElement.style?.backgroundColor || '#ffffff')} onChange={e => updateStyle('backgroundColor', e.target.value)} className="w-full h-8 rounded-lg cursor-pointer border-none p-0.5 bg-gray-50" />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-0.5">
                            <label className="text-[8px] font-bold text-gray-400 uppercase">Padding</label>
                            <input type="number" step="0.1" value={selectedElement.style?.padding || 0} onChange={e => updateStyle('padding', +e.target.value)} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none" />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[8px] font-bold text-gray-400 uppercase">Radius</label>
                            <input type="number" value={selectedElement.style?.borderRadius || 0} onChange={e => updateStyle('borderRadius', +e.target.value)} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/30">
              <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-10">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-50">
                  <h2 className="text-lg font-black text-gray-900">Content Outline</h2>
                  <button onClick={() => insertSlideAt(slides.length)} className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold shadow hover:bg-indigo-700"><Plus className="w-3 h-3" /> Append Slide</button>
                </div>
                <div className="space-y-3">
                  {slides.map((s: any, sIdx: number) => (
                    <React.Fragment key={s.elements?.[0]?.id || sIdx}>
                      <div className="flex justify-center -my-1 opacity-0 hover:opacity-100 transition-opacity relative z-10">
                        <button onClick={() => insertSlideAt(sIdx)} className="bg-indigo-600 text-white p-0.5 rounded-full shadow hover:scale-125 transition-transform"><Plus className="w-3 h-3" /></button>
                      </div>
                      <div draggable onDragStart={() => setDragIdx(sIdx)} onDragOver={e => e.preventDefault()}
                        onDrop={() => { if (dragIdx === null || dragIdx === sIdx) return; const ns = [...slides]; const [m] = ns.splice(dragIdx, 1); ns.splice(sIdx, 0, m); setPptResult({ ...pptResult, slides: ns }); setDragIdx(null); }}
                        className={`group relative p-5 bg-white border rounded-xl transition-all flex gap-4 ${dragIdx === sIdx ? 'opacity-30 border-dashed border-indigo-400' : 'border-gray-100 hover:border-indigo-400 hover:shadow-lg'}`}
                      >
                        <div className="flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing pt-1">
                          <div className="text-[9px] font-black text-gray-400 w-5 h-5 rounded-full border border-gray-100 flex items-center justify-center">{sIdx + 1}</div>
                          <span className="text-gray-200 text-[10px]">⋮⋮</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          {s.elements?.slice(0, 2).map((el: any, eIdx: number) => (
                            <textarea key={el.id} value={el.content}
                              onChange={e => { const ns = [...slides]; ns[sIdx].elements[eIdx] = { ...ns[sIdx].elements[eIdx], content: e.target.value }; setPptResult({ ...pptResult, slides: ns }); }}
                              className={`w-full p-3 bg-gray-50/50 border border-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/10 transition-all text-gray-800 resize-none ${eIdx === 0 ? 'font-bold text-sm h-12' : 'text-xs h-24 leading-relaxed'}`}
                              placeholder={eIdx === 0 ? 'Slide title...' : 'Enter content points...'}
                            />
                          ))}
                        </div>
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { const ns = [...slides]; ns.splice(sIdx, 1); setPptResult({ ...pptResult, slides: ns }); if (currentSlide >= ns.length) setCurrentSlide(Math.max(0, ns.length - 1)); }} className="p-1.5 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PptPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
      <PptView />
    </Suspense>
  );
}
