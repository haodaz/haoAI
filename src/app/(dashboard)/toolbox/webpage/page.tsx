'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { Globe, FileText, Send, Plus, XCircle, MessageSquare, Database, X, Edit3, Layout, ExternalLink, UserCircle, Loader2, Wand2, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { useToolbox } from '../layout';
import VoiceTextarea from '@/components/ui/VoiceTextarea';

interface WebPage { id: string; title: string; html: string; inNav: boolean; }
interface WebSite { name: string; themeColor: string; pages: WebPage[]; }

const STYLE_OPTIONS = [
  { id: 'bep', name: 'BEP Corporate', desc: 'Green · Gold', color: '#0E3018' },
  { id: 'education', name: 'Academic', desc: 'Blue · Trusted', color: '#1e40af' },
  { id: 'modern-tech', name: 'Modern Tech', desc: 'Dark · Gradient', color: '#6366f1' },
  { id: 'business', name: 'Business', desc: 'White · Premium', color: '#1e3a5f' },
];

function WebpageView() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');
  const { setSidebarCollapsed } = useToolbox();

  const [webForm, setWebForm] = useState({ topic: '', background: '', preferences: '', pageCount: '3', style: 'bep', kbFiles: [] as KbFile[] });
  const [webResult, setWebResult] = useState<WebSite | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webLogs, setWebLogs] = useState<{ step: string; message: string }[]>([]);
  const [webActivePageId, setWebActivePageId] = useState('');
  const [webEditorMode, setWebEditorMode] = useState<'ai' | 'manual'>('ai');
  const [webChatHistory, setWebChatHistory] = useState<{ role: 'user' | 'bot'; content: string }[]>([]);
  const [webChatInput, setWebChatInput] = useState('');
  const [webChatLoading, setWebChatLoading] = useState(false);
  const [webPublishing, setWebPublishing] = useState(false);
  const [webPublishedUrl, setWebPublishedUrl] = useState<string | null>(null);
  const webIframeRef = useRef<HTMLIFrameElement>(null);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);

  useEffect(() => {
    if (assetId) {
      fetch(`/api/toolbox/assets?id=${assetId}`)
        .then(r => r.json())
        .then(data => {
          if (data.error || data.type !== 'WEB') return;
          const payload = JSON.parse(data.payload);
          setWebResult(payload.site);
          setWebForm(prev => ({ ...prev, topic: data.title }));
          if (payload.publishedUrl) setWebPublishedUrl(payload.publishedUrl);
          setWebChatHistory([{ role: 'bot', content: `Loaded site from history: ${data.title}` }]);
        }).catch(console.error);
    }
  }, [assetId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.pageId) {
        setWebActivePageId(event.data.pageId);
      }
      // Handle image replacement request from iframe
      if (event.data?.type === 'REPLACE_IMAGE') {
        handleImageReplace(event.data.slotType);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [webResult, webActivePageId]);

  // ── Image upload & replace ──
  const handleImageReplace = async (slotType?: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !webResult) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          // Replace the placeholder in the active page's HTML
          const pageIdx = webResult.pages.findIndex(p => p.id === webActivePageId);
          if (pageIdx >= 0) {
            const updatedPages = [...webResult.pages];
            let html = updatedPages[pageIdx].html;
            if (slotType) {
              // Replace first matching placeholder of this type
              const regex = new RegExp(`src="[^"]*placeholders/[^"]*"([^>]*data-slot="${slotType}")`, 'i');
              html = html.replace(regex, `src="${data.url}"$1`);
            }
            updatedPages[pageIdx] = { ...updatedPages[pageIdx], html };
            setWebResult({ ...webResult, pages: updatedPages });
          }
        }
      } catch { /* ignore */ }
    };
    input.click();
  };

  // ── Pipeline (loading) view ──
  if (!webResult && webLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse" />
            <h3 className="text-sm font-bold text-gray-800">SSE Pipeline — Generating Pages</h3>
          </div>
          <div className="space-y-4">
            {webLogs.map((log, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-base">
                  {log.message.includes('✅') ? '✅' : log.message.includes('❌') ? '❌' : log.message.includes('⚠') ? '⚠️' : '🔄'}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{log.step}</div>
                  <div className="text-sm text-gray-700 mt-0.5 leading-relaxed">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-50 text-xs text-gray-400">Generating all pages concurrently. Results will appear automatically...</div>
        </div>
      </div>
    );
  }

  // ── Input form ──
  if (!webResult) {
    return (
      <div className="max-w-3xl mx-auto p-8 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900">Website Builder</h1>
          <p className="text-sm text-gray-400 mt-1">Enter a topic &rarr; AI generates a polished multi-page website with your brand</p>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-600">Topic *</h3></div>
            <div className="p-5">
              <input value={webForm.topic} onChange={e => setWebForm({ ...webForm, topic: e.target.value })} placeholder="e.g. Myddelton College 2025 International Admissions" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-600">Design Style</h3></div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {STYLE_OPTIONS.map(s => (
                  <button key={s.id} onClick={() => setWebForm({ ...webForm, style: s.id })} className={`relative px-4 py-3 rounded-xl text-sm font-bold transition-all text-left border-2 ${webForm.style === s.id ? 'border-teal-500 bg-teal-50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className={webForm.style === s.id ? 'text-teal-700' : 'text-gray-700'}>{s.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{s.desc}</span>
                    {s.id === 'bep' && <span className="absolute top-1.5 right-2 text-[8px] font-black text-teal-500 bg-teal-50 px-1.5 py-0.5 rounded">DEFAULT</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-600">Number of Pages</h3></div>
            <div className="p-5">
              <div className="flex gap-2">
                {['1', '2', '3', '4', '5'].map(n => (
                  <button key={n} onClick={() => setWebForm({ ...webForm, pageCount: n })} className={`w-12 h-10 rounded-lg text-sm font-bold transition-all ${webForm.pageCount === n ? 'bg-teal-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-600">Background (Optional)</h3>
              <button onClick={() => setKbSelectorOpen(true)} className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded hover:bg-teal-100 flex items-center gap-1"><Database className="w-3 h-3" /> Select from KB</button>
            </div>
            <div className="p-5">
              {webForm.kbFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {webForm.kbFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-teal-50 border border-teal-100 text-teal-700 px-2 py-1 rounded-md text-xs">
                      <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setWebForm({ ...webForm, kbFiles: webForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mb-2 italic">💡 If no KB files selected, AI will auto-search your knowledge base for relevant content.</p>
              <VoiceTextarea hintKey="toolbox-webpage" value={webForm.background} onChange={e => setWebForm({ ...webForm, background: e.target.value })} placeholder="Paste background info, course details, school USPs etc." rows={5} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-600">Extra Requirements (Optional)</h3></div>
            <div className="p-5">
              <VoiceTextarea value={webForm.preferences} onChange={e => setWebForm({ ...webForm, preferences: e.target.value })} placeholder="e.g. Bilingual EN/CN, highlight scholarships, include application flow" rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
            </div>
          </div>
          <div className="flex justify-center pt-4">
            <button onClick={async () => {
              setWebLoading(true); setWebResult(null); setWebLogs([]);
              setSidebarCollapsed(true);
              try {
                const res = await fetch('/api/toolbox/webpage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...webForm, kbFileIds: webForm.kbFiles.map(f => f.id) }) });
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
                        if (data.type === 'log') setWebLogs(p => [...p, data.data]);
                        else if (data.type === 'result' && data.data.site) {
                          setWebResult(data.data.site);
                          setWebActivePageId(data.data.site.pages?.[0]?.id || '');
                          setWebChatHistory([{ role: 'bot', content: `✅ Your ${data.data.site.pages?.length || 0}-page website is ready! I can help you refine it. Try:` }]);
                        } else if (data.type === 'error') { alert(data.data.message || 'Generation failed'); }
                      } catch { /* ignore */ }
                    }
                  }
                }
              } catch { alert('Network error'); }
              setWebLoading(false);
            }} disabled={!webForm.topic || webLoading} className="px-10 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-full shadow-lg shadow-teal-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
              {webLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Globe className="w-4 h-4" /> Generate Website</>}
            </button>
          </div>
        </div>
        {kbSelectorOpen && (
          <KbFileSelector isOpen={true} onClose={() => setKbSelectorOpen(false)} initialSelected={webForm.kbFiles} onConfirm={(files) => { setWebForm({ ...webForm, kbFiles: files }); setKbSelectorOpen(false); }} />
        )}
      </div>
    );
  }

  // ── Preview mode ──
  const activePage = webResult.pages.find(p => p.id === webActivePageId) || webResult.pages[0];

  // Build iframe HTML — pages now have full HTML, just inject image click handler
  const previewHtml = (activePage?.html || '').includes('<html')
    ? activePage.html.replace('</body>', `
<script>
document.querySelectorAll('.nav-link,[data-page-id]').forEach(link=>{link.addEventListener('click',e=>{e.preventDefault();window.parent.postMessage({type:'NAVIGATE',pageId:link.getAttribute('data-page-id')},'*')})});
document.querySelectorAll('img[data-slot]').forEach(img=>{
  img.style.cursor='pointer';
  img.addEventListener('mouseenter',()=>{img.style.outline='3px dashed #c9a84c';img.style.outlineOffset='2px'});
  img.addEventListener('mouseleave',()=>{img.style.outline='none'});
  img.addEventListener('click',()=>{window.parent.postMessage({type:'REPLACE_IMAGE',slotType:img.getAttribute('data-slot')},'*')});
});
</script></body>`)
    : `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',system-ui,sans-serif;margin:0}</style></head><body>
${activePage?.html || ''}
<script>
document.querySelectorAll('.nav-link,[data-page-id]').forEach(link=>{link.addEventListener('click',e=>{e.preventDefault();window.parent.postMessage({type:'NAVIGATE',pageId:link.getAttribute('data-page-id')},'*')})});
document.querySelectorAll('img[data-slot]').forEach(img=>{
  img.style.cursor='pointer';
  img.addEventListener('mouseenter',()=>{img.style.outline='3px dashed #c9a84c';img.style.outlineOffset='2px'});
  img.addEventListener('mouseleave',()=>{img.style.outline='none'});
  img.addEventListener('click',()=>{window.parent.postMessage({type:'REPLACE_IMAGE',slotType:img.getAttribute('data-slot')},'*')});
});
</script></body></html>`;

  const sendWebChat = (msg: string) => {
    if (!msg.trim()) return;
    setWebChatHistory(prev => [...prev, { role: 'user', content: msg }]);
    setWebChatInput('');
    setWebChatLoading(true);
    fetch('/api/toolbox/webpage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: webResult.name,
        background: `Current site JSON:\n${JSON.stringify(webResult, null, 2)}`,
        preferences: `User modification request: ${msg}\n\nIMPORTANT: Keep the same site structure. Only modify based on the user request. Return the FULL updated site JSON.`,
        pageCount: String(webResult.pages.length), style: webForm.style,
      }),
    }).then(r => r.json()).then(data => {
      if (data.success && data.site) { setWebResult(data.site); setWebChatHistory(prev => [...prev, { role: 'bot', content: '✅ Updated!' }]); }
      else { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ Update failed: ${data.error || 'Unknown error'}` }]); }
      setWebChatLoading(false);
    }).catch(() => { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ Network error` }]); setWebChatLoading(false); });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setWebEditorMode('ai')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${webEditorMode === 'ai' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500'}`}>
              <MessageSquare className="h-4 w-4" /> AI Edit
            </button>
            <button onClick={() => setWebEditorMode('manual')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${webEditorMode === 'manual' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500'}`}>
              <Edit3 className="h-4 w-4" /> Manual Edit
            </button>
          </div>
          {/* Upload image button */}
          <button onClick={() => handleImageReplace()} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-amber-100 border border-amber-100 transition-all">
            <ImagePlus className="w-4 h-4" /> Upload Image
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Preview: <span className="text-gray-700">{activePage?.title}</span></span>
          {webPublishedUrl && (
            <a href={webPublishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded flex items-center gap-1 hover:bg-teal-100"><ExternalLink className="w-3 h-3" /> Live</a>
          )}
          <button onClick={async () => {
            setWebPublishing(true);
            try {
              const slug = webResult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site-' + Date.now();
              const res = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, siteName: webResult.name, themeColor: webResult.themeColor, pages: webResult.pages }) });
              const data = await res.json();
              if (data.ok) setWebPublishedUrl(data.url);
              else alert(data.error || 'Publish failed');
            } catch { alert('Publish failed'); }
            setWebPublishing(false);
          }} disabled={webPublishing} className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-teal-700 shadow-md disabled:opacity-50">
            {webPublishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing</> : <><Globe className="w-4 h-4" /> Publish</>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {webEditorMode === 'manual' && (
          <aside className="w-64 bg-white border-r flex flex-col shrink-0">
            <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Layout className="h-4 w-4" /> Pages</h3>
              <button onClick={() => {
                const newId = `page-${Date.now()}`;
                setWebResult({ ...webResult, pages: [...webResult.pages, { id: newId, title: 'New Page', html: `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>body{font-family:'Inter',system-ui,sans-serif}</style></head><body class="bg-white"><section class="py-20 px-8 text-center max-w-4xl mx-auto"><h1 class="text-4xl font-extrabold text-gray-900">New Page</h1><p class="mt-4 text-lg text-gray-500">Start editing this page content</p><div class="mt-8"><img src="/images/placeholders/banner_hero.svg" data-slot="hero" alt="Hero" class="w-full h-auto rounded-xl"></div></section></body></html>`, inNav: true }] });
                setWebActivePageId(newId);
              }} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {webResult.pages.map(page => (
                <div key={page.id} onClick={() => setWebActivePageId(page.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${webActivePageId === page.id ? 'bg-teal-50 border-teal-100 text-teal-700 font-bold shadow-sm' : 'hover:bg-gray-50 border-transparent text-gray-500'}`}>
                  <div className="flex items-center gap-2 truncate">
                    <FileText className={`h-4 w-4 ${webActivePageId === page.id ? 'text-teal-500' : 'opacity-30'}`} />
                    <span className="text-sm truncate">{page.title}</span>
                  </div>
                  {webResult.pages.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); setWebResult({ ...webResult, pages: webResult.pages.filter(p => p.id !== page.id) }); if (webActivePageId === page.id) setWebActivePageId(webResult.pages[0].id); }} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {webChatLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-3" /><p className="text-sm font-bold text-gray-600">AI is updating...</p></div>
            </div>
          )}
          <iframe ref={webIframeRef} srcDoc={previewHtml} title="Site Preview" className="w-full h-full border-none bg-white" sandbox="allow-scripts allow-same-origin" />
        </div>

        {webEditorMode === 'ai' && (
          <aside className="w-[360px] bg-white border-l flex flex-col shrink-0 shadow-lg">
            <div className="p-4 border-b bg-gray-50/50">
              <h3 className="font-black text-gray-800 text-sm">Copilot Refinement</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {webChatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center mb-4 text-teal-600"><Wand2 className="h-6 w-6" /></div>
                  <h4 className="font-bold text-gray-800 mb-2">How can I help?</h4>
                  <p className="text-sm text-gray-400 leading-relaxed">Generate a website first, then ask me to refine it.</p>
                </div>
              ) : (
                <>
                  {webChatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-gray-100' : 'bg-teal-600 text-white shadow-sm'}`}>
                        {msg.role === 'user' ? <UserCircle className="h-4 w-4 text-gray-400" /> : <Wand2 className="h-4 w-4" />}
                      </div>
                      <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm max-w-[85%] ${msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {/* Quick action bubbles */}
                  {webChatHistory.length <= 2 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[
                        'Change the hero section to be more impactful',
                        'Add a contact form section',
                        'Make it bilingual EN/CN',
                        'Add student testimonials',
                        'Change color scheme to darker',
                        'Add a FAQ section',
                      ].map((q, qi) => (
                        <button key={qi} onClick={() => setPptChatInputAndSend(q)} className="px-3 py-1.5 text-[11px] bg-teal-50 text-teal-600 border border-teal-100 rounded-full hover:bg-teal-100 transition-all">
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
                <textarea value={webChatInput} onChange={e => setWebChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWebChat(webChatInput); } }}
                  placeholder="Enter edit instruction..." rows={2}
                  className="w-full p-3 pr-12 border border-gray-200 rounded-2xl text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none bg-white" />
                <button onClick={() => sendWebChat(webChatInput)} disabled={webChatLoading || !webChatInput.trim()}
                  className="absolute bottom-2 right-2 p-2 bg-teal-600 text-white rounded-xl disabled:opacity-30 hover:bg-teal-700 shadow-md">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );

  // Helper for quick action bubbles
  function setPptChatInputAndSend(text: string) {
    setWebChatInput(text);
    sendWebChat(text);
  }
}

export default function WebpagePage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
      <WebpageView />
    </Suspense>
  );
}
