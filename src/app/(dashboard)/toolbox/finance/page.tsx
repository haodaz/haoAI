'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { DollarSign, FileText, PieChart, Calculator, Database, Send, X, CheckCircle, Clock, MessageSquare } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { useToolbox } from '../layout';
import VoiceTextarea from '@/components/ui/VoiceTextarea';

const DOC_TYPES = [
  { id: 'invoice', label: 'Invoice', desc: 'Professional invoices for clients', icon: FileText, color: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-100' },
  { id: 'report', label: 'Financial Report', desc: 'Revenue & expense analysis', icon: PieChart, color: 'bg-emerald-600', light: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { id: 'budget', label: 'Budget Planner', desc: 'Forecasting & allocation', icon: DollarSign, color: 'bg-amber-600', light: 'bg-amber-50 text-amber-700 border-amber-100' },
  { id: 'commission', label: 'Commission Calc', desc: 'Agent/partner commissions', icon: Calculator, color: 'bg-violet-600', light: 'bg-violet-50 text-violet-700 border-violet-100' },
];

const PLACEHOLDERS: Record<string, string> = {
  invoice: 'e.g. Invoice for Headington School, Q3 retainer fees, 3 months at £4,800/month',
  report: 'e.g. Q3 2026 financial performance review for BEP operations',
  budget: 'e.g. FY 2027 budget for BEP China expansion team',
  commission: 'e.g. Commission breakdown for 5 school partnerships under Performance model',
};

export default function FinancePage() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');
  const autoStartedRef = useRef(false);
  const { setSidebarCollapsed } = useToolbox();

  const [docType, setDocType] = useState('invoice');
  const [topic, setTopic] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [kbFiles, setKbFiles] = useState<KbFile[]>([]);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<{ message: string; step: string }[]>([]);
  const [result, setResult] = useState<any>(null);
  const [resultDocType, setResultDocType] = useState('');

  // Mode: Load existing asset
  useEffect(() => {
    if (!assetId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    fetch(`/api/toolbox/assets?id=${assetId}`)
      .then(r => r.json())
      .then((asset) => {
        if (asset.error || !asset.payload) return;
        const payload = JSON.parse(asset.payload);
        if (payload.result) {
          setResult(payload.result);
          setResultDocType(payload.docType || 'invoice');
          setDocType(payload.docType || 'invoice');
          if (payload.topic) setTopic(payload.topic);
          setSidebarCollapsed(true);
        }
      })
      .catch(console.error);
  }, [assetId]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setLogs([]);
    setResult(null);
    setSidebarCollapsed(true);

    try {
      const res = await fetch('/api/toolbox/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          topic,
          background: additionalNotes,
          kbFileIds: kbFiles.map(f => f.id),
        }),
      });

      if (!res.body) throw new Error('No readable stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(event.substring(6));
              if (data.type === 'log') {
                setLogs(prev => [...prev, data.data]);
              } else if (data.type === 'result') {
                setResult(data.data.result);
                setResultDocType(data.data.docType);
              } else if (data.type === 'error') {
                setLogs(prev => [...prev, { step: '❌', message: data.data.message }]);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err: any) {
      setLogs(prev => [...prev, { step: '❌', message: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Result Renderers ──

  const renderInvoice = (data: any) => (
    <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] shrink-0 rounded-sm my-10 overflow-hidden">
      <div className="bg-gradient-to-r from-[#0E3018] to-[#1a4a2e] text-white p-10">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black tracking-tight">INVOICE</h2>
            <p className="text-emerald-200 text-sm mt-2">British Enrolment Partners Ltd</p>
            <p className="text-emerald-300 text-xs">106 Great Charles Street, Birmingham, B3 3HN</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-mono font-bold">{data.invoiceNumber}</p>
            <p className="text-emerald-200 text-sm mt-1">Date: {data.date}</p>
            <p className="text-emerald-200 text-sm">Due: {data.dueDate}</p>
          </div>
        </div>
      </div>
      <div className="p-10">
        <div className="mb-8 pb-6 border-b border-gray-100">
          <p className="text-[10px] uppercase text-gray-400 font-bold tracking-[2px]">Bill To</p>
          <p className="font-bold text-gray-800 text-lg mt-2">{data.billTo?.name}</p>
          <p className="text-sm text-gray-500 mt-1">{data.billTo?.address}</p>
          {data.billTo?.email && <p className="text-sm text-blue-600 mt-1">{data.billTo?.email}</p>}
        </div>
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-200 text-[10px] uppercase text-gray-400 tracking-wider">
              <th className="text-left py-3 font-bold">Description</th>
              <th className="text-center py-3 w-20 font-bold">Qty</th>
              <th className="text-right py-3 w-28 font-bold">Unit Price</th>
              <th className="text-right py-3 w-28 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item: any, i: number) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-4 text-sm text-gray-700">{item.description}</td>
                <td className="py-4 text-sm text-gray-500 text-center">{item.quantity}</td>
                <td className="py-4 text-sm text-gray-500 text-right">£{Number(item.unitPrice).toLocaleString()}</td>
                <td className="py-4 text-sm font-semibold text-gray-800 text-right">£{Number(item.total).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col items-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span className="text-gray-800">£{Number(data.subtotal).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-gray-500"><span>VAT ({data.vatRate || 20}%)</span><span className="text-gray-800">£{Number(data.vatAmount).toLocaleString()}</span></div>
            <div className="flex justify-between text-xl font-black pt-3 mt-3 border-t-2 border-gray-800">
              <span>Total</span>
              <span className="text-[#0E3018]">£{Number(data.grandTotal).toLocaleString()}</span>
            </div>
          </div>
        </div>
        {data.notes && <p className="text-xs text-gray-400 italic mt-8 border-t border-gray-100 pt-4">{data.notes}</p>}
        <div className="text-xs text-gray-400 mt-2">Payment Terms: {data.paymentTerms || 'Net 30'} | Currency: {data.currency || 'GBP'}</div>
      </div>
    </div>
  );

  const renderReport = (data: any) => (
    <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] shrink-0 rounded-sm my-10 overflow-hidden">
      <div className="bg-gradient-to-r from-[#0E3018] to-[#1a4a2e] text-white p-10">
        <h2 className="text-3xl font-black">{data.title}</h2>
        <p className="text-emerald-200 mt-1 text-sm">{data.period} | British Enrolment Partners</p>
      </div>
      <div className="p-10 space-y-8">
        {data.executiveSummary && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-lg">
            <p className="text-[10px] uppercase text-emerald-600 font-bold tracking-wider mb-2">Executive Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{data.executiveSummary}</p>
          </div>
        )}
        {data.kpis?.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.kpis.map((kpi: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{kpi.label}</p>
                <p className="text-2xl font-black text-gray-800 mt-2">{kpi.value}</p>
                <p className={`text-sm font-bold mt-1 ${kpi.trend === 'up' ? 'text-emerald-600' : kpi.trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>{kpi.change}</p>
              </div>
            ))}
          </div>
        )}
        {data.revenueBreakdown?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-3">Revenue Breakdown</p>
            {data.revenueBreakdown.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <span className="text-sm text-gray-700 flex-1">{item.category}</span>
                <div className="w-40 bg-gray-100 rounded-full h-2.5"><div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min(item.percentage, 100)}%` }} /></div>
                <span className="text-sm font-bold w-28 text-right">£{Number(item.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {data.insights?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-3">Key Insights</p>
            <ul className="space-y-2">{data.insights.map((s: string, i: number) => <li key={i} className="text-sm text-gray-600 flex gap-2"><span className="text-emerald-500">💡</span>{s}</li>)}</ul>
          </div>
        )}
        {data.recommendations?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-[10px] uppercase text-amber-700 font-bold tracking-wider mb-3">Recommendations</p>
            <ul className="space-y-2">{data.recommendations.map((s: string, i: number) => <li key={i} className="text-sm text-amber-800 flex gap-2"><span>→</span>{s}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );

  const renderBudget = (data: any) => (
    <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] shrink-0 rounded-sm my-10 overflow-hidden">
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-10">
        <h2 className="text-3xl font-black">{data.title}</h2>
        <p className="text-amber-100 mt-1 text-sm">Fiscal Year: {data.fiscalYear}</p>
        <p className="text-4xl font-black mt-4">£{Number(data.totalBudget).toLocaleString()}</p>
      </div>
      <div className="p-10 space-y-8">
        {data.allocations?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-4">Budget Allocations</p>
            {data.allocations.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50">
                <span className="text-sm font-medium text-gray-700 flex-1">{a.department}{a.notes && <span className="text-xs text-gray-400 ml-2">({a.notes})</span>}</span>
                <div className="w-32 bg-gray-100 rounded-full h-2.5"><div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${Math.min(a.percentage, 100)}%` }} /></div>
                <span className="text-sm font-bold w-28 text-right">£{Number(a.allocated).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {data.quarterlyForecast?.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            {data.quarterlyForecast.map((q: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 font-bold">{q.quarter}</p>
                <p className="text-xl font-black text-gray-800 mt-2">£{Number(q.projected).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
        {data.scenarios && (
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(data.scenarios).map(([key, s]: [string, any]) => (
              <div key={key} className={`rounded-xl p-5 border ${key === 'optimistic' ? 'bg-emerald-50 border-emerald-200' : key === 'conservative' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{key}</p>
                <p className="text-xl font-black mt-2">£{Number(s.revenue).toLocaleString()}</p>
                {s.notes && <p className="text-xs text-gray-500 mt-1">{s.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCommission = (data: any) => (
    <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] shrink-0 rounded-sm my-10 overflow-hidden">
      <div className="bg-gradient-to-r from-violet-600 to-violet-700 text-white p-10">
        <h2 className="text-3xl font-black">{data.title}</h2>
        <p className="text-violet-200 mt-1 text-sm">Model: {data.partnershipModel}</p>
      </div>
      <div className="p-10 space-y-8">
        {data.deals?.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 border-gray-200 text-[10px] uppercase text-gray-400 tracking-wider">
              <th className="text-left py-3 font-bold">School</th>
              <th className="text-center py-3 font-bold">Students</th>
              <th className="text-right py-3 font-bold">Fee/Student</th>
              <th className="text-right py-3 font-bold">BEP Fee</th>
              <th className="text-right py-3 font-bold">Agent Comm.</th>
              <th className="text-right py-3 font-bold">Net to School</th>
            </tr></thead>
            <tbody>
              {data.deals.map((d: any, i: number) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-3 font-medium text-gray-800">{d.school}</td>
                  <td className="py-3 text-center text-gray-600">{d.students}</td>
                  <td className="py-3 text-right text-gray-600">£{Number(d.annualFeePerStudent).toLocaleString()}</td>
                  <td className="py-3 text-right text-violet-600 font-bold">£{Number(d.bepFee).toLocaleString()}</td>
                  <td className="py-3 text-right text-amber-600 font-bold">£{Number(d.agentCommission).toLocaleString()}</td>
                  <td className="py-3 text-right text-emerald-600 font-black">£{Number(d.netToSchool).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.summary && (
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Total Students', value: data.summary.totalStudents, color: 'text-gray-800' },
              { label: 'Total Revenue', value: `£${Number(data.summary.totalRevenue).toLocaleString()}`, color: 'text-blue-600' },
              { label: 'BEP Fees', value: `£${Number(data.summary.totalBepFees).toLocaleString()}`, color: 'text-violet-600' },
              { label: 'Agent Comm.', value: `£${Number(data.summary.totalAgentCommissions).toLocaleString()}`, color: 'text-amber-600' },
              { label: 'Net to School', value: `£${Number(data.summary.netSchoolRevenue).toLocaleString()}`, color: 'text-emerald-600' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{item.label}</p>
                <p className={`text-xl font-black mt-2 ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        )}
        {data.notes && <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-4">{data.notes}</p>}
      </div>
    </div>
  );

  const renderResult = () => {
    if (!result) return null;
    switch (resultDocType) {
      case 'invoice': return renderInvoice(result);
      case 'report': return renderReport(result);
      case 'budget': return renderBudget(result);
      case 'commission': return renderCommission(result);
      default: return <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>;
    }
  };

  // ── Result View (matches Proposal/PPT pattern) ──
  if (result || loading) {
    const dtConfig = DOC_TYPES.find(d => d.id === (resultDocType || docType));
    return (
      <div className="h-full flex flex-col">
        <div className="px-8 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-sm z-10">
          <div>
            <h2 className="text-lg font-black text-gray-900">{dtConfig?.label || 'Finance'} — {topic.slice(0, 60)}</h2>
            <p className="text-xs text-gray-400">Type: {dtConfig?.label}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setResult(null); setLogs([]); }} disabled={loading} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50">
              Regenerate
            </button>
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); alert('Copied JSON to clipboard'); }} className="px-5 py-2 bg-cyan-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-700 shadow-md">
              <FileText className="w-3.5 h-3.5" /> Copy Data
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 flex gap-6 items-start">
          {/* Left: SSE Logs */}
          <div className="w-[360px] shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-3 h-3 rounded-full ${loading ? 'bg-cyan-500 animate-pulse' : 'bg-emerald-500'}`} />
                <h3 className="text-sm font-bold text-gray-800">SSE Pipeline — {loading ? 'Generating' : 'Complete'}</h3>
              </div>
              <div className="space-y-4">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="mt-0.5">
                      {log.message.includes('✅') ? <CheckCircle className="w-4 h-4 text-green-500" /> : log.step === '❌' ? <X className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-cyan-500 animate-pulse" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400">{log.step}</div>
                      <div className="text-sm text-gray-700 mt-0.5">{log.message}</div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 font-medium pt-2">
                    <Spin size="small" /> Generating document...
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Right: Document preview */}
          <div className="flex-1 bg-gray-100 overflow-y-auto max-h-[calc(100vh-130px)] flex flex-col items-center">
            {result ? renderResult() : (
              <div className="bg-white shadow-xl border border-gray-200 w-full max-w-[210mm] min-h-[297mm] shrink-0 rounded-sm my-10 flex flex-col items-center justify-center">
                <div className="animate-pulse w-16 h-16 bg-gray-50 rounded-full mb-4 flex items-center justify-center text-2xl">📊</div>
                <div className="text-sm text-gray-400">Generating financial document...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Form View (matches Proposal pattern) ──
  return (
    <div className="max-w-3xl mx-auto p-8 pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900">Finance Tool</h1>
        <p className="text-sm text-gray-400 mt-1">Generate professional invoices, financial reports, budget plans, and commission calculations with BEP data auto-injected.</p>
      </div>

      <div className="space-y-5">
        {/* Document Type */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">Document Type</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {DOC_TYPES.map(dt => {
                const Icon = dt.icon;
                const active = docType === dt.id;
                return (
                  <button
                    key={dt.id}
                    onClick={() => setDocType(dt.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all border-2 ${
                      active ? `${dt.color} text-white border-transparent shadow-lg` : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-bold">{dt.label}</span>
                    <span className={`text-[10px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{dt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600">Description *</h3>
          </div>
          <div className="p-5">
            <VoiceTextarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={PLACEHOLDERS[docType]}
              rows={4}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 resize-none"
            />
          </div>
        </div>

        {/* Knowledge Base */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-gray-600">Supplementary Knowledge Base</h3>
              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">BEP Financial Docs auto-injected</span>
            </div>
            <button onClick={() => setKbSelectorOpen(true)} className="text-[11px] font-medium text-cyan-600 bg-cyan-50 px-2 py-1 rounded hover:bg-cyan-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> Select from KB
            </button>
          </div>
          <div className="p-5">
            {kbFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {kbFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-1 bg-cyan-50 border border-cyan-100 text-cyan-700 px-2 py-1 rounded-md text-[11px]">
                    <FileText className="w-3 h-3" /> <span className="truncate max-w-[150px]">{f.title}</span>
                    <X className="w-3 h-3 cursor-pointer hover:text-red-500 ml-1" onClick={() => setKbFiles(kbFiles.filter(kf => kf.id !== f.id))} />
                  </div>
                ))}
              </div>
            )}
            <VoiceTextarea
              value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)}
              placeholder="Additional context, numbers, or paste financial data..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-cyan-400 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || loading}
            className="px-10 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-bold rounded-full shadow-lg shadow-cyan-500/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <><Spin size="small" /> Gathering data & generating...</> : <><DollarSign className="w-4 h-4" /> Generate {DOC_TYPES.find(d => d.id === docType)?.label}</>}
          </button>
        </div>
      </div>

      {kbSelectorOpen && (
        <KbFileSelector
          isOpen={true}
          onClose={() => setKbSelectorOpen(false)}
          initialSelected={kbFiles}
          onConfirm={(files) => { setKbFiles(files); setKbSelectorOpen(false); }}
        />
      )}
    </div>
  );
}
