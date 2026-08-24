'use client';
import React, { useState } from 'react';
import { Spin } from 'antd';
import { marked } from 'marked';
import { Briefcase, Database, X, FileText, CheckCircle, Clock } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';

const BUSINESS_MODELS = ['Fixed Retainer', 'Performance Partnership', 'Hybrid (混合模式)'];
const FOCUS_AREAS = ['学术提升 (Academics)', '市场拓展 (Marketing)', '寄宿体验 (Pastoral Care)', '全面接管 (Full Management)'];

export default function ProposalPage() {
  const [proposalForm, setProposalForm] = useState({
    targetSchool: '',
    schoolProfile: '',
    businessModel: 'Fixed Retainer',
    focusAreas: [] as string[],
    additionalNotes: '',
    kbFiles: [] as KbFile[]
  });
  
  const [proposalResult, setProposalResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [logs, setLogs] = useState<{ message: string; step: string }[]>([]);

  const toggleFocusArea = (area: string) => {
    setProposalForm(prev => {
      const current = prev.focusAreas;
      if (current.includes(area)) {
        return { ...prev, focusAreas: current.filter(a => a !== area) };
      } else {
        return { ...prev, focusAreas: [...current, area] };
      }
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setProposalResult('');
    setLogs([]);
    try {
      const res = await fetch('/api/toolbox/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...proposalForm,
          kbFileIds: proposalForm.kbFiles.map(f => f.id)
        })
      });

      if (!res.body) throw new Error('No readable stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let aiText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'log') {
                  setLogs(prev => [...prev, { step: data.data.step, message: data.data.message }]);
                } else if (data.type === 'ai_chunk') {
                  aiText += data.data;
                  setProposalResult(aiText);
                } else if (data.type === 'error') {
                  alert(`错误: ${data.data.message}`);
                }
              } catch (e) { /* ignore parse errors */ }
            }
          }
        }
      }
    } catch {
      alert('Network error');
    }
    setLoading(false);
  };

  if (proposalResult || loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-sm z-10">
          <div>
            <h2 className="text-lg font-black text-gray-900">{proposalForm.targetSchool} — 商业提案 (Proposal)</h2>
            <p className="text-xs text-gray-400">模式: {proposalForm.businessModel} | 重点: {proposalForm.focusAreas.join(', ') || '综合'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setProposalResult(''); setLogs([]); }} disabled={loading} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50">
              重新生成
            </button>
            <button onClick={() => { navigator.clipboard.writeText(proposalResult); alert('已复制到剪贴板'); }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 shadow-md">
              <FileText className="w-3.5 h-3.5" /> 复制全文
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 flex gap-6">
          
          {/* Execution Logs */}
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-0">
              <h3 className="text-sm font-bold text-gray-800 mb-4 border-b border-gray-50 pb-2">多步执行日志 (SSE Pipeline)</h3>
              <div className="space-y-4">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="mt-0.5">
                      {log.message.includes('✅') ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-blue-500 animate-pulse" />}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400">{log.step}</div>
                      <div className="text-xs text-gray-700 mt-0.5">{log.message}</div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 font-medium pt-2">
                    <Spin size="small" /> AI Agent 正在组装...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Markdown Result */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-100 p-10 shadow-sm min-h-full">
              {proposalResult ? (
                <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: marked(proposalResult) as string }} />
              ) : (
                <div className="text-sm text-gray-400 text-center mt-20">等待生成数据流入...</div>
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
        <h1 className="text-2xl font-black text-gray-900">Proposal 商业提案生成器</h1>
        <p className="text-sm text-gray-400 mt-1">输入目标学校情况，系统将自动加载 BEP 标准模板与公司介绍，生成定制化提案草案。</p>
      </div>

      <div className="space-y-5">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">目标学校</h3>
          </div>
          <div className="p-5 space-y-4">
            <input 
              value={proposalForm.targetSchool} 
              onChange={e => setProposalForm({ ...proposalForm, targetSchool: e.target.value })} 
              placeholder="学校名称 (如: Queen's College) *" 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" 
            />
            <textarea 
              value={proposalForm.schoolProfile} 
              onChange={e => setProposalForm({ ...proposalForm, schoolProfile: e.target.value })} 
              placeholder="学校现状与痛点 (如: 目前有50个空缺床位，主要希望能拓展亚洲市场，但缺乏本土化营销团队)" 
              rows={3} 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 resize-none" 
            />
          </div>
        </div>

        {/* Business Model & Focus */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">商业模式与重点</h3>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-2">合作模式</p>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_MODELS.map(m => (
                  <button 
                    key={m} 
                    onClick={() => setProposalForm({ ...proposalForm, businessModel: m })} 
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${proposalForm.businessModel === m ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-2">服务侧重点 (多选)</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map(f => (
                  <button 
                    key={f} 
                    onClick={() => toggleFocusArea(f)} 
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${proposalForm.focusAreas.includes(f) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Base */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-gray-600">补充知识库</h3>
              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">后台将自动注入 BEP Core Docs</span>
            </div>
            <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> 从知识库选择
            </button>
          </div>
          <div className="p-5">
            {proposalForm.kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {proposalForm.kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setProposalForm({ ...proposalForm, kbFiles: proposalForm.kbFiles.filter(kf => kf.id !== f.id) })} />
                  </div>
                ))}
              </div>
            )}
            <textarea 
              value={proposalForm.additionalNotes} 
              onChange={e => setProposalForm({ ...proposalForm, additionalNotes: e.target.value })} 
              placeholder="其他特殊要求，或粘贴历史沟通邮件记录等..." 
              rows={4} 
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 resize-none" 
            />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button 
            onClick={handleGenerate} 
            disabled={!proposalForm.targetSchool || loading} 
            className="px-10 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-full shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <><Spin size="small" /> 正在汇聚知识并生成...</> : <><Briefcase className="w-4 h-4" /> 生成 Proposal草案</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          initialSelected={proposalForm.kbFiles}
          onConfirm={(files) => { setProposalForm({ ...proposalForm, kbFiles: files }); setKbSelectorOpen(false); }}
        />
      )}
    </div>
  );
}
