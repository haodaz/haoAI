'use client';
import React, { Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Spin } from 'antd';
import { Presentation, FileText, Globe, Mail, Briefcase } from 'lucide-react';

const TOOLS = [
  { id: 'ppt', path: '/toolbox/ppt', label: 'PPT 生成器', desc: '物理渲染出可下载 .pptx 文件', icon: Presentation, color: 'indigo' },
  { id: 'proposal', path: '/toolbox/proposal', label: 'Proposal 写作', desc: '定制化业务提案与合同草案', icon: Briefcase, color: 'blue' },
  { id: 'legal', path: '/toolbox/legal', label: '法律文书生成器', desc: 'NDA / MOU / 合同草案', icon: FileText, color: 'violet' },
  { id: 'webpage', path: '/toolbox/webpage', label: '宣传页生成器', desc: 'Tailwind 响应式落地页设计', icon: Globe, color: 'teal' },
  { id: 'signature', path: '/toolbox/signature', label: '邮件签名编辑器', desc: '全局发信 HTML 签名可视化', icon: Mail, color: 'orange' },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', icon: 'text-indigo-500' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', icon: 'text-blue-500' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', icon: 'text-violet-500' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-100', text: 'text-teal-700', icon: 'text-teal-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', icon: 'text-orange-500' },
};

export default function ToolboxLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active tool from pathname
  const activeTool = TOOLS.find(t => pathname?.startsWith(t.path))?.id || null;

  return (
    <div className="w-full h-full bg-[#f8f9fc] flex flex-col md:flex-row overflow-hidden">
      {/* Tool Sidebar */}
      <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200/80 flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">生成工具</h2>
          {TOOLS.map(tool => {
            const isActive = activeTool === tool.id;
            const colors = COLOR_MAP[tool.color];
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => router.push(tool.path)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  isActive ? `${colors.bg} border ${colors.border}` : 'bg-white border border-gray-100 hover:bg-gray-50'
                }`}
              >
                <h3 className={`text-xs font-bold flex items-center ${isActive ? colors.text : 'text-gray-700'}`}>
                  <Icon className={`w-3.5 h-3.5 mr-2 ${isActive ? colors.icon : 'text-gray-400'}`} />
                  {tool.label}
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">{tool.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-auto pt-4 border-t border-gray-100 hidden md:block">
          <p className="text-[9px] text-gray-300 px-2">AI 在底层调用相同的入参结构</p>
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
