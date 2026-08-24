'use client';
import React, { useState } from 'react';
import { Spin } from 'antd';
import { marked } from 'marked';
import { FileText, Database, X, CheckCircle, Clock, Scale } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

const DOC_TYPES = ['NDA', 'MOU', '服务协议', '合作合同', '劳动合同'];
const STYLES = ['标准英式', '中英双语', '简约版'];

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  NDA: '保密协议 — 规范双方保密义务与违约责任',
  MOU: '谅解备忘录 — 非约束性合作框架',
  '服务协议': '服务协议 — 明确服务范围、费用与交付',
  '合作合同': '合作合同 — 利润分配、退出与决策机制',
  '劳动合同': '劳动合同 — 职责、薪酬与竞业限制',
};

export default function LegalPage() {
  const [form, setForm] = useState({
    docType: 'NDA', partyA: '', partyB: '',
    keyTerms: '', background: '', templateStyle: '标准英式',
    kbFiles: [] as KbFile[]
  });
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [logs, setLogs] = useState<{ step: string; message: string }[]>([]);

  const handleGenerate = async () => {
    setLoading(true);
    setResult('');
    setLogs([]);
    try {
      const res = await fetch('/api/toolbox/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, kbFileIds: form.kbFiles.map(f => f.id) })
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let text = '';
      while (!done) {
        const { value, done: dr } = await reader.read();
        done = dr;
        if (value) {
          const lines = decoder.decode(value, { stream: true }).split('\n\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'log') setLogs(p => [...p, data.data]);
              else if (data.type === 'ai_chunk') { text += data.data; setResult(text); }
              else if (data.type === 'error') alert(`错误: ${data.data.message}`);
            } catch { /* ignore */ }
          }
        }
      }
    } catch { alert('Network error'); }
    setLoading(false);
  };

  if (result || loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              <Scale className="w-5 h-5 inline mr-2 text-violet-500 mb-0.5" />
              {form.docType} — 生成中
            </h2>
            <p className="text-xs text-gray-400">甲方: {form.partyA} | 乙方: {form.partyB || '未指定'} | 风格: {form.templateStyle}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setResult(''); setLogs([]); }} disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50">
              重新生成
            </button>
            <button onClick={() => { navigator.clipboard.writeText(result); alert('已复制到剪贴板'); }}
              className="px-5 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-violet-700 shadow-md">
              <FileText className="w-3.5 h-3.5" /> 复制全文
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 flex gap-5">
          {/* Pipeline Logs */}
          <div className="w-72 shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-0">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-50">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <h3 className="text-sm font-bold text-gray-800">SSE 执行管线</h3>
              </div>
              <div className="space-y-4">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {log.message.includes('✅') 
                        ? <CheckCircle className="w-4 h-4 text-green-500" /> 
                        : <Clock className="w-4 h-4 text-violet-400 animate-pulse" />}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{log.step}</div>
                      <div className="text-xs text-gray-700 mt-0.5 leading-relaxed">{log.message}</div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-violet-500 font-medium pt-2">
                    <Spin size="small" /> 正在拼装文书...
                  </div>
                )}
              </div>
              {/* Hardcoded badge */}
              <div className="mt-5 pt-4 border-t border-gray-50">
                <div className="text-[10px] text-gray-400 leading-relaxed">
                  🔒 管辖法律、保密义务、违约救济等标准条款已<strong>硬编码植入</strong>，不经过 AI 生成。
                </div>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-100 p-10 shadow-sm min-h-full">
              {result ? (
                <div className="prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: marked(result) as string }} />
              ) : (
                <div className="text-sm text-gray-400 text-center mt-20">等待文书数据流入...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8 pb-20">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Scale className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">法律文书生成器</h1>
        </div>
        <p className="text-sm text-gray-400 ml-12">AI 生成主体条款 + 管辖法律等保护性条款由系统硬编码注入，确保合规准确</p>
      </div>

      <div className="space-y-5">
        {/* Doc Type */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">文书类型</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map(t => (
                <button key={t} onClick={() => setForm({ ...form, docType: t })}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${form.docType === t ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
            {form.docType && (
              <p className="text-[11px] text-gray-500 bg-violet-50/60 px-3 py-1.5 rounded-lg border border-violet-100">
                {DOC_TYPE_DESCRIPTIONS[form.docType]}
              </p>
            )}
          </div>
        </div>

        {/* Parties */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">各方信息</h3>
          </div>
          <div className="p-5 space-y-3">
            <input value={form.partyA} onChange={e => setForm({ ...form, partyA: e.target.value })}
              placeholder="甲方 (Party A) *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50" />
            <input value={form.partyB} onChange={e => setForm({ ...form, partyB: e.target.value })}
              placeholder="乙方 (Party B)" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50" />
          </div>
        </div>

        {/* Key Terms */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">核心条款</h3>
          </div>
          <div className="p-5">
            <textarea value={form.keyTerms} onChange={e => setForm({ ...form, keyTerms: e.target.value })}
              placeholder="核心业务条款（如：分成比例6:4、有效期3年、违约金10万、服务费3000英镑/月）" rows={4}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        {/* Style */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">模板风格</h3>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              {STYLES.map(s => (
                <button key={s} onClick={() => setForm({ ...form, templateStyle: s })}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${form.templateStyle === s ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Background */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">背景资料（可选）</h3>
            <button onClick={() => setKbSelectorOpen(true)}
              className="text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded hover:bg-violet-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> 从知识库选择
            </button>
          </div>
          <div className="p-5">
            {form.kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {form.kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setForm({ ...form, kbFiles: form.kbFiles.filter(kf => kf.id !== f.id) })} />
                  </div>
                ))}
              </div>
            )}
            <textarea value={form.background} onChange={e => setForm({ ...form, background: e.target.value })}
              placeholder="补充商业背景、谈判要点、历史沟通记录等" rows={4}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button onClick={handleGenerate} disabled={!form.partyA || loading}
            className="px-10 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-full shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
            {loading ? <><Spin size="small" /> 正在分步生成...</> : <><Scale className="w-4 h-4" /> 生成文书</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector isOpen onClose={() => setKbSelectorOpen(false)}
          initialSelected={form.kbFiles}
          onConfirm={(files) => { setForm({ ...form, kbFiles: files }); setKbSelectorOpen(false); }} />
      )}
    </div>
  );
}
