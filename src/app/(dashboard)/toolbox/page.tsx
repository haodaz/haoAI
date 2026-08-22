
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Modal, Tooltip, Spin } from 'antd';
import { marked } from 'marked';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ThinkBlock, ToolCallsBlock, renderPreviewStandalone, COLOR_BORDER_MAP } from '@/components/shared/UIBlocks';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { Building2, Cpu, Activity, History, BookOpen, Settings, Send, CheckCircle2, ChevronRight, ChevronLeft, Users, Layout, Plus, FileText, Calendar, Presentation, AlertTriangle, Scale, Mail, StopCircle, Edit, Edit3, Link2, UploadCloud, Terminal, Info, Download, MessageSquare, Wrench, PenTool, CheckCircle, XCircle, Hourglass, ChevronDown, ChevronUp, Database, Menu, X, Copy, RefreshCw, GitMerge, LogOut, UserCircle, Phone, AtSign, Camera, Save, ArrowLeft, ArrowRight, SaveAll, Loader2, Globe, ExternalLink, Eye } from 'lucide-react';

// Webpage types
interface WebPage { id: string; title: string; html: string; inNav: boolean; }
interface WebSite { name: string; themeColor: string; pages: WebPage[]; }

function ToolboxView({ initialPpt, onPptConsumed }: { initialPpt?: { slides: any[]; fileUrl: string; topic: string } | null; onPptConsumed?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetId = searchParams?.get('assetId');
  const [historyItems, setHistoryItems] = useState<any[]>([]);

  const [activeTool, setActiveTool] = useState<'ppt' | 'legal' | 'webpage' | 'signature' | null>(initialPpt ? 'ppt' : null);

  // PPT State
  const [pptForm, setPptForm] = useState({ topic: initialPpt?.topic || '', slideCount: '约10页', theme: 'blue', density: 'standard', background: '', preferences: '', kbFiles: [] as KbFile[] });
  const [pptResult, setPptResult] = useState<{ slides: any[]; fileUrl: string } | null>(initialPpt ? { slides: initialPpt.slides, fileUrl: initialPpt.fileUrl } : null);
  const [pptLoading, setPptLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [pptView, setPptView] = useState<'presentation' | 'outline'>('presentation');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [pptChatHistory, setPptChatHistory] = useState<{role: 'user'|'bot'; content: string}[]>(initialPpt ? [{ role: 'bot', content: `已从 Edda 加载 ${initialPpt.slides.length} 页 PPT，你可以在左侧输入修改指令。` }] : []);
  const [pptChatInput, setPptChatInput] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);



  // Legal State
  const [legalForm, setLegalForm] = useState({ docType: 'NDA', partyA: '', partyB: '', keyTerms: '', background: '', templateStyle: '标准英式', kbFiles: [] as KbFile[] });
  const [legalResult, setLegalResult] = useState<string | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);

  // Webpage State
  const [webForm, setWebForm] = useState({ topic: '', background: '', preferences: '', pageCount: '3', style: 'education', kbFiles: [] as KbFile[] });
  
  const [kbSelectorTarget, setKbSelectorTarget] = useState<'ppt' | 'legal' | 'webpage' | null>(null);
  const [webResult, setWebResult] = useState<WebSite | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webActivePageId, setWebActivePageId] = useState('');
  const [webEditorMode, setWebEditorMode] = useState<'ai' | 'manual'>('ai');
  const [webChatHistory, setWebChatHistory] = useState<{role: 'user'|'bot'; content: string}[]>([]);
  const [webChatInput, setWebChatInput] = useState('');
  const [webChatLoading, setWebChatLoading] = useState(false);
  const [webPublishing, setWebPublishing] = useState(false);
  const [webPublishedUrl, setWebPublishedUrl] = useState<string | null>(null);
  const webIframeRef = useRef<HTMLIFrameElement>(null);

  // Signature State
  const [sigForm, setSigForm] = useState({
    slogan: 'Your always-on international enrolment office',
    email: 'partners@bristhnrolmentpartners.com',
    phone: '+44 7921 879 389',
    address: '106 Great Charles Street, Birmingham, B3 3HN',
    logoUrl: '/images/BEP_logo.png',
    socials: [] as { type: string, url: string }[]
  });
  const [sigSaving, setSigSaving] = useState(false);

  const generateSignatureHtml = () => {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">
  <tr>
    <td style="background-color: #16331E; padding: 20px;">
      <img src="${sigForm.logoUrl}" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />
      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">${sigForm.slogan}</span>
    </td>
  </tr>
  <tr>
    <td style="padding: 15px 0 0 0;">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">
        ✉️ ${sigForm.email} &nbsp;|&nbsp; 📞 ${sigForm.phone}
      </p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">
        🏢 ${sigForm.address}
      </p>
      ${sigForm.socials.length > 0 ? `
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${sigForm.socials.map(s => `<td style="padding-right: 8px;"><a href="${s.url}"><img src="/images/social/${s.type}.png" width="24" height="24" alt="${s.type}" style="display:block;border:none;" /></a></td>`).join('')}
        </tr>
      </table>` : ''}
    </td>
  </tr>
</table>`;
  };

  const handleSaveSignature = async () => {
    setSigSaving(true);
    try {
      const html = generateSignatureHtml();
      // Replace URLs with CID for email embedding
      let emailHtml = html.replace(`src="${sigForm.logoUrl}"`, `src="cid:bep_signature"`);
      emailHtml = emailHtml.replace(/src="\/images\/social\/([a-zA-Z0-9_-]+)\.png"/g, 'src="cid:icon_$1"');
      
      const res = await fetch('/api/toolbox/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: emailHtml })
      });
      if (res.ok) {
        alert('全局邮件签名保存成功！');
      } else {
        alert('保存失败');
      }
    } catch (err) {
      alert('Network error');
    }
    setSigSaving(false);
  };

  // Consume initial data so it doesn't re-trigger on tab switch
  useEffect(() => {
    if (initialPpt && onPptConsumed) {
      onPptConsumed();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/toolbox/assets').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setHistoryItems(data);
    }).catch(console.error);
  }, [pptResult, webResult]); // refresh history when results change

  useEffect(() => {
    if (assetId) {
       fetch(`/api/toolbox/assets?id=${assetId}`)
         .then(r => r.json())
         .then(data => {
            if (data.error) return;
            if (data.type === 'PPT') {
               const payload = JSON.parse(data.payload);
               setActiveTool('ppt');
               setPptResult({ slides: payload.slides || payload.rawSlides || [], fileUrl: payload.fileUrl });
               setPptForm(prev => ({...prev, topic: data.title }));
               setPptChatHistory([{ role: 'bot', content: `已加载历史 PPT: ${data.title}` }]);
            } else if (data.type === 'WEB') {
               const payload = JSON.parse(data.payload);
               setActiveTool('webpage');
               setWebResult(payload.site);
               setWebForm(prev => ({...prev, topic: data.title }));
               if (payload.publishedUrl) setWebPublishedUrl(payload.publishedUrl);
               setWebChatHistory([{ role: 'bot', content: `已加载历史网站: ${data.title}` }]);
            }
         }).catch(console.error);
    }
  }, [assetId]);

  // Handle iframe navigation messages (page switching)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.pageId) {
        setWebActivePageId(event.data.pageId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGeneratePPT = async () => {
    setPptLoading(true); setPptResult(null);
    try {
      const res = await fetch('/api/toolbox/ppt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pptForm, kbFileIds: pptForm.kbFiles.map(f => f.id) }) });
      const data = await res.json();
      if (data.success) setPptResult({ slides: data.slides, fileUrl: data.fileUrl });
      else alert(data.error || 'Generation failed');
    } catch { alert('Network error'); }
    setPptLoading(false);
  };

  const handleGenerateLegal = async () => {
    setLegalLoading(true); setLegalResult(null);
    try {
      const res = await fetch('/api/toolbox/legal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...legalForm, kbFileIds: legalForm.kbFiles.map(f => f.id) }) });
      const data = await res.json();
      if (data.success) setLegalResult(data.document);
      else alert(data.error || 'Generation failed');
    } catch { alert('Network error'); }
    setLegalLoading(false);
  };

  const THEMES = [
    { id: 'graphite', name: 'Modern Graphite', colors: ['#2D3436', '#DFE6E9', '#0984E3'] },
    { id: 'blue', name: 'Professional Blue', colors: ['#1E3A8A', '#3B82F6', '#DBEAFE'] },
    { id: 'emerald', name: 'Creative Emerald', colors: ['#065F46', '#10B981', '#D1FAE5'] },
    { id: 'light', name: 'Minimalist Light', colors: ['#64748B', '#94A3B8', '#F1F5F9'] },
  ];
  const DENSITIES = [
    { id: 'comprehensive', name: '全面详尽', desc: '内容丰富，适合详细报告' },
    { id: 'standard', name: '标准均衡', desc: '图文并茂，适用于多数场景' },
    { id: 'concise', name: '简洁有力', desc: '突出重点，适合高层汇报' },
    { id: 'minimalist', name: '极简视觉', desc: '一图一言，适合演讲' },
  ];
  const DOC_TYPES = ['NDA', 'MOU', '服务协议', '合作合同', '劳动合同'];
  const STYLES = ['标准英式', '中英双语', '简约版'];

  return (
    <div className="w-full h-full bg-[#f8f9fc] flex flex-col md:flex-row overflow-hidden">
      {/* Tool Sidebar */}
      <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200/80 flex flex-col shrink-0 overflow-hidden">
        {/* Tools List */}
        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">生成工具</h2>
          <button onClick={() => { setActiveTool('ppt'); setPptResult(null); router.push('/toolbox'); }} className={`w-full text-left p-3 rounded-xl transition-all ${activeTool === 'ppt' ? 'bg-indigo-50 border border-indigo-100' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}>
            <h3 className={`text-xs font-bold flex items-center ${activeTool === 'ppt' ? 'text-indigo-700' : 'text-gray-700'}`}>
              <Presentation className={`w-3.5 h-3.5 mr-2 ${activeTool === 'ppt' ? 'text-indigo-500' : 'text-gray-400'}`} /> PPT 生成器
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">物理渲染出可下载 .pptx 文件</p>
          </button>

          <button onClick={() => { setActiveTool('legal'); setLegalResult(null); router.push('/toolbox'); }} className={`w-full text-left p-3 rounded-xl transition-all ${activeTool === 'legal' ? 'bg-violet-50 border border-violet-100' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}>
            <h3 className={`text-xs font-bold flex items-center ${activeTool === 'legal' ? 'text-violet-700' : 'text-gray-700'}`}>
              <FileText className={`w-3.5 h-3.5 mr-2 ${activeTool === 'legal' ? 'text-violet-500' : 'text-gray-400'}`} /> 法律文书生成器
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">NDA / MOU / 合同草案</p>
          </button>
          
          <button onClick={() => { setActiveTool('webpage'); setWebResult(null); setWebPublishedUrl(null); router.push('/toolbox'); }} className={`w-full text-left p-3 rounded-xl transition-all ${activeTool === 'webpage' ? 'bg-teal-50 border border-teal-100' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}>
            <h3 className={`text-xs font-bold flex items-center ${activeTool === 'webpage' ? 'text-teal-700' : 'text-gray-700'}`}>
              <Globe className={`w-3.5 h-3.5 mr-2 ${activeTool === 'webpage' ? 'text-teal-500' : 'text-gray-400'}`} /> 宣传页生成器
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">Tailwind 响应式落地页设计</p>
          </button>

          <button onClick={() => { setActiveTool('signature'); router.push('/toolbox'); }} className={`w-full text-left p-3 rounded-xl transition-all ${activeTool === 'signature' ? 'bg-orange-50 border border-orange-100' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}>
            <h3 className={`text-xs font-bold flex items-center ${activeTool === 'signature' ? 'text-orange-700' : 'text-gray-700'}`}>
              <Mail className={`w-3.5 h-3.5 mr-2 ${activeTool === 'signature' ? 'text-orange-500' : 'text-gray-400'}`} /> 邮件签名编辑器
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">全局发信 HTML 签名可视化</p>
          </button>

          {historyItems.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 mt-6">生成历史</h2>
              <div className="space-y-1">
                {historyItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/toolbox?assetId=${item.id}`)}
                    className={`w-full text-left px-3 py-2 flex flex-col gap-1 rounded-lg transition-colors text-xs ${assetId === item.id ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      {item.type === 'PPT' ? <Presentation className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> : <Globe className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <span className="text-[9px] text-gray-400 pl-5">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
        <div className="mt-auto pt-4 border-t border-gray-100 hidden md:block">
          <p className="text-[9px] text-gray-300 px-2">AI 在底层调用相同的入参结构</p>
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto">
        {!activeTool && (
          <div className="h-full flex flex-col items-center justify-center text-center p-10">
            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
              <Wrench className="w-9 h-9 text-indigo-400" />
            </div>
            <h2 className="text-xl font-black text-gray-800 mb-2">选择一个工具开始</h2>
            <p className="text-sm text-gray-400 max-w-md">Toolbox 是人工可视化测试台。在这里验证工具的输入输出后，AI Agent 将以相同的参数协议自动调用。</p>
          </div>
        )}

                {/* ===== SIGNATURE EDITOR ===== */}
        {activeTool === 'signature' && (
          <div className="max-w-6xl mx-auto p-8 pb-20 flex flex-col md:flex-row gap-8 h-full">
            <div className="w-full md:w-[40%] space-y-5 flex-shrink-0">
              <div className="mb-4">
                <h1 className="text-2xl font-black text-gray-900">邮件签名编辑器</h1>
                <p className="text-sm text-gray-400 mt-1">定制全局发信 HTML 签名</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 shadow-sm h-full overflow-y-auto max-h-[70vh]">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Logo 图片</label>
                  <input value={sigForm.logoUrl} onChange={e => setSigForm({...sigForm, logoUrl: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 bg-gray-50 text-gray-500" readOnly />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Slogan</label>
                  <input value={sigForm.slogan} onChange={e => setSigForm({...sigForm, slogan: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">邮箱</label>
                  <input value={sigForm.email} onChange={e => setSigForm({...sigForm, email: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">联系电话</label>
                  <input value={sigForm.phone} onChange={e => setSigForm({...sigForm, phone: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">地址</label>
                  <input value={sigForm.address} onChange={e => setSigForm({...sigForm, address: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-gray-500">社交媒体链接</label>
                    <button onClick={() => setSigForm({...sigForm, socials: [...sigForm.socials, { type: 'linkedin', url: '' }]})} className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded hover:bg-orange-100">+ 添加一条</button>
                  </div>
                  {sigForm.socials.map((s, idx) => (
                    <div key={idx} className="flex gap-2 mb-2 items-center">
                      <select value={s.type} onChange={e => { const ns = [...sigForm.socials]; ns[idx].type = e.target.value; setSigForm({...sigForm, socials: ns}); }} className="border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-orange-400 bg-white">
                        <option value="linkedin">LinkedIn</option>
                        <option value="instagram">Instagram</option>
                        <option value="x">X / Twitter</option>
                        <option value="facebook">Facebook</option>
                        <option value="youtube">YouTube</option>
                        <option value="xiaohongshu">小红书</option>
                      </select>
                      <input value={s.url} onChange={e => { const ns = [...sigForm.socials]; ns[idx].url = e.target.value; setSigForm({...sigForm, socials: ns}); }} placeholder="链接地址..." className="flex-1 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-orange-400" />
                      <button onClick={() => { const ns = [...sigForm.socials]; ns.splice(idx, 1); setSigForm({...sigForm, socials: ns}); }} className="text-gray-300 hover:text-red-500 shrink-0"><XCircle className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {sigForm.socials.length === 0 && <p className="text-[10px] text-gray-400 text-center py-2">暂无社媒链接，点击右上角添加</p>}
                </div>
                
                <button onClick={handleSaveSignature} disabled={sigSaving} className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                  {sigSaving ? <Spin size="small" /> : <Save className="w-4 h-4" />} 保存为全局系统签名
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">保存后，Grace及CRM都会自动读取此签名发信</p>
              </div>
            </div>
            
            <div className="w-full md:w-[60%] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-gray-800">HTML 效果预览</h2>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner p-8 overflow-y-auto max-h-[75vh]">
                {/* 模拟邮件内容 */}
                <div className="mb-8">
                  <p className="text-sm text-gray-800 mb-4">Hello John,</p>
                  <p className="text-sm text-gray-800 mb-4">This is a preview of your email body. Your signature will appear below exactly as configured.</p>
                  <p className="text-sm text-gray-800">Best regards,</p>
                </div>
                <div dangerouslySetInnerHTML={{ __html: generateSignatureHtml() }} />
              </div>
            </div>
          </div>
        )}

        {/* ===== PPT TOOL ===== */}
        {activeTool === 'ppt' && !pptResult && (
          <div className="max-w-3xl mx-auto p-8 pb-20">
            <div className="mb-8">
              <h1 className="text-2xl font-black text-gray-900">PPT 生成器</h1>
              <p className="text-sm text-gray-400 mt-1">填写参数 → AI 生成大纲 → pptxgenjs 渲染物理文件</p>
            </div>

            <div className="space-y-5">
              {/* Step 1 */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">第 1 步：基本信息</h3></div>
                <div className="p-5 space-y-3">
                  <input value={pptForm.topic} onChange={e => setPptForm({...pptForm, topic: e.target.value})} placeholder="演示文稿主题 *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <input value={pptForm.slideCount} onChange={e => setPptForm({...pptForm, slideCount: e.target.value})} placeholder="页数" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400" />
                  <textarea value={pptForm.preferences} onChange={e => setPptForm({...pptForm, preferences: e.target.value})} placeholder="偏好设定（语气、风格、目标受众...）" rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 resize-none" />
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">第 2 步：视觉风格</h3></div>
                <div className="p-5 space-y-4">
                  <p className="text-[11px] font-bold text-gray-500">主题色</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {THEMES.map(t => (
                      <button key={t.id} onClick={() => setPptForm({...pptForm, theme: t.id})} className={`p-3 rounded-xl border-2 text-left transition-all ${pptForm.theme === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <div className="flex gap-1 mb-2">{t.colors.map((c,i) => <div key={i} className="w-3.5 h-3.5 rounded-full" style={{backgroundColor:c}} />)}</div>
                        <span className="text-[10px] font-bold text-gray-700">{t.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-gray-500 mt-4">信息密度</p>
                  <div className="grid grid-cols-2 gap-3">
                    {DENSITIES.map(d => (
                      <button key={d.id} onClick={() => setPptForm({...pptForm, density: d.id})} className={`p-3 rounded-xl border-2 text-left transition-all ${pptForm.density === d.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <span className="text-xs font-bold text-gray-700 block">{d.name}</span>
                        <span className="text-[10px] text-gray-400">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-600">第 3 步：背景资料</h3>
                  <button onClick={() => setKbSelectorTarget('ppt')} className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1"><Database className="w-3 h-3" /> 从知识库选择</button>
                </div>
                <div className="p-5">
                  {pptForm.kbFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {pptForm.kbFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[11px]">
                          <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                          <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setPptForm({...pptForm, kbFiles: pptForm.kbFiles.filter(kf => kf.id !== f.id)})} />
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea value={pptForm.background} onChange={e => setPptForm({...pptForm, background: e.target.value})} placeholder="在此粘贴背景资料、会议纪要、项目描述等..." rows={6} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 resize-none" />
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button onClick={handleGeneratePPT} disabled={!pptForm.topic || pptLoading} className="px-10 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-full shadow-lg shadow-indigo-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
                  {pptLoading ? <><Spin size="small" /> 生成中...</> : <><Presentation className="w-4 h-4" /> 生成 PPT</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PPT Result — WYSIWYG Editor */}
        {activeTool === 'ppt' && pptResult && (() => {
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
              const res = await fetch('/api/toolbox/ppt', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slides, instruction: msg })
              });
              if (res.ok) {
                const data = await res.json();
                if (data.slides) {
                  setPptResult({ ...pptResult, slides: data.slides });
                }
                setPptChatHistory(prev => [...prev, { role: 'bot', content: data.reply || '已更新幻灯片。' }]);
              } else {
                setPptChatHistory(prev => [...prev, { role: 'bot', content: '修改失败，请重试。' }]);
              }
            } catch {
              setPptChatHistory(prev => [...prev, { role: 'bot', content: '网络错误。' }]);
            }
            setPptLoading(false);
          };

          const insertSlideAt = (idx: number) => {
            const ts = Date.now();
            const newSlide = {
              backgroundColor: '#ffffff',
              elements: [
                { id: `title-${ts}`, type: 'TEXT_BOX', content: '新页面标题', x: 10, y: 10, width: 80, height: 15, style: { fontSize: 2.4, fontWeight: 'bold', textAlign: 'left', color: '#000000', backgroundColor: 'transparent', padding: 1, borderRadius: 0 } },
                { id: `body-${ts}`, type: 'TEXT_BOX', content: '在此输入内容...', x: 10, y: 30, width: 80, height: 60, style: { fontSize: 1.1, fontWeight: 'normal', textAlign: 'left', color: '#333333', backgroundColor: 'transparent', padding: 1, borderRadius: 0 } }
              ]
            };
            const ns = [...slides];
            ns.splice(idx, 0, newSlide);
            setPptResult({ ...pptResult, slides: ns });
          };

          return (
          <div className="h-full flex flex-col">
            {/* Top Bar */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => { setPptResult(null); setCurrentSlide(0); setPptChatHistory([]); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><ChevronLeft className="w-4 h-4" /></button>
                <h2 className="text-sm font-black text-gray-900 hidden md:block">{pptForm.topic}</h2>
                {pptLoading && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
              </div>
              <div className="flex bg-gray-100 p-0.5 rounded-xl">
                <button onClick={() => setPptView('presentation')} className={`px-4 py-1 rounded-lg text-[11px] font-black transition-all ${pptView === 'presentation' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>演示文稿</button>
                <button onClick={() => setPptView('outline')} className={`px-4 py-1 rounded-lg text-[11px] font-black transition-all ${pptView === 'outline' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>内容大纲</button>
              </div>
              <div className="flex gap-2">
                <a href={pptResult.fileUrl} download className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 hover:bg-blue-700 shadow-md"><Download className="w-3 h-3" /> 下载PPT</a>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left: Copilot Chat Panel */}
              <div className="hidden md:flex w-[300px] shrink-0 bg-white border-r border-gray-100 flex-col">
                <div className="p-4 border-b border-gray-50">
                  <h3 className="text-sm font-black text-gray-800">修改稿件</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {pptChatHistory.length === 0 && (
                    <div className="text-center text-gray-300 text-xs mt-10">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>输入指令修改幻灯片</p>
                      <p className="mt-1 text-[10px]">如: "在第3页后加一页讲市场分析"</p>
                    </div>
                  )}
                  {pptChatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'bot' && <div className="w-6 h-6 rounded-lg bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white text-[8px] font-bold">AI</div>}
                      <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-xs ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-50 border border-gray-100 text-gray-700'}`}>{msg.content}</div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t bg-white">
                  <div className="relative">
                    <textarea value={pptChatInput} onChange={e => setPptChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && handleCopilotSend()} placeholder="输入指令 (如: '把第2页标题改成...')" rows={2} className="w-full p-3 pr-10 bg-gray-50 border rounded-xl text-xs outline-none resize-none focus:ring-2 focus:ring-indigo-500/20" />
                    <button onClick={handleCopilotSend} className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Send className="w-3 h-3" /></button>
                  </div>
                  <p className="text-[9px] text-gray-300 mt-1 px-1">Cmd + Enter 发送</p>
                </div>
              </div>

              {/* Right: Editor Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {pptView === 'presentation' ? (
                  /* ===== WYSIWYG Presentation Editor ===== */
                  <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Canvas */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex-1 flex items-center justify-center p-4 md:p-10 bg-gray-50 overflow-hidden relative group">
                        <div
                          style={{ backgroundColor: slide?.backgroundColor || '#fff', aspectRatio: '16 / 9' }}
                          className="w-full max-w-[900px] shadow-2xl relative rounded-sm overflow-hidden border border-gray-100"
                          onClick={() => setSelectedElementId(null)}
                        >
                          {slide?.elements?.map((element: any) => (
                            <div
                              key={element.id}
                              onClick={(e) => { e.stopPropagation(); setSelectedElementId(element.id); }}
                              style={{
                                position: 'absolute',
                                left: `${element.x}%`, top: `${element.y}%`,
                                width: `${element.width}%`, height: `${element.height}%`,
                                color: element.style?.color || '#000',
                                backgroundColor: element.style?.backgroundColor || 'transparent',
                                fontSize: `clamp(0.4rem, ${element.style?.fontSize || 1}vw, ${element.style?.fontSize || 1}rem)`,
                                fontWeight: element.style?.fontWeight || 'normal',
                                textAlign: element.style?.textAlign || 'left',
                                padding: `${(element.style?.padding || 0) * 0.5}rem`,
                                borderRadius: `${element.style?.borderRadius || 0}px`,
                                display: 'flex', alignItems: 'center',
                                justifyContent: element.style?.textAlign === 'center' ? 'center' : element.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
                                overflow: 'hidden', transition: 'all 0.1s ease-out',
                              }}
                              className={`cursor-pointer ${selectedElementId === element.id ? 'ring-2 ring-indigo-500 ring-offset-1' : 'hover:ring-1 hover:ring-indigo-300'}`}
                            >
                              <div className="w-full h-full whitespace-pre-wrap leading-snug">{element.content}</div>
                            </div>
                          ))}
                        </div>
                        {/* BG Color Float */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur p-1 rounded-lg shadow border border-white opacity-0 group-hover:opacity-100 transition-all">
                          <span className="text-[8px] font-bold text-gray-400 px-1">BG</span>
                          <input type="color" value={slide?.backgroundColor || '#ffffff'} onChange={e => { const ns = [...slides]; ns[currentSlide].backgroundColor = e.target.value; setPptResult({...pptResult, slides: ns}); }} className="w-6 h-6 rounded-full cursor-pointer border border-gray-100 bg-transparent" />
                        </div>
                      </div>
                      {/* Bottom Nav */}
                      <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-center gap-4 px-4 shrink-0">
                        <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="p-2 rounded-full bg-gray-50 text-gray-400 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-20"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-xs font-black text-gray-900">{currentSlide + 1} / {slides.length}</span>
                        <button onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))} disabled={currentSlide === slides.length - 1} className="p-2 rounded-full bg-gray-50 text-gray-400 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-20"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    </div>

                    {/* Property Panel */}
                    {selectedElement && (
                      <aside className="hidden md:flex w-[260px] bg-white border-l border-gray-100 flex-col shadow-lg shrink-0">
                        <div className="p-4 border-b flex items-center justify-between">
                          <h3 className="font-black text-gray-900 text-xs">元素编辑器</h3>
                          <button onClick={() => setSelectedElementId(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"><XCircle className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                          {/* Layout */}
                          <div className="border-b pb-3">
                            <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Layout</span>
                            </div>
                            <div className="px-3 grid grid-cols-2 gap-3">
                              {(['x', 'y', 'width', 'height'] as const).map(key => (
                                <div key={key} className="space-y-0.5">
                                  <label className="text-[8px] font-bold text-gray-400 uppercase">{key} (%)</label>
                                  <input type="number" value={selectedElement[key]} onChange={e => updateElement(selectedElementId!, { [key]: +e.target.value })} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none focus:border-indigo-500" />
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Text */}
                          <div className="border-b pb-3 pt-2">
                            <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Text</span>
                            </div>
                            <div className="px-3 space-y-3">
                              <div className="space-y-0.5">
                                <label className="text-[8px] font-bold text-gray-400 uppercase">Size (rem)</label>
                                <input type="number" step="0.1" value={selectedElement.style?.fontSize || 1} onChange={e => updateStyle('fontSize', +e.target.value)} className="w-full p-1.5 bg-white border rounded-lg text-xs outline-none" />
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateStyle('fontWeight', selectedElement.style?.fontWeight === 'bold' ? 'normal' : 'bold')} className={`flex-1 p-2 rounded-lg border flex justify-center text-xs transition-all ${selectedElement.style?.fontWeight === 'bold' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-400'}`}>B</button>
                                <div className="flex bg-gray-100 p-0.5 rounded-lg flex-[2]">
                                  {(['left','center','right'] as const).map(a => (
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
                          {/* Style */}
                          <div className="pt-2">
                            <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50 rounded-lg mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Style</span>
                            </div>
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
                  /* ===== Outline Editor ===== */
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/30">
                    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-10">
                      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-50">
                        <h2 className="text-lg font-black text-gray-900">内容大纲</h2>
                        <button onClick={() => insertSlideAt(slides.length)} className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold shadow hover:bg-indigo-700">
                          <Plus className="w-3 h-3" /> 尾部添加
                        </button>
                      </div>
                      <div className="space-y-3">
                        {slides.map((s: any, sIdx: number) => (
                          <React.Fragment key={s.elements?.[0]?.id || sIdx}>
                            {/* Insert button between slides */}
                            <div className="flex justify-center -my-1 opacity-0 hover:opacity-100 transition-opacity relative z-10">
                              <button onClick={() => insertSlideAt(sIdx)} className="bg-indigo-600 text-white p-0.5 rounded-full shadow hover:scale-125 transition-transform"><Plus className="w-3 h-3" /></button>
                            </div>
                            <div
                              draggable
                              onDragStart={() => setDragIdx(sIdx)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={() => { if (dragIdx === null || dragIdx === sIdx) return; const ns = [...slides]; const [m] = ns.splice(dragIdx, 1); ns.splice(sIdx, 0, m); setPptResult({...pptResult, slides: ns}); setDragIdx(null); }}
                              className={`group relative p-5 bg-white border rounded-xl transition-all flex gap-4 ${dragIdx === sIdx ? 'opacity-30 border-dashed border-indigo-400' : 'border-gray-100 hover:border-indigo-400 hover:shadow-lg'}`}
                            >
                              <div className="flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing pt-1">
                                <div className="text-[9px] font-black text-gray-400 w-5 h-5 rounded-full border border-gray-100 flex items-center justify-center">{sIdx + 1}</div>
                                <span className="text-gray-200 text-[10px]">⋮⋮</span>
                              </div>
                              <div className="flex-1 space-y-3">
                                {s.elements?.slice(0, 2).map((el: any, eIdx: number) => (
                                  <textarea
                                    key={el.id}
                                    value={el.content}
                                    onChange={e => {
                                      const ns = [...slides];
                                      ns[sIdx].elements[eIdx] = { ...ns[sIdx].elements[eIdx], content: e.target.value };
                                      setPptResult({...pptResult, slides: ns});
                                    }}
                                    className={`w-full p-3 bg-gray-50/50 border border-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/10 transition-all text-gray-800 resize-none ${eIdx === 0 ? 'font-bold text-sm h-12' : 'text-xs h-24 leading-relaxed'}`}
                                    placeholder={eIdx === 0 ? '幻灯片标题...' : '输入内容要点...'}
                                  />
                                ))}
                              </div>
                              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { const ns = [...slides]; ns.splice(sIdx, 1); setPptResult({...pptResult, slides: ns}); if (currentSlide >= ns.length) setCurrentSlide(Math.max(0, ns.length - 1)); }} className="p-1.5 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
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
        })()}









        {/* ===== LEGAL TOOL ===== */}
        {activeTool === 'legal' && !legalResult && (
          <div className="max-w-3xl mx-auto p-8 pb-20">
            <div className="mb-8">
              <h1 className="text-2xl font-black text-gray-900">法律文书生成器</h1>
              <p className="text-sm text-gray-400 mt-1">选择文书类型 → 填写各方信息 → 生成专业法律文书</p>
            </div>

            <div className="space-y-5">
              {/* Doc Type */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">文书类型</h3></div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {DOC_TYPES.map(t => (
                      <button key={t} onClick={() => setLegalForm({...legalForm, docType: t})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${legalForm.docType === t ? 'bg-violet-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">各方信息</h3></div>
                <div className="p-5 space-y-3">
                  <input value={legalForm.partyA} onChange={e => setLegalForm({...legalForm, partyA: e.target.value})} placeholder="甲方 (Party A) *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400" />
                  <input value={legalForm.partyB} onChange={e => setLegalForm({...legalForm, partyB: e.target.value})} placeholder="乙方 (Party B)" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400" />
                </div>
              </div>

              {/* Key Terms */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">核心条款</h3></div>
                <div className="p-5">
                  <textarea value={legalForm.keyTerms} onChange={e => setLegalForm({...legalForm, keyTerms: e.target.value})} placeholder="核心条款描述（如：分成比例6:4、有效期3年、违约金10万）" rows={4} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
                </div>
              </div>

              {/* Style */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">模板风格</h3></div>
                <div className="p-5">
                  <div className="flex gap-2">
                    {STYLES.map(s => (
                      <button key={s} onClick={() => setLegalForm({...legalForm, templateStyle: s})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${legalForm.templateStyle === s ? 'bg-violet-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Background */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-600">背景资料（可选）</h3>
                  <button onClick={() => setKbSelectorTarget('legal')} className="text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded hover:bg-violet-100 flex items-center gap-1"><Database className="w-3 h-3" /> 从知识库选择</button>
                </div>
                <div className="p-5">
                  {legalForm.kbFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {legalForm.kbFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 px-2 py-1 rounded-md text-[11px]">
                          <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                          <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setLegalForm({...legalForm, kbFiles: legalForm.kbFiles.filter(kf => kf.id !== f.id)})} />
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea value={legalForm.background} onChange={e => setLegalForm({...legalForm, background: e.target.value})} placeholder="补充商业背景、谈判要点等" rows={4} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button onClick={handleGenerateLegal} disabled={!legalForm.partyA || legalLoading} className="px-10 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-full shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
                  {legalLoading ? <><Spin size="small" /> 生成中...</> : <><FileText className="w-4 h-4" /> 生成文书</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legal Result */}
        {activeTool === 'legal' && legalResult && (
          <div className="h-full flex flex-col">
            <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">{legalForm.docType} — 生成完毕</h2>
                <p className="text-xs text-gray-400">甲方: {legalForm.partyA} | 乙方: {legalForm.partyB || '未指定'}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setLegalResult(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200">重新生成</button>
                <button onClick={() => { navigator.clipboard.writeText(legalResult); alert('已复制到剪贴板'); }} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-violet-700 shadow-md">
                  <FileText className="w-3.5 h-3.5" /> 复制全文
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-100 p-8 shadow-sm">
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: marked(legalResult) as string }} />
              </div>
            </div>
          </div>
        )}

        {/* ===== WEBPAGE TOOL - FORM ===== */}
        {activeTool === 'webpage' && !webResult && (
          <div className="max-w-3xl mx-auto p-8 pb-20">
            <div className="mb-8">
              <h1 className="text-2xl font-black text-gray-900">宣传页生成器</h1>
              <p className="text-sm text-gray-400 mt-1">输入主题 &rarr; AI 生成精美的多页营销宣传网站</p>
            </div>
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">宣传主题 *</h3></div>
                <div className="p-5">
                  <input value={webForm.topic} onChange={e => setWebForm({...webForm, topic: e.target.value})} placeholder="例如：Myddelton College 2025 招生宣传" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400" />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">设计风格</h3></div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {[{id:'education',name:'教育学术',desc:'蓝调 · 可信赖'},{id:'modern-tech',name:'现代科技',desc:'暗色 · 渐变'},{id:'business',name:'商务简约',desc:'白底 · 高端'}].map(s => (
                      <button key={s.id} onClick={() => setWebForm({...webForm, style: s.id})} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${webForm.style === s.id ? 'bg-teal-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                    {['1','2','3','4','5'].map(n => (
                      <button key={n} onClick={() => setWebForm({...webForm, pageCount: n})} className={`w-12 h-10 rounded-lg text-sm font-bold transition-all ${webForm.pageCount === n ? 'bg-teal-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-600">背景资料（可选）</h3>
                  <button onClick={() => setKbSelectorTarget('webpage')} className="text-[11px] font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded hover:bg-teal-100 flex items-center gap-1"><Database className="w-3 h-3" /> 从知识库选择</button>
                </div>
                <div className="p-5">
                  {webForm.kbFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {webForm.kbFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-1 bg-teal-50 border border-teal-100 text-teal-700 px-2 py-1 rounded-md text-[11px]">
                          <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                          <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setWebForm({...webForm, kbFiles: webForm.kbFiles.filter(kf => kf.id !== f.id)})} />
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea value={webForm.background} onChange={e => setWebForm({...webForm, background: e.target.value})} placeholder="粘贴关于项目的背景资料、课程介绍、学校特色等" rows={5} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">额外要求（可选）</h3></div>
                <div className="p-5">
                  <textarea value={webForm.preferences} onChange={e => setWebForm({...webForm, preferences: e.target.value})} placeholder="例如：需要中英双语、突出奖学金信息、包含申请流程等" rows={3} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-teal-400 resize-none" />
                </div>
              </div>
              <div className="flex justify-center pt-4">
                <button onClick={async () => {
                  setWebLoading(true); setWebResult(null);
                  try {
                    const res = await fetch('/api/toolbox/webpage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...webForm, kbFileIds: webForm.kbFiles.map(f => f.id) }) });
                    const data = await res.json();
                    if (data.success && data.site) {
                      setWebResult(data.site);
                      setWebActivePageId(data.site.pages?.[0]?.id || '');
                      setWebChatHistory([{ role: 'bot', content: `已生成 ${data.site.pages?.length || 0} 个页面的宣传站点。\n\n你可以在右侧输入修改指令，或切换到手动模式直接编辑内容。\n\n💡 点击页面中的图片占位区域可以替换为真实图片。` }]);
                    } else { alert(data.error || '生成失败'); }
                  } catch { alert('网络错误'); }
                  setWebLoading(false);
                }} disabled={!webForm.topic || webLoading} className="px-10 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-full shadow-lg shadow-teal-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
                  {webLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中（约30-60秒）...</> : <><Globe className="w-4 h-4" /> 生成宣传页</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== WEBPAGE TOOL - EDITOR/PREVIEW ===== */}
        {activeTool === 'webpage' && webResult && (() => {
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
                            <button onClick={e => { e.stopPropagation(); setWebResult({...webResult, pages: webResult.pages.filter(p => p.id !== page.id)}); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500">
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
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (webChatInput.trim()) {
                            const msg = webChatInput;
                            setWebChatHistory(prev => [...prev, { role: 'user', content: msg }]);
                            setWebChatInput('');
                            setWebChatLoading(true);
                            fetch('/api/toolbox/webpage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ topic: webResult.name, background: `Current site JSON:\n${JSON.stringify(webResult, null, 2)}`,
                                preferences: `User modification request: ${msg}\n\nIMPORTANT: Keep the same site structure. Only modify based on the user request. Return the FULL updated site JSON.`,
                                pageCount: String(webResult.pages.length), style: webForm.style })
                            }).then(r => r.json()).then(data => {
                              if (data.success && data.site) { setWebResult(data.site); setWebChatHistory(prev => [...prev, { role: 'bot', content: '✅ 已更新！请查看预览。' }]); }
                              else { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 修改失败: ${data.error || '未知错误'}` }]); }
                              setWebChatLoading(false);
                            }).catch(err => { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 网络错误` }]); setWebChatLoading(false); });
                          }}}}
                          placeholder="输入修改指令..." rows={2}
                          className="w-full p-3 pr-12 border border-gray-200 rounded-2xl text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none bg-white" />
                        <button onClick={() => {
                          const msg = webChatInput;
                          if (!msg.trim()) return;
                          setWebChatHistory(prev => [...prev, { role: 'user', content: msg }]);
                          setWebChatInput('');
                          setWebChatLoading(true);
                          fetch('/api/toolbox/webpage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ topic: webResult.name, background: `Current site JSON:\n${JSON.stringify(webResult, null, 2)}`,
                              preferences: `User modification request: ${msg}\n\nIMPORTANT: Keep the same site structure. Only modify based on the user request. Return the FULL updated site JSON.`,
                              pageCount: String(webResult.pages.length), style: webForm.style })
                          }).then(r => r.json()).then(data => {
                            if (data.success && data.site) { setWebResult(data.site); setWebChatHistory(prev => [...prev, { role: 'bot', content: '✅ 已更新！请查看预览。' }]); }
                            else { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 修改失败` }]); }
                            setWebChatLoading(false);
                          }).catch(() => { setWebChatHistory(prev => [...prev, { role: 'bot', content: `❌ 网络错误` }]); setWebChatLoading(false); });
                        }} disabled={webChatLoading || !webChatInput.trim()}
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
        })()}
      </div>
      
      {/* KB Selector Modal */}
      {kbSelectorTarget && (
        <KbFileSelector 
          isOpen={true} 
          onClose={() => setKbSelectorTarget(null)}
          initialSelected={kbSelectorTarget === 'ppt' ? pptForm.kbFiles : kbSelectorTarget === 'legal' ? legalForm.kbFiles : webForm.kbFiles}
          onConfirm={(files) => {
            if (kbSelectorTarget === 'ppt') setPptForm({...pptForm, kbFiles: files});
            else if (kbSelectorTarget === 'legal') setLegalForm({...legalForm, kbFiles: files});
            else if (kbSelectorTarget === 'webpage') setWebForm({...webForm, kbFiles: files});
            setKbSelectorTarget(null);
          }} 
        />
      )}
    </div>
  );
}

export default function ToolboxPage() {
  const { pendingPptData, setPendingPptData } = useWorkspace();
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
      <ToolboxView initialPpt={pendingPptData} onPptConsumed={() => setPendingPptData(null)} />
    </Suspense>
  );
}