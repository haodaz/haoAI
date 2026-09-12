'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Presentation, Briefcase, FileText, Globe, BookOpen, DollarSign, Mail,
  Clock, ArrowRight, Sparkles, Zap, ChevronRight
} from 'lucide-react';

const TOOLS = [
  {
    id: 'ppt', path: '/toolbox/ppt', label: 'PPT Generator',
    desc: 'Create stunning slide decks with AI-powered content and professional layouts',
    icon: Presentation,
    gradient: 'from-indigo-500 to-violet-600',
    borderHover: 'hover:border-indigo-200',
    shadowHover: 'hover:shadow-indigo-100',
  },
  {
    id: 'proposal', path: '/toolbox/proposal', label: 'Proposal Writer',
    desc: 'Generate customised business proposals with school-specific intelligence',
    icon: Briefcase,
    gradient: 'from-blue-500 to-cyan-600',
    borderHover: 'hover:border-blue-200',
    shadowHover: 'hover:shadow-blue-100',
  },
  {
    id: 'legal', path: '/toolbox/legal', label: 'Legal Documents',
    desc: 'Draft NDA, MOU, Service Agreements with standard protective clauses',
    icon: FileText,
    gradient: 'from-violet-500 to-purple-600',
    borderHover: 'hover:border-violet-200',
    shadowHover: 'hover:shadow-violet-100',
  },
  {
    id: 'webpage', path: '/toolbox/webpage', label: 'Website Builder',
    desc: 'Build responsive multi-page websites with Tailwind CSS and brand identity',
    icon: Globe,
    gradient: 'from-teal-500 to-emerald-600',
    borderHover: 'hover:border-teal-200',
    shadowHover: 'hover:shadow-teal-100',
  },
  {
    id: 'brochure', path: '/toolbox/brochure', label: 'Brochure Design',
    desc: 'Design marketing flyers and brochures with rich visual layouts',
    icon: BookOpen,
    gradient: 'from-emerald-500 to-green-600',
    borderHover: 'hover:border-emerald-200',
    shadowHover: 'hover:shadow-emerald-100',
  },
  {
    id: 'finance', path: '/toolbox/finance', label: 'Finance Tool',
    desc: 'Generate invoices, commission reports and financial summaries',
    icon: DollarSign,
    gradient: 'from-cyan-500 to-sky-600',
    borderHover: 'hover:border-cyan-200',
    shadowHover: 'hover:shadow-cyan-100',
  },
  {
    id: 'signature', path: '/toolbox/signature', label: 'Email Signature',
    desc: 'Design and manage global HTML email signatures for the team',
    icon: Mail,
    gradient: 'from-orange-500 to-amber-600',
    borderHover: 'hover:border-orange-200',
    shadowHover: 'hover:shadow-orange-100',
  },
];

const TYPE_ICON: Record<string, { icon: any; gradient: string; label: string }> = {
  PROPOSAL: { icon: Briefcase, gradient: 'from-blue-500 to-cyan-600', label: 'Proposal' },
  LEGAL: { icon: FileText, gradient: 'from-violet-500 to-purple-600', label: 'Legal' },
  PPT: { icon: Presentation, gradient: 'from-indigo-500 to-violet-600', label: 'PPT' },
  WEB: { icon: Globe, gradient: 'from-teal-500 to-emerald-600', label: 'Website' },
  FINANCE: { icon: DollarSign, gradient: 'from-cyan-500 to-sky-600', label: 'Finance' },
  BROCHURE: { icon: BookOpen, gradient: 'from-emerald-500 to-green-600', label: 'Brochure' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export default function ToolboxDashboard() {
  const router = useRouter();
  const [recentAssets, setRecentAssets] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });

  useEffect(() => {
    fetch('/api/toolbox/assets?limit=8')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRecentAssets(data);
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          setStats({
            total: data.length,
            thisWeek: data.filter((a: any) => new Date(a.createdAt).getTime() > weekAgo).length,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-8">

        {/* Hero Section */}
        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-[0.06]">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-emerald-500/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-indigo-500/15 to-transparent rounded-full blur-3xl" />
          
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/10">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">Creative Workbench</h1>
              </div>
              <p className="text-sm text-gray-400 max-w-lg leading-relaxed">
                AI-powered tools for document generation, design, and business intelligence.
                Select any tool below to start creating.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="text-right px-5 py-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
                <p className="text-2xl font-black text-white">{stats.total || '\u2014'}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Recent Files</p>
              </div>
              <div className="text-right px-5 py-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
                <p className="text-2xl font-black text-emerald-400">{stats.thisWeek || '\u2014'}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">This Week</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
          {TOOLS.map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => router.push(tool.path)}
                className={`group text-left p-5 rounded-2xl border border-gray-100 bg-white transition-all duration-300 ${tool.borderHover} ${tool.shadowHover} hover:shadow-xl hover:-translate-y-0.5`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                {/* Label */}
                <h3 className="text-[15px] font-black text-gray-800 mb-1.5 group-hover:text-gray-900 transition-colors">
                  {tool.label}
                </h3>
                {/* Description */}
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                  {tool.desc}
                </p>
                {/* Hover arrow */}
                <div className="flex items-center gap-1 mt-4 text-[11px] font-bold text-gray-300 group-hover:text-gray-500 transition-colors">
                  Open tool <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Recent Activity */}
        {recentAssets.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                Recent Activity
              </h2>
              <button
                onClick={() => router.push('/toolbox/history')}
                className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
              >
                View All <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {recentAssets.map((asset, idx) => {
                const tc = TYPE_ICON[asset.type] || TYPE_ICON['LEGAL'];
                const Icon = tc.icon;
                const isLast = idx === recentAssets.length - 1;
                return (
                  <button
                    key={asset.id}
                    onClick={() => router.push('/toolbox/history')}
                    className={`w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/80 transition-all group ${!isLast ? 'border-b border-gray-50' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${tc.gradient} flex items-center justify-center shrink-0 shadow-md`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate group-hover:text-gray-900">{asset.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{tc.label}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-gray-400 font-medium">{timeAgo(asset.createdAt)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 mb-4 text-center">
          <p className="text-[11px] text-gray-300 font-medium">
            Powered by Bristh AI Engine &mdash; Tools can also be invoked automatically by Virtual Office agents
          </p>
        </div>
      </div>
    </div>
  );
}