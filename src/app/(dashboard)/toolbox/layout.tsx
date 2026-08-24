'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Spin } from 'antd';
import { Presentation, FileText, Globe, Mail, Briefcase, History, Clock, ChevronRight } from 'lucide-react';

const TOOLS = [
  { id: 'ppt', path: '/toolbox/ppt', label: 'PPT 生成器', desc: '物理渲染出可下载 .pptx 文件', icon: Presentation, color: 'indigo' },
  { id: 'proposal', path: '/toolbox/proposal', label: 'Proposal 写作', desc: '定制化业务提案与合同草案', icon: Briefcase, color: 'blue' },
  { id: 'legal', path: '/toolbox/legal', label: '法律文书生成器', desc: 'NDA / MOU / 合同草案', icon: FileText, color: 'violet' },
  { id: 'webpage', path: '/toolbox/webpage', label: '宣传页生成器', desc: 'Tailwind 响应式落地页设计', icon: Globe, color: 'teal' },
  { id: 'signature', path: '/toolbox/signature', label: '邮件签名编辑器', desc: '全局发信 HTML 签名可视化', icon: Mail, color: 'orange' },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', icon: 'text-indigo-500' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   icon: 'text-blue-500' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', icon: 'text-violet-500' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-teal-700',   icon: 'text-teal-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', icon: 'text-orange-500' },
};

const TYPE_ICON: Record<string, { icon: any; color: string }> = {
  PROPOSAL: { icon: Briefcase,     color: 'text-blue-500' },
  LEGAL:    { icon: FileText,      color: 'text-violet-500' },
  PPT:      { icon: Presentation,  color: 'text-indigo-500' },
  WEB:      { icon: Globe,         color: 'text-teal-500' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ToolboxLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [recentAssets, setRecentAssets] = useState<any[]>([]);

  const activeTool = TOOLS.find(t => pathname?.startsWith(t.path))?.id || null;
  const isHistory = pathname?.startsWith('/toolbox/history');

  useEffect(() => {
    fetch('/api/toolbox/assets?limit=10')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRecentAssets(data); })
      .catch(() => {});
  }, [pathname]); // Re-fetch when navigating (catches new generations)

  return (
    <div className="w-full h-full bg-[#f8f9fc] flex flex-col md:flex-row overflow-hidden">
      {/* Tool Sidebar */}
      <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200/80 flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 space-y-1.5 flex-1 overflow-y-auto">
          {/* Tools section */}
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">生成工具</h2>
          {TOOLS.map(tool => {
            const isActive = activeTool === tool.id;
            const colors = COLOR_MAP[tool.color];
            const Icon = tool.icon;
            return (
              <button key={tool.id} onClick={() => router.push(tool.path)}
                className={`w-full text-left p-2.5 rounded-xl transition-all ${
                  isActive ? `${colors.bg} border ${colors.border}` : 'bg-white border border-gray-100 hover:bg-gray-50'
                }`}>
                <h3 className={`text-xs font-bold flex items-center ${isActive ? colors.text : 'text-gray-700'}`}>
                  <Icon className={`w-3.5 h-3.5 mr-2 ${isActive ? colors.icon : 'text-gray-400'}`} />
                  {tool.label}
                </h3>
              </button>
            );
          })}

          {/* History entry */}
          <div className="pt-3 mt-1 border-t border-gray-100">
            <button onClick={() => router.push('/toolbox/history')}
              className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between ${
                isHistory ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100 text-gray-700 hover:bg-gray-50'
              }`}>
              <span className="text-xs font-bold flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> 工具历史
              </span>
              <ChevronRight className="w-3 h-3 opacity-50" />
            </button>
          </div>

          {/* Recent generations */}
          {recentAssets.length > 0 && (
            <div className="pt-3 mt-1 border-t border-gray-100">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 最近生成
              </h2>
              <div className="space-y-1">
                {recentAssets.map(asset => {
                  const tc = TYPE_ICON[asset.type] || TYPE_ICON['LEGAL'];
                  const Icon = tc.icon;
                  return (
                    <button key={asset.id}
                      onClick={() => router.push('/toolbox/history')}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-all group">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3 h-3 shrink-0 ${tc.color}`} />
                        <span className="text-[11px] text-gray-700 truncate flex-1 group-hover:text-gray-900">{asset.title}</span>
                        <span className="text-[9px] text-gray-400 shrink-0">{timeAgo(asset.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spin /></div>}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
