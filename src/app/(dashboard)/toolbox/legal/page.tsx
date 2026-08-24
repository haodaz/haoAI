'use client';
import React, { useState } from 'react';
import { Spin } from 'antd';
import { marked } from 'marked';
import { FileText, Database, X } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

const DOC_TYPES = ['NDA', 'MOU', '服务协议', '合作合同', '劳动合同'];
const STYLES = ['标准英式', '中英双语', '简约版'];

export default function LegalPage() {
  const [legalForm, setLegalForm] = useState({ docType: 'NDA', partyA: '', partyB: '', keyTerms: '', background: '', templateStyle: '标准英式', kbFiles: [] as KbFile[] });
  const [legalResult, setLegalResult] = useState<string | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);

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

  if (legalResult) {
    return (
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
    );
  }

  return (
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
                <button key={t} onClick={() => setLegalForm({ ...legalForm, docType: t })} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${legalForm.docType === t ? 'bg-violet-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">各方信息</h3></div>
          <div className="p-5 space-y-3">
            <input value={legalForm.partyA} onChange={e => setLegalForm({ ...legalForm, partyA: e.target.value })} placeholder="甲方 (Party A) *" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400" />
            <input value={legalForm.partyB} onChange={e => setLegalForm({ ...legalForm, partyB: e.target.value })} placeholder="乙方 (Party B)" className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400" />
          </div>
        </div>

        {/* Key Terms */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">核心条款</h3></div>
          <div className="p-5">
            <textarea value={legalForm.keyTerms} onChange={e => setLegalForm({ ...legalForm, keyTerms: e.target.value })} placeholder="核心条款描述（如：分成比例6:4、有效期3年、违约金10万）" rows={4} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        {/* Style */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100"><h3 className="text-xs font-bold text-gray-600">模板风格</h3></div>
          <div className="p-5">
            <div className="flex gap-2">
              {STYLES.map(s => (
                <button key={s} onClick={() => setLegalForm({ ...legalForm, templateStyle: s })} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${legalForm.templateStyle === s ? 'bg-violet-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Background */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-600">背景资料（可选）</h3>
            <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded hover:bg-violet-100 flex items-center gap-1"><Database className="w-3 h-3" /> 从知识库选择</button>
          </div>
          <div className="p-5">
            {legalForm.kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {legalForm.kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setLegalForm({ ...legalForm, kbFiles: legalForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                  </div>
                ))}
              </div>
            )}
            <textarea value={legalForm.background} onChange={e => setLegalForm({ ...legalForm, background: e.target.value })} placeholder="补充商业背景、谈判要点等" rows={4} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button onClick={handleGenerateLegal} disabled={!legalForm.partyA || legalLoading} className="px-10 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-full shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2">
            {legalLoading ? <><Spin size="small" /> 生成中...</> : <><FileText className="w-4 h-4" /> 生成文书</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          initialSelected={legalForm.kbFiles}
          onConfirm={(files) => { setLegalForm({ ...legalForm, kbFiles: files }); setKbSelectorOpen(false); }}
        />
      )}
    </div>
  );
}
