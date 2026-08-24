'use client';
import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import { FileText, Briefcase, Presentation, Globe, Clock, Search, Eye, X } from 'lucide-react';

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; path: string }> = {
  PROPOSAL: { label: 'Proposal', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50', path: '/toolbox/proposal' },
  LEGAL:    { label: '法律文书', icon: FileText, color: 'text-violet-600', bg: 'bg-violet-50', path: '/toolbox/legal' },
  PPT:      { label: 'PPT', icon: Presentation, color: 'text-indigo-600', bg: 'bg-indigo-50', path: '/toolbox/ppt' },
  WEB:      { label: '宣传页', icon: Globe, color: 'text-teal-600', bg: 'bg-teal-50', path: '/toolbox/webpage' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function HistoryPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [preview, setPreview] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/toolbox/assets')
      .then(r => r.json())
      .then(data => { setAssets(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = assets.filter(a => {
    const matchType = filterType === 'ALL' || a.type === filterType;
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">工具历史</h1>
        <p className="text-sm text-gray-400 mt-1">所有通过工具生成的文档、提案和演示文稿</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索标题..." className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white" />
        </div>
        <div className="flex gap-2">
          {['ALL', 'PROPOSAL', 'LEGAL', 'PPT', 'WEB'].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${filterType === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'ALL' ? '全部' : TYPE_CONFIG[t]?.label || t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">📂</div>
          <div className="text-gray-400 text-sm">{search ? '没有匹配的记录' : '还没有生成历史，去使用工具生成第一份文档吧！'}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => {
            const cfg = TYPE_CONFIG[asset.type] || TYPE_CONFIG['LEGAL'];
            const Icon = cfg.icon;
            let payload: any = {};
            try { payload = JSON.parse(asset.payload); } catch {}
            const preview_text = payload.content?.slice(0, 120).replace(/[#*`]/g, '') || '';
            return (
              <div key={asset.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                </div>
                <h3 className="font-bold text-sm text-gray-900 mb-1 line-clamp-2">{asset.title}</h3>
                {preview_text && <p className="text-[11px] text-gray-400 line-clamp-2 mb-3">{preview_text}…</p>}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />
                    {timeAgo(asset.createdAt)}
                  </div>
                  <button onClick={() => setPreview(asset)}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> 查看
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (() => {
        const cfg = TYPE_CONFIG[preview.type] || TYPE_CONFIG['LEGAL'];
        let payload: any = {};
        try { payload = JSON.parse(preview.payload); } catch {}
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
                <div>
                  <h2 className="font-black text-gray-900">{preview.title}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{cfg.label} · {new Date(preview.createdAt).toLocaleString('zh-CN')}</p>
                </div>
                <button onClick={() => setPreview(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {payload.content ? (
                  <div className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: marked(payload.content) as string }} />
                ) : (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">{preview.payload}</pre>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
