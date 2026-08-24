'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { Globe, FileText, Send, Plus, XCircle, MessageSquare, Database, X, Edit3, Layout, ExternalLink, UserCircle, Loader2 } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

interface WebPage { id: string; title: string; html: string; inNav: boolean; }
interface WebSite { name: string; themeColor: string; pages: WebPage[]; }

function WebpageView() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');

  const [webForm, setWebForm] = useState({ topic: '', background: '', preferences: '', pageCount: '3', style: 'education', kbFiles: [] as KbFile[] });
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
          setWebChatHistory([{ role: 'bot', content: `已加载历史网站: ${data.title}` }]);
        }).catch(console.error);
    }
  }, [assetId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.pageId) {
        setWebActivePageId(event.data.pageId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!webResult && webLoading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse" />
            <h3 className="text-sm font-bold text-gray-800">SSE 执行管线 — 网页生成中</h3>
          </div>
          <div className="space-y-4">
            {webLogs.map((log, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-base">
                  {log.message.includes('✅') ? '✅' : log.message.includes('❌') ? '❌' : '🔄'}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{log.step}</div>
                  <div className="text-xs text-gray-700 mt-0.5 leading-relaxed">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-50 text-xs text-gray-400">并发生成所有页面，完成后自动展示结果...</div>
        </div>
      </div>
    );
  }

  if (!webResult) {
    return (
      <div className="max-w-3xl mx-auto p-8 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900">宣传页生成器</h1>
          <p className="text-sm text-gray-400 mt-1">输入主题 &rarr; AI 生成精美的多页营销宣传网站</p>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">宣传主题 *</h3></div>
            <div className="p-5">
              <input value={webForm.topic} onChange={e => setWebForm({ ...webForm, topic: e.target.value })} placeholder="例如：Myddelton College 2025 招生宣传" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">设计风格</h3></div>
            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                {[{ id: 'education', name: '教育学术', desc: '蓝调 · 可信赖' }, { id: 'modern-tech', name: '现代科技', desc: '暗色 · 渐变' }, { id: 'business', name: '商务简约', desc: '白底 · 高端' }].map(s => (
                  <button key={s.id} onClick={() => setWebForm({ ...webForm, style: s.id })} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${webForm.style === s.id ? 'bg-teal-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {s.name} <span className="opacity-60 ml-1">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">页面数量</h3></div>
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
              <h3 className="text-xs font-bold text-gray-600">背景资料（可选）</h3>
              <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded hover:bg-teal-100 flex items-center gap-1"><Database className="w-3 h-3" /> 从知识库选择</button>
            </div>
            <div className="p-5">
              {webForm.kbFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {webForm.kbFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-teal-50 border border-teal-100 text-teal-700 px-2 py-1 rounded-md text-[11px]">
                      <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setWebForm({ ...webForm, kbFiles: webForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                    </div>
                  ))}
                </div>
              )}
              <textarea value={webForm.background} onChange={e => setWebForm({ ...webForm, background: e.target.value })} placeholder="粘贴关于项目的背景资料、课程介绍、学校特色等" rows={5} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">额外要求（可选）</h3></div>
            <div className="p-5">
              <textarea value={webForm.preferences} onChange={e => setWebForm({ ...webForm, preferences: e.target.value })} placeholder="例如：需要中英双语、突出奖学金信息、包含申请流程等" rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
            </div>
          </div>
          <div className="flex justify-center pt-4">
            <button onClick={async () => {
              setWebLoading(true); setWebResult(null); setWebLogs([]);
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
                          setWebChatHistory([{ role: 'bot', content: `已生成 ${data.data.site.pages?.length || 0} 个页面的宣传站点。

你可以在右侧输入修改指令，或切换到手动模式直接编辑内容。

💡 点击页面中的图片占位区域可以替换为真实图片。` }]);
                        } else if (data.type === 'error') { alert(data.data.message || '生成失败'); }
                      } catch { /* ignore */ }
                    }
                  }
                }
              } catch { alert('网络错误'); }
              setWebLoading(false);
            }} disabled={!webForm.topic || webLoading} className="px-10 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-full shadow-lg shadow-teal-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
              {webLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中（查看左侧日志）...</> : <><Globe className="w-4 h-4" /> 生成宣传页</>}
            </button>
          </div>
        </div>
        {kbSelectorOpen && (
          <KbFileSelector isOpen={true} onClose={() => setKbSelectorOpen(false)} initialSelected={webForm.kbFiles} onConfirm={(files) => { setWebForm({ ...webForm, kbFiles: files }); setKbSelectorOpen(false); }} />
        )}
      </div>
    );
  }

  // === Webpage Editor / Preview ===
  const activePage = webResult.pages.find(p => p.id === webActivePageId) || webResult.pages[0];
  const navLinks = webResult.pages
    .filter(p => p.inNav)
    .map(p => `<a href="javascript:void(0)" data-page-id="${p.id}" class="nav-link px-4 py-2 hover:opacity-70 font-bold transition-all text-sm ${p.id === activePage?.id ? 'border-b-2' : ''}" style="border-color: ${webResult.themeColor}">${p.title}</a>`)
    .join('');
  const previewHtml = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script>
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0}[data-image-placeholder]{transition:all .2s;cursor:pointer}[data-image-placeholder]:hover{opacity:.85;transform:scale(1.01)}[data-image-placeholder] img{width:100%;height:100%;object-fit:cover;border-radius:12px}</style></head><body>
<header class="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
  <div class="flex items-center gap-2">
    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style="background:${webResult.themeColor}">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
    <span class="font-bold text-xl">${webResult.name}</span>
  </div>
  <nav class="hidden md:flex gap-2">${navLinks}</nav>
</header>
<div id="site-content">${activePage?.html || ''}</div>
<footer class="bg-gray-50 py-12 px-8 border-t"><div class="max-w-4xl mx-auto text-center opacity-50 text-sm">&copy; ${new Date().getFullYear()} ${webResult.name}. Powered by BEP AI</div></footer>
<script>
document.querySelectorAll('.nav-link').forEach(link=>{link.addEventListener('click',e=>{e.preventDefault();window.parent.postMessage({type:'NAVIGATE',pageId:link.getAttribute('data-page-id')},'*')})});
document.querySelectorAll('[data-image-placeholder]').forEach(el=>{el.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{el.innerHTML='<img src="'+ev.target.result+'" style="width:100%;height:100%;object-fit:cover;border-radius:12px" />'};reader.readAsDataURL(file)};input.click()})});
<\/script></body></html>`;

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
      if (data.success && data.site) { setWebResult(data.site); setWebChatHistory(prev => [...prev, { role: 'bot', content: '✅ 已更新！请查看预览。' }]); }
      else { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 修改失败: ${data.error || '未知错误'}` }]); }
      setWebChatLoading(false);
    }).catch(() => { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 网络错误` }]); setWebChatLoading(false); });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setWebEditorMode('ai')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${webEditorMode === 'ai' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500'}`}>
            <MessageSquare className="h-3.5 w-3.5" /> AI 智能修改
          </button>
          <button onClick={() => setWebEditorMode('manual')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${webEditorMode === 'manual' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-500'}`}>
            <Edit3 className="h-3.5 w-3.5" /> 手动编辑
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">预览: <span className="text-gray-700">{activePage?.title}</span></span>
          {webPublishedUrl && (
            <a href={webPublishedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold hover:bg-green-100">
              <ExternalLink className="w-3 h-3" /> 已发布
            </a>
          )}
          <button onClick={async () => {
            setWebPublishing(true);
            try {
              const slug = webResult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site-' + Date.now();
              const res = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, siteName: webResult.name, themeColor: webResult.themeColor, pages: webResult.pages }) });
              const data = await res.json();
              if (data.ok) setWebPublishedUrl(data.url);
              else alert(data.error || '发布失败');
            } catch { alert('发布失败'); }
            setWebPublishing(false);
          }} disabled={webPublishing} className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-teal-700 shadow-md disabled:opacity-50">
            {webPublishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 发布中</> : <><Globe className="w-3.5 h-3.5" /> 发布站点</>}
          </button>
          <button onClick={() => setWebResult(null)} className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-200">重新生成</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {webEditorMode === 'manual' && (
          <aside className="w-56 bg-white border-r flex flex-col shrink-0">
            <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Layout className="h-3 w-3" /> 页面</h3>
              <button onClick={() => {
                const newId = `page-${Date.now()}`;
                setWebResult({ ...webResult, pages: [...webResult.pages, { id: newId, title: '新页面', html: '<section class="py-20 px-8 text-center"><h1 class="text-3xl font-bold">新页面</h1><p class="mt-4 text-gray-500">编辑此内容</p></section>', inNav: true }] });
                setWebActivePageId(newId);
              }} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {webResult.pages.map(page => (
                <div key={page.id} onClick={() => setWebActivePageId(page.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${webActivePageId === page.id ? 'bg-teal-50 border-teal-100 text-teal-700 font-bold shadow-sm' : 'hover:bg-gray-50 border-transparent text-gray-500'}`}>
                  <div className="flex items-center gap-2 truncate">
                    <FileText className={`h-3.5 w-3.5 ${webActivePageId === page.id ? 'text-teal-500' : 'opacity-30'}`} />
                    <span className="text-xs truncate">{page.title}</span>
                  </div>
                  {webResult.pages.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); setWebResult({ ...webResult, pages: webResult.pages.filter(p => p.id !== page.id) }); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500">
                      <XCircle className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-3 bg-gray-50 text-[9px] text-gray-400 text-center border-t">点击图片占位区可替换图片</div>
          </aside>
        )}

        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {webChatLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-3" /><p className="text-sm font-bold text-gray-600">AI 正在更新...</p></div>
            </div>
          )}
          <iframe ref={webIframeRef} srcDoc={previewHtml} title="Site Preview" className="w-full h-full border-none bg-white" sandbox="allow-scripts allow-same-origin" />
        </div>

        {webEditorMode === 'ai' && (
          <aside className="w-80 bg-white border-l flex flex-col shrink-0 shadow-lg">
            <div className="p-4 border-b flex items-center justify-between bg-teal-50/30">
              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-teal-500" /><h3 className="font-bold text-sm text-gray-800">AI 设计助手</h3></div>
              {webChatLoading && <Loader2 className="h-4 w-4 animate-spin text-teal-500" />}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {webChatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center mb-4 text-teal-600"><Globe className="h-6 w-6" /></div>
                  <h4 className="font-bold text-gray-800 mb-2">有什么可以帮您？</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">试试说：&quot;把首页背景换成深蓝色&quot;、&quot;增加一个联系表单&quot;或&quot;把课程列表改成卡片布局&quot;</p>
                </div>
              ) : (
                webChatHistory.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-gray-100' : 'bg-teal-600 text-white shadow-sm'}`}>
                      {msg.role === 'user' ? <UserCircle className="h-3.5 w-3.5 text-gray-400" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm max-w-[85%] ${msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t bg-gray-50/80">
              <div className="relative">
                <textarea value={webChatInput} onChange={e => setWebChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWebChat(webChatInput); } }}
                  placeholder="输入修改指令..." rows={2}
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
}

export default function WebpagePage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
      <WebpageView />
    </Suspense>
  );
}
