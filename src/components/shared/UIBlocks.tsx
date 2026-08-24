import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Activity, CheckCircle, XCircle, Hourglass } from 'lucide-react';
import { marked } from 'marked';

export const COLOR_BORDER_MAP: Record<string, { color: string; shadow: string }> = {
  blue: { color: 'border-blue-500', shadow: 'shadow-blue-500/20' },
  emerald: { color: 'border-emerald-500', shadow: 'shadow-emerald-500/20' },
  purple: { color: 'border-purple-500', shadow: 'shadow-purple-500/20' },
  red: { color: 'border-red-500', shadow: 'shadow-red-500/20' },
  amber: { color: 'border-amber-500', shadow: 'shadow-amber-500/20' },
  cyan: { color: 'border-cyan-500', shadow: 'shadow-cyan-500/20' },
  pink: { color: 'border-pink-500', shadow: 'shadow-pink-500/20' },
  indigo: { color: 'border-indigo-500', shadow: 'shadow-indigo-500/20' },
  teal: { color: 'border-teal-500', shadow: 'shadow-teal-500/20' },
  rose: { color: 'border-rose-500', shadow: 'shadow-rose-500/20' },
};

export function renderPreviewStandalone(payload: string | null) {
  if (!payload) return <div className="text-gray-400">No output generated.</div>;
  if (payload.trim().startsWith('{') || payload.trim().startsWith('[')) {
    try {
      const json = JSON.parse(payload);
      if (json.content) {
        return (
          <div>
            <p className="text-xs font-bold text-gray-500 mb-3">{json.summary}</p>
            {json.assetId && (
              <div className="mb-4">
                <a href={`/toolbox/ppt?assetId=${json.assetId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition-colors">
                  前往工作台查看/编辑完整生成结果 →
                </a>
              </div>
            )}
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(json.content) }} />
          </div>
        );
      }
      if (json.summary) return (
        <div className="text-sm text-gray-700">
          <p className="font-bold mb-2">{json.summary}</p>
          {json.assetId && (
            <div className="mt-4 mb-4">
              <a href={`/toolbox/ppt?assetId=${json.assetId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition-colors">
                前往工作台查看/编辑完整生成结果 →
              </a>
            </div>
          )}
          {json.fileUrl && <a href={json.fileUrl} download className="text-blue-600 underline text-xs inline-block mt-2">下载文件</a>}
        </div>
      );
    } catch {}
  }
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(payload) }} />;
}

export function ThinkBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-3">
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center text-xs font-bold text-gray-500 cursor-pointer hover:text-gray-700 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
        已完成思考, 耗时 3s
      </div>
      {expanded && (
        <div 
          className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-600 font-mono prose prose-sm max-w-none prose-p:my-1"
          dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
        />
      )}
    </div>
  );
}

export function ToolCallsBlock({ calls }: { calls: any[] }) {
  if (!calls || calls.length === 0) return null;
  return (
    <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-center text-xs font-bold text-gray-700 mb-2">
        <Activity className="w-3 h-3 mr-1 text-blue-500" /> 正在并发调度工具...
      </div>
      <div className="space-y-1.5 mt-2">
        {calls.map((call, idx) => (
          <div key={idx} className="text-xs text-gray-600 font-mono">
            <span className="font-bold text-gray-800 mr-2">● 工具调度专线「{call.tool}」</span>
            {call.logs.map((log: string, lIdx: number) => (
              <div key={lIdx} className="flex items-start mt-1 ml-4">
                {log.includes('✅') || log.includes('成功') ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mr-1.5 mt-0.5 shrink-0" />
                ) : log.includes('❌') || log.includes('失败') ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500 mr-1.5 mt-0.5 shrink-0" />
                ) : (
                  <Hourglass className="w-3.5 h-3.5 text-amber-600 mr-1.5 mt-0.5 shrink-0 animate-pulse" />
                )}
                <span>{log.replace(/✅|❌|⏳/g, '')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
