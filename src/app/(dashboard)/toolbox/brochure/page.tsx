'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { BookOpen, FileText, Send, Database, X, Loader2, Wand2, MessageSquare, ChevronLeft, ChevronRight, Edit3, Download, ImagePlus, UserCircle } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { useToolbox } from '../layout';
import VoiceTextarea from '@/components/ui/VoiceTextarea';

interface BrochurePage { id: string; label: string; html: string; }
interface BrochureResult { title: string; pages: BrochurePage[]; }

const FORMAT_OPTIONS = [
  { id: 'single', name: 'Single Page', desc: 'A4 Flyer', icon: '📄' },
  { id: 'trifold', name: 'Tri-fold', desc: '6-panel leaflet', icon: '📰' },
  { id: 'multipage', name: 'Multi-page', desc: 'Booklet', icon: '📖' },
];

const STYLE_OPTIONS = [
  { id: 'bep', name: 'BEP Corporate', color: '#0E3018' },
  { id: 'education', name: 'Academic', color: '#1e40af' },
  { id: 'modern-tech', name: 'Modern Tech', color: '#6366f1' },
  { id: 'business', name: 'Business', color: '#1e3a5f' },
];

function BrochureView() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');
  const { setSidebarCollapsed } = useToolbox();

  const [form, setForm] = useState({ topic: '', background: '', preferences: '', format: 'single', pageCount: '4', style: 'bep', kbFiles: [] as KbFile[] });
  const [result, setResult] = useState<BrochureResult | null>(null);
  const [brochureFormat, setBrochureFormat] = useState('single');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<{ step: string; message: string }[]>([]);
  const [activePageId, setActivePageId] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'bot'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load from history
  useEffect(() => {
    if (!assetId) return;
    fetch(`/api/toolbox/assets?id=${assetId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error || data.type !== 'BROCHURE') return;
        const payload = JSON.parse(data.payload);
        setResult(payload.brochure);
        setBrochureFormat(payload.format || 'single');
        setActivePageId(payload.brochure?.pages?.[0]?.id || '');
        setChatHistory([{ role: 'bot', content: `Loaded brochure: ${data.title}` }]);
      }).catch(console.error);
  }, [assetId]);

  // Image replace via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REPLACE_IMAGE') handleImageReplace(event.data.slotType);
      if (event.data?.type === 'TEXT_EDIT' && event.data.html && result) {
        const pageIdx = result.pages.findIndex(p => p.id === activePageId);
        if (pageIdx >= 0) {
          const pages = [...result.pages];
          // Rebuild full HTML preserving head
          const existingHtml = pages[pageIdx].html;
          const headMatch = existingHtml.match(/<head>[\s\S]*<\/head>/i);
          const newHtml = headMatch
            ? `<!DOCTYPE html><html>${headMatch[0]}<body>${event.data.html}</body></html>`
            : existingHtml;
          pages[pageIdx] = { ...pages[pageIdx], html: newHtml };
          setResult({ ...result, pages });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [result, activePageId]);

  const handleImageReplace = async (slotType?: string) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !result) return;
      const formData = new FormData(); formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          const pageIdx = result.pages.findIndex(p => p.id === activePageId);
          if (pageIdx >= 0) {
            const pages = [...result.pages];
            let html = pages[pageIdx].html;
            if (slotType) {
              const regex = new RegExp(`src="[^"]*placeholders/[^"]*"([^>]*data-slot="${slotType}")`, 'i');
              html = html.replace(regex, `src="${data.url}"$1`);
            }
            pages[pageIdx] = { ...pages[pageIdx], html };
            setResult({ ...result, pages });
          }
        }
      } catch { /* ignore */ }
    };
    input.click();
  };

  const handleGenerate = async () => {
    setLoading(true); setResult(null); setLogs([]);
    setSidebarCollapsed(true);
    try {
      const res = await fetch('/api/toolbox/brochure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, kbFileIds: form.kbFiles.map(f => f.id) }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: dr } = await reader.read();
        done = dr;
        if (value) {
          for (const line of decoder.decode(value, { stream: true }).split('\n\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'log') setLogs(p => [...p, data.data]);
              else if (data.type === 'result' && data.data.brochure) {
                setResult(data.data.brochure);
                setBrochureFormat(data.data.format);
                setActivePageId(data.data.brochure.pages?.[0]?.id || '');
                setChatHistory([{ role: 'bot', content: `✅ Your ${data.data.brochure.pages?.length}-page brochure is ready! I can help you refine it:` }]);
              } else if (data.type === 'error') alert(data.data.message || 'Generation failed');
            } catch { /* ignore */ }
          }
        }
      }
    } catch { alert('Network error'); }
    setLoading(false);
  };

  // ── Loading view ──
  if (!result && loading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-bold text-gray-800">SSE Pipeline — Designing Brochure</h3>
          </div>
          <div className="space-y-4">
            {logs.map((log, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="mt-0.5 text-base">{log.message.includes('✅') ? '✅' : log.message.includes('❌') ? '❌' : '🔄'}</div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase">{log.step}</div>
                  <div className="text-sm text-gray-700 mt-0.5">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Input form ──
  if (!result) {
    return (
      <div className="max-w-3xl mx-auto p-8 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900">Brochure Design</h1>
          <p className="text-sm text-gray-400 mt-1">Create professional flyers, tri-fold leaflets &amp; multi-page booklets</p>
        </div>
        <div className="space-y-5">
          {/* Format */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b"><h3 className="text-sm font-bold text-gray-600">Format *</h3></div>
            <div className="p-5 grid grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map(f => (
                <button key={f.id} onClick={() => setForm({ ...form, format: f.id })}
                  className={`p-4 rounded-xl text-left border-2 transition-all ${form.format === f.id ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="font-bold text-sm text-gray-800">{f.name}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
          {/* Page count for multipage */}
          {form.format === 'multipage' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50/50 border-b"><h3 className="text-sm font-bold text-gray-600">Pages</h3></div>
              <div className="p-5 flex gap-2">
                {['4', '6', '8', '12'].map(n => (
                  <button key={n} onClick={() => setForm({ ...form, pageCount: n })} className={`w-12 h-10 rounded-lg text-sm font-bold transition-all ${form.pageCount === n ? 'bg-emerald-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                ))}
              </div>
            </div>
          )}
          {/* Topic */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b"><h3 className="text-sm font-bold text-gray-600">Topic *</h3></div>
            <div className="p-5">
              <input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. BEP 2027 School Partner Prospectus" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-emerald-400" />
            </div>
          </div>
          {/* Style */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b"><h3 className="text-sm font-bold text-gray-600">Design Style</h3></div>
            <div className="p-5 flex gap-2">
              {STYLE_OPTIONS.map(s => (
                <button key={s.id} onClick={() => setForm({ ...form, style: s.id })} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 transition-all ${form.style === s.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {/* Background + KB */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-600">Content Source (Optional)</h3>
              <button onClick={() => setKbSelectorOpen(true)} className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 flex items-center gap-1"><Database className="w-3 h-3" /> KB</button>
            </div>
            <div className="p-5">
              {form.kbFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.kbFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs">
                      <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setForm({ ...form, kbFiles: form.kbFiles.filter(kf => kf.id !== f.id) })} />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mb-2 italic">💡 Leave empty — AI auto-searches your KB for relevant content.</p>
              <VoiceTextarea value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} placeholder="Paste extra content or notes here..." rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-emerald-400 resize-none" />
            </div>
          </div>
          {/* Generate */}
          <div className="flex justify-center pt-4">
            <button onClick={handleGenerate} disabled={!form.topic || loading} className="px-10 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><BookOpen className="w-4 h-4" /> Generate Brochure</>}
            </button>
          </div>
        </div>
        {kbSelectorOpen && <KbFileSelector isOpen={true} onClose={() => setKbSelectorOpen(false)} initialSelected={form.kbFiles} onConfirm={(files) => { setForm({ ...form, kbFiles: files }); setKbSelectorOpen(false); }} />}
      </div>
    );
  }

  // ── Preview mode ──
  const activePage = result.pages.find(p => p.id === activePageId) || result.pages[0];
  const activeIdx = result.pages.findIndex(p => p.id === activePageId);

  // Inject edit mode script
  const editScript = editMode ? `
<script>
document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,li,td,th,a,blockquote,label,figcaption').forEach(el=>{
  el.setAttribute('contenteditable','true');
  el.style.cursor='text';
  el.style.outline='none';
  el.addEventListener('focus',()=>{el.style.outline='2px solid #10b981';el.style.outlineOffset='2px';el.style.borderRadius='4px'});
  el.addEventListener('blur',()=>{
    el.style.outline='none';
    window.parent.postMessage({type:'TEXT_EDIT',html:document.body.innerHTML},'*');
  });
});
</script>` : '';

  const imgScript = `
<script>
document.querySelectorAll('img[data-slot]').forEach(img=>{
  img.style.cursor='pointer';
  img.addEventListener('mouseenter',()=>{img.style.outline='3px dashed #c9a84c';img.style.outlineOffset='2px'});
  img.addEventListener('mouseleave',()=>{img.style.outline='none'});
  img.addEventListener('click',()=>{window.parent.postMessage({type:'REPLACE_IMAGE',slotType:img.getAttribute('data-slot')},'*')});
});
</script>`;

  const previewHtml = (activePage?.html || '').includes('<html')
    ? activePage.html.replace('</body>', `${imgScript}${editScript}</body>`)
    : `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>body{font-family:'Inter',system-ui,sans-serif;margin:0}@page{margin:0}</style></head><body>${activePage?.html || ''}${imgScript}${editScript}</body></html>`;

  const handlePrintPDF = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          {/* Page nav */}
          <button disabled={activeIdx <= 0} onClick={() => setActivePageId(result.pages[activeIdx - 1]?.id)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold text-gray-700">{activePage?.label || `Page ${activeIdx + 1}`}</span>
          <span className="text-xs text-gray-400">{activeIdx + 1} / {result.pages.length}</span>
          <button disabled={activeIdx >= result.pages.length - 1} onClick={() => setActivePageId(result.pages[activeIdx + 1]?.id)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button onClick={() => handleImageReplace()} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-amber-100 border border-amber-100"><ImagePlus className="w-4 h-4" /> Image</button>
          <button onClick={() => setEditMode(!editMode)} className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 border transition-all ${editMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}><Edit3 className="w-4 h-4" /> {editMode ? 'Editing' : 'Edit Text'}</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-bold uppercase">{brochureFormat === 'trifold' ? 'Tri-fold' : brochureFormat === 'multipage' ? 'Booklet' : 'Flyer'}</span>
          <button onClick={handlePrintPDF} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-700 shadow-md">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Page thumbnails */}
        {result.pages.length > 1 && (
          <aside className="w-48 bg-white border-r flex flex-col shrink-0 overflow-y-auto p-2 space-y-2">
            {result.pages.map((page, idx) => (
              <button key={page.id} onClick={() => setActivePageId(page.id)}
                className={`p-2 rounded-lg text-left border-2 transition-all text-xs ${activePageId === page.id ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-100 hover:border-gray-200'}`}>
                <div className="text-gray-500 text-[10px]">Page {idx + 1}</div>
                <div className="text-gray-800 font-medium truncate">{page.label}</div>
              </button>
            ))}
          </aside>
        )}

        {/* Preview */}
        <div className="flex-1 relative bg-gray-200 overflow-auto flex justify-center p-6">
          <div className={`bg-white shadow-2xl ${brochureFormat === 'trifold' ? 'w-[297mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'}`} style={{ transformOrigin: 'top center' }}>
            <iframe ref={iframeRef} srcDoc={previewHtml} title="Brochure Preview" className="w-full h-full border-none" style={{ minHeight: brochureFormat === 'trifold' ? '210mm' : '297mm' }} sandbox="allow-scripts allow-same-origin" />
          </div>
        </div>

        {/* Copilot */}
        <aside className="w-[340px] bg-white border-l flex flex-col shrink-0 shadow-lg">
          <div className="p-4 border-b bg-gray-50/50">
            <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><Wand2 className="w-4 h-4 text-emerald-500" /> Copilot</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4 text-emerald-600"><BookOpen className="h-6 w-6" /></div>
                <h4 className="font-bold text-gray-800 mb-2">Design your brochure</h4>
                <p className="text-sm text-gray-400">Generate a brochure first, then use Copilot to refine it.</p>
              </div>
            ) : (
              <>
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-gray-100' : 'bg-emerald-600 text-white shadow-sm'}`}>
                      {msg.role === 'user' ? <UserCircle className="h-4 w-4 text-gray-400" /> : <Wand2 className="h-4 w-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatHistory.length <= 2 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[
                      'Make the cover more impactful',
                      'Change colors to navy blue',
                      'Add contact information panel',
                      'Include student testimonials',
                      'Add QR code placeholder',
                      'Make fonts larger for print',
                    ].map((q, qi) => (
                      <button key={qi} onClick={() => setChatInput(q)} className="px-3 py-1.5 text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-all">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-4 border-t bg-gray-50/80">
            <div className="relative">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); /* TODO: copilot send */ } }}
                placeholder="Describe changes..." rows={2}
                className="w-full p-3 pr-12 border border-gray-200 rounded-2xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none bg-white" />
              <button disabled={!chatInput.trim()} className="absolute bottom-2 right-2 p-2 bg-emerald-600 text-white rounded-xl disabled:opacity-30 hover:bg-emerald-700 shadow-md">
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function BrochurePage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
      <BrochureView />
    </Suspense>
  );
}
