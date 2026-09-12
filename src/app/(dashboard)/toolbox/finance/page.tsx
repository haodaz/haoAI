'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { DollarSign, FileText, PieChart, Calculator, Database, Send, Download, RefreshCw } from 'lucide-react';
import { KbFileSelector, KbFile } from '@/components/shared/KbFileSelector';
import { useToolbox } from '../layout';

const DOC_TYPES = [
  { id: 'invoice', label: 'Invoice', desc: 'Professional invoices for clients', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'report', label: 'Financial Report', desc: 'Revenue & expense analysis', icon: PieChart, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'budget', label: 'Budget Planner', desc: 'Forecasting & allocation', icon: DollarSign, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'commission', label: 'Commission Calculator', desc: 'Agent/partner commissions', icon: Calculator, color: 'text-violet-500', bg: 'bg-violet-50', border: 'border-violet-200' },
];

export default function FinancePage() {
  const searchParams = useSearchParams();
  const assetId = searchParams?.get('assetId');
  const autoStartedRef = useRef(false);
  const { setSidebarCollapsed } = useToolbox();

  const [docType, setDocType] = useState('invoice');
  const [topic, setTopic] = useState('');
  const [background, setBackground] = useState('');
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
          background,
          kbFileIds: kbFiles.map(f => f.id),
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
    } catch (err: any) {
      setLogs(prev => [...prev, { step: '❌', message: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers for each document type ──
  const renderInvoice = (data: any) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0E3018] to-[#1a4a2e] text-white p-8">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">INVOICE</h2>
            <p className="text-emerald-200 text-sm mt-1">British Enrolment Partners Ltd</p>
            <p className="text-emerald-300 text-xs mt-1">106 Great Charles Street, Birmingham, B3 3HN</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-mono font-bold">{data.invoiceNumber}</p>
            <p className="text-emerald-200 text-sm">Date: {data.date}</p>
            <p className="text-emerald-200 text-sm">Due: {data.dueDate}</p>
          </div>
        </div>
      </div>
      {/* Bill To */}
      <div className="p-6 border-b border-gray-100">
        <p className="text-xs uppercase text-gray-400 font-bold tracking-wider">Bill To</p>
        <p className="font-semibold text-gray-800 mt-1">{data.billTo?.name}</p>
        <p className="text-sm text-gray-500">{data.billTo?.address}</p>
        {data.billTo?.email && <p className="text-sm text-blue-600">{data.billTo?.email}</p>}
      </div>
      {/* Items Table */}
      <div className="px-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase text-gray-400 tracking-wider">
              <th className="text-left py-3">Description</th>
              <th className="text-center py-3 w-20">Qty</th>
              <th className="text-right py-3 w-28">Unit Price</th>
              <th className="text-right py-3 w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item: any, i: number) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-3 text-sm text-gray-700">{item.description}</td>
                <td className="py-3 text-sm text-gray-500 text-center">{item.quantity}</td>
                <td className="py-3 text-sm text-gray-500 text-right">£{Number(item.unitPrice).toLocaleString()}</td>
                <td className="py-3 text-sm font-medium text-gray-800 text-right">£{Number(item.total).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Totals */}
      <div className="p-6 bg-gray-50 border-t border-gray-100">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-between w-64 text-sm"><span className="text-gray-500">Subtotal:</span><span>£{Number(data.subtotal).toLocaleString()}</span></div>
          <div className="flex justify-between w-64 text-sm"><span className="text-gray-500">VAT ({data.vatRate || 20}%):</span><span>£{Number(data.vatAmount).toLocaleString()}</span></div>
          <div className="flex justify-between w-64 text-lg font-bold mt-2 pt-2 border-t border-gray-300">
            <span>Total ({data.currency || 'GBP'}):</span>
            <span className="text-[#0E3018]">£{Number(data.grandTotal).toLocaleString()}</span>
          </div>
        </div>
      </div>
      {data.notes && <div className="px-6 pb-6"><p className="text-xs text-gray-400 italic">{data.notes}</p></div>}
      <div className="px-6 pb-6 text-xs text-gray-400">Payment Terms: {data.paymentTerms || 'Net 30'}</div>
    </div>
  );

  const renderReport = (data: any) => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#0E3018] to-[#1a4a2e] text-white rounded-xl p-8">
        <h2 className="text-2xl font-bold">{data.title}</h2>
        <p className="text-emerald-200 mt-1">{data.period}</p>
        {data.executiveSummary && <p className="text-emerald-100 text-sm mt-4 leading-relaxed">{data.executiveSummary}</p>}
      </div>
      {/* KPIs */}
      {data.kpis?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.kpis.map((kpi: any, i: number) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{kpi.value}</p>
              <p className={`text-sm font-medium mt-1 ${kpi.trend === 'up' ? 'text-emerald-600' : kpi.trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                {kpi.change}
              </p>
            </div>
          ))}
        </div>
      )}
      {/* Revenue Breakdown */}
      {data.revenueBreakdown?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-700 mb-3">Revenue Breakdown</h3>
          <div className="space-y-2">
            {data.revenueBreakdown.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1"><p className="text-sm text-gray-700">{item.category}</p></div>
                <div className="w-32 bg-gray-100 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(item.percentage, 100)}%` }} /></div>
                <span className="text-sm font-medium w-24 text-right">£{Number(item.amount).toLocaleString()}</span>
                <span className="text-xs text-gray-400 w-12 text-right">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Insights */}
      {data.insights?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-700 mb-3">Key Insights</h3>
          <ul className="space-y-2">
            {data.insights.map((insight: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600"><span className="text-emerald-500 mt-0.5">💡</span>{insight}</li>
            ))}
          </ul>
        </div>
      )}
      {data.recommendations?.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
          <h3 className="font-bold text-amber-700 mb-3">Recommendations</h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-800"><span>→</span>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const renderBudget = (data: any) => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-xl p-8">
        <h2 className="text-2xl font-bold">{data.title}</h2>
        <p className="text-amber-100 mt-1">Fiscal Year: {data.fiscalYear}</p>
        <p className="text-3xl font-bold mt-4">£{Number(data.totalBudget).toLocaleString()}</p>
        <p className="text-amber-200 text-sm">Total Budget ({data.currency || 'GBP'})</p>
      </div>
      {/* Allocations */}
      {data.allocations?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-700 mb-4">Budget Allocations</h3>
          <div className="space-y-3">
            {data.allocations.map((alloc: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1"><p className="text-sm font-medium text-gray-700">{alloc.department}</p>{alloc.notes && <p className="text-xs text-gray-400">{alloc.notes}</p>}</div>
                <div className="w-32 bg-gray-100 rounded-full h-2"><div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.min(alloc.percentage, 100)}%` }} /></div>
                <span className="text-sm font-medium w-28 text-right">£{Number(alloc.allocated).toLocaleString()}</span>
                <span className="text-xs text-gray-400 w-12 text-right">{alloc.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Quarterly Forecast */}
      {data.quarterlyForecast?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.quarterlyForecast.map((q: any, i: number) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-sm text-gray-400 font-bold">{q.quarter}</p>
              <p className="text-xl font-bold text-gray-800 mt-1">£{Number(q.projected).toLocaleString()}</p>
              {q.notes && <p className="text-xs text-gray-400 mt-1">{q.notes}</p>}
            </div>
          ))}
        </div>
      )}
      {/* Scenarios */}
      {data.scenarios && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(data.scenarios).map(([key, scenario]: [string, any]) => (
            <div key={key} className={`rounded-lg p-4 border ${key === 'optimistic' ? 'bg-emerald-50 border-emerald-200' : key === 'conservative' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{key}</p>
              <p className="text-lg font-bold mt-1">£{Number(scenario.revenue).toLocaleString()}</p>
              {scenario.notes && <p className="text-xs text-gray-500 mt-1">{scenario.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCommission = (data: any) => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-600 to-violet-700 text-white rounded-xl p-8">
        <h2 className="text-2xl font-bold">{data.title}</h2>
        <p className="text-violet-200 mt-1">Model: {data.partnershipModel}</p>
      </div>
      {/* Deals Table */}
      {data.deals?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-gray-500 font-medium">School</th>
                <th className="text-center p-3 text-gray-500 font-medium">Students</th>
                <th className="text-right p-3 text-gray-500 font-medium">Fee/Student</th>
                <th className="text-right p-3 text-gray-500 font-medium">BEP Fee</th>
                <th className="text-right p-3 text-gray-500 font-medium">Agent Comm.</th>
                <th className="text-right p-3 text-gray-500 font-medium">Net to School</th>
              </tr>
            </thead>
            <tbody>
              {data.deals.map((deal: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-25">
                  <td className="p-3 font-medium text-gray-800">{deal.school}</td>
                  <td className="p-3 text-center text-gray-600">{deal.students}</td>
                  <td className="p-3 text-right text-gray-600">£{Number(deal.annualFeePerStudent).toLocaleString()}</td>
                  <td className="p-3 text-right text-violet-600 font-medium">£{Number(deal.bepFee).toLocaleString()}</td>
                  <td className="p-3 text-right text-amber-600 font-medium">£{Number(deal.agentCommission).toLocaleString()}</td>
                  <td className="p-3 text-right text-emerald-600 font-bold">£{Number(deal.netToSchool).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Summary Cards */}
      {data.summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Students', value: data.summary.totalStudents, color: 'text-gray-800' },
            { label: 'Total Revenue', value: `£${Number(data.summary.totalRevenue).toLocaleString()}`, color: 'text-blue-600' },
            { label: 'BEP Fees', value: `£${Number(data.summary.totalBepFees).toLocaleString()}`, color: 'text-violet-600' },
            { label: 'Agent Comm.', value: `£${Number(data.summary.totalAgentCommissions).toLocaleString()}`, color: 'text-amber-600' },
            { label: 'Net to School', value: `£${Number(data.summary.netSchoolRevenue).toLocaleString()}`, color: 'text-emerald-600' },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">{item.label}</p>
              <p className={`text-lg font-bold mt-1 ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {data.notes && <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 italic">{data.notes}</div>}
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

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white">
        <DollarSign className="w-5 h-5 text-emerald-600" />
        <h1 className="text-lg font-bold text-gray-800">Finance Tool</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Config Panel */}
        <div className="w-[340px] border-r border-gray-200 bg-gray-50/50 p-5 overflow-y-auto flex flex-col gap-5">
          {/* Document Type Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Document Type</label>
            <div className="grid grid-cols-2 gap-2">
              {DOC_TYPES.map(dt => {
                const Icon = dt.icon;
                const active = docType === dt.id;
                return (
                  <button
                    key={dt.id}
                    onClick={() => setDocType(dt.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all ${
                      active ? `${dt.bg} ${dt.border} ring-2 ring-offset-1 ring-current ${dt.color}` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? dt.color : ''}`} />
                    <span className="text-[11px] font-medium leading-tight">{dt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              rows={3}
              placeholder={
                docType === 'invoice' ? 'e.g. Invoice for Headington School, Q3 retainer fees, 3 months at £4,800/month' :
                docType === 'report' ? 'e.g. Q3 2026 financial performance review for BEP operations' :
                docType === 'budget' ? 'e.g. FY 2027 budget for BEP China expansion team' :
                'e.g. Commission breakdown for 5 school partnerships under Performance model'
              }
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>

          {/* Additional Context */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Additional Context <span className="text-gray-300">(optional)</span></label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              rows={2}
              placeholder="Any extra details, numbers, or specifications..."
              value={background}
              onChange={e => setBackground(e.target.value)}
            />
          </div>

          {/* KB Files */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Knowledge Base</label>
            <button
              onClick={() => setKbSelectorOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Database className="w-4 h-4" />
              {kbFiles.length > 0 ? `${kbFiles.length} file(s) selected` : 'Attach KB files'}
            </button>
            {kbFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {kbFiles.map(f => (
                  <span key={f.id} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                    {f.title.slice(0, 25)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#0E3018] text-white font-bold hover:bg-[#1a4a2e] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {loading ? <Spin size="small" /> : <Send className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate'}
          </button>

          {/* Logs */}
          {logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono max-h-40 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className="text-gray-300"><span className="text-emerald-400">{log.step}</span> {log.message}</p>
              ))}
            </div>
          )}
        </div>

        {/* Right: Result Preview */}
        <div className="flex-1 bg-gray-100/50 overflow-y-auto p-6">
          {result ? (
            <div className="max-w-4xl mx-auto">
              {renderResult()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <DollarSign className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">Select a document type and describe your request</p>
              <p className="text-sm mt-1">Your generated financial document will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* KB Selector Modal */}
      {kbSelectorOpen && (
        <KbFileSelector
          selectedFiles={kbFiles}
          onConfirm={(files) => { setKbFiles(files); setKbSelectorOpen(false); }}
          onCancel={() => setKbSelectorOpen(false)}
        />
      )}
    </div>
  );
}
