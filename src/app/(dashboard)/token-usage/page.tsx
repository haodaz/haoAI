'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface TokenLog {
  id: string;
  source: string;
  agentId: string | null;
  taskId: string | null;
  contextId: string | null;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  stage: string | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface Stats {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  model_stats: Record<string, { count: number; tokens: number; cost: number }>;
  agent_stats: Record<string, { count: number; tokens: number; cost: number }>;
  source_stats: Record<string, { count: number; tokens: number; cost: number }>;
}

const USD_TO_CNY = 7.2;
const USD_TO_GBP = 0.79;
type Currency = 'CNY' | 'USD' | 'GBP';

const MODEL_COLORS: Record<string, string> = {
  'gemini-38-flash': '#4285f4',
  'gemini-3.8-flash': '#4285f4',
  'gemini-3.6-flash': '#34a853',
  'gemini-3.5-flash': '#34a853',
  'gemini-flash-latest': '#4285f4',
  'gemini-31-pro-preview': '#ea4335',
  'gemini-3.1-pro': '#ea4335',
  'deepseek-v3': '#7c3aed',
  'deepseek-chat': '#8b5cf6',
  'claude-sonnet-4': '#f59e0b',
  'gpt-6-astra': '#10a37f',
  'gpt-5.6-terra': '#34d399',
  'gpt-5.6-luna': '#6ee7b7',
  'qwen-plus': '#ff6a00',
};

const MODEL_PRICING_REF = [
  { name: 'Gemini 3.8 Flash', tag: 'Default', tagColor: '#4285f4', input: '$0.75', output: '$3.75' },
  { name: 'Gemini 3.6 Flash', input: '$0.75', output: '$3.75' },
  { name: 'Gemini 3.5 Flash', input: '$0.75', output: '$3.75' },
  { name: 'Gemini 3.1 Pro', tag: 'Pro', tagColor: '#ea4335', input: '$7.00', output: '$12.00' },
  { name: 'GPT-6 Astra', tag: 'Flagship', tagColor: '#10a37f', input: '$10.00', output: '$30.00' },
  { name: 'GPT-5.6 Terra', input: '$2.50', output: '$10.00' },
  { name: 'GPT-5.6 Luna', input: '$0.50', output: '$2.00' },
];

const AGENT_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  chief: { label: 'Chief Orchestrator', emoji: '👨‍✈️', color: '#6055f5' },
  alice: { label: 'Alice Proposal', emoji: '📋', color: '#e8710a' },
  bob: { label: 'Bob Scheduling', emoji: '📅', color: '#34a853' },
  david: { label: 'David Audit', emoji: '🚨', color: '#ef4444' },
  edda: { label: 'Edda PPT', emoji: '🎨', color: '#ec4899' },
  eric: { label: 'Eric Legal', emoji: '⚖️', color: '#0ea5e9' },
  fiona: { label: 'Fiona Comms', emoji: '📢', color: '#f59e0b' },
  grace: { label: 'Grace Email', emoji: '✉️', color: '#8b5cf6' },
  hugo: { label: 'Hugo Finance', emoji: '💰', color: '#14b8a6' },
  iris: { label: 'Iris Web', emoji: '🌐', color: '#22c55e' },
  jarvis: { label: 'Jarvis Research', emoji: '📊', color: '#6366f1' },
  kelly: { label: 'Kelly Parser', emoji: '📎', color: '#a855f7' },
  nexus: { label: 'Nexus Search', emoji: '🔍', color: '#3b82f6' },
  nova: { label: 'Nova Consult', emoji: '🏥', color: '#ef4444' },
  atlas: { label: 'Atlas Data', emoji: '📡', color: '#06b6d4' },
  approval: { label: 'Approval Parser', emoji: '✅', color: '#10b981' },
};

const DAYS_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'All time', value: 0 },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(usd: number, currency: Currency): string {
  if (currency === 'CNY') {
    const cny = usd * USD_TO_CNY;
    if (cny >= 1) return '¥' + cny.toFixed(2);
    if (cny >= 0.01) return '¥' + cny.toFixed(3);
    return '¥' + cny.toFixed(4);
  }
  if (currency === 'GBP') {
    const gbp = usd * USD_TO_GBP;
    if (gbp >= 1) return '£' + gbp.toFixed(2);
    if (gbp >= 0.01) return '£' + gbp.toFixed(3);
    return '£' + gbp.toFixed(4);
  }
  if (usd >= 1) return '$' + usd.toFixed(2);
  if (usd >= 0.01) return '$' + usd.toFixed(3);
  if (usd >= 0.001) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(6);
}

export default function TokenUsagePage() {
  const [logs, setLogs] = useState<TokenLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [daysFilter, setDaysFilter] = useState(30);
  const [modelFilter, setModelFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState<Currency>('CNY');
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(daysFilter > 0 ? { days: String(daysFilter) } : {}),
        ...(modelFilter ? { model: modelFilter } : {}),
        ...(agentFilter ? { agent: agentFilter } : {}),
      });
      const res = await fetch(`/api/admin/token-usage?${params}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setStats(data.stats || null);
      }
    } catch (e) {
      console.error('Failed to fetch token usage:', e);
    }
    setLoading(false);
  }, [page, daysFilter, modelFilter, agentFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const modelOptions = stats?.model_stats ? Object.keys(stats.model_stats) : [];
  const agentOptions = stats?.agent_stats ? Object.keys(stats.agent_stats).filter(a => a !== 'unknown') : [];
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ maxWidth: 1800, margin: '0 auto', padding: '24px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>📊 Token Usage Ledger</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8c8c8c' }}>Track AI Agent calls, token consumption &amp; cost analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={daysFilter}
            onChange={e => { setDaysFilter(Number(e.target.value)); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff' }}
          >
            {DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={modelFilter}
            onChange={e => { setModelFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', minWidth: 140 }}
          >
            <option value="">All Models</option>
            {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={agentFilter}
            onChange={e => { setAgentFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', minWidth: 130 }}
          >
            <option value="">All Agents</option>
            {agentOptions.map(a => <option key={a} value={a}>{AGENT_CONFIG[a]?.label || a}</option>)}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
          <button
            onClick={() => setCurrency(c => c === 'CNY' ? 'USD' : c === 'USD' ? 'GBP' : 'CNY')}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {currency === 'CNY' ? '¥ CNY' : currency === 'GBP' ? '£ GBP' : '$ USD'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Calls', value: String(stats.total_calls), icon: '📋', color: '#6055f5' },
            { label: 'Total Tokens', value: formatTokens(stats.total_tokens), sub: `${formatTokens(stats.total_input_tokens)} in / ${formatTokens(stats.total_output_tokens)} out`, icon: '⚡', color: '#fa8c16' },
            { label: 'Total Cost', value: formatCost(stats.total_cost_usd, currency), icon: '💰', color: '#52c41a' },
            { label: 'Active Agents', value: String(Object.keys(stats.agent_stats).filter(a => a !== 'unknown').length), icon: '🤖', color: '#1890ff' },
          ].map(card => (
            <div
              key={card.label}
              style={{
                background: '#fff', borderRadius: 12, padding: '16px 18px',
                borderTop: `3px solid ${card.color}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{card.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{card.icon}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{card.value}</span>
              </div>
              {card.sub && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Model Distribution */}
      {stats?.model_stats && Object.keys(stats.model_stats).length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#555' }}>Model Distribution</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {Object.entries(stats.model_stats).map(([model, s]) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: (MODEL_COLORS[model] || '#666') + '18',
                  color: MODEL_COLORS[model] || '#666',
                }}>{model}</span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {s.count} 次 · {formatTokens(s.tokens)} · {formatCost(s.cost, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Pricing Reference */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#555' }}>💲 Model Pricing Reference <span style={{ fontSize: 11, color: '#bbb', fontWeight: 400 }}>(USD / 1M tokens — 2026 Q3)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {MODEL_PRICING_REF.map(m => (
            <div key={m.name} style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
              borderLeft: `4px solid ${m.tagColor || '#999'}`,
              background: '#fafbff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{m.name}</span>
                {m.tag && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: (m.tagColor || '#999') + '18', color: m.tagColor || '#999',
                  }}>{m.tag}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                In {m.input} / Out {m.output}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Stats Grid */}
      {stats?.agent_stats && Object.keys(stats.agent_stats).filter(a => a !== 'unknown').length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#555' }}>Agent Statistics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {Object.entries(stats.agent_stats)
              .filter(([a]) => a !== 'unknown')
              .sort(([, a], [, b]) => b.tokens - a.tokens)
              .map(([agent, s]) => {
                const cfg = AGENT_CONFIG[agent] || { label: agent, emoji: '⚙️', color: '#8c8c8c' };
                return (
                  <div
                    key={agent}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', background: '#fafbff', borderRadius: 10,
                      border: `1px solid ${cfg.color}22`,
                      borderLeft: `4px solid ${cfg.color}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 3 }}>
                        {cfg.emoji} {cfg.label}
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#666' }}>
                        <span>{s.count} 次</span>
                        <span>{formatTokens(s.tokens)} tokens</span>
                        <span style={{ fontWeight: 600, color: cfg.color }}>{formatCost(s.cost, currency)}</span>
                      </div>
                    </div>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: `${cfg.color}12`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>
                      {cfg.emoji}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Usage Details</span>
          <span style={{ fontSize: 12, color: '#999' }}>{total} records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                {['Time', 'Source', 'Agent', 'Stage', 'Model', 'Input', 'Output', 'Total Token', 'Cost', 'Duration', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr><td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#ccc' }}>No data</td></tr>
              )}
              {loading && (
                <tr><td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#ccc' }}>Loading...</td></tr>
              )}
              {logs.map(log => {
                const agentCfg = AGENT_CONFIG[log.agentId || ''];
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#666', fontSize: 12 }}>
                      {new Date(log.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11,
                        background: log.source === 'agent' ? '#e8f5e9' : log.source === 'orchestrate' ? '#e3f2fd' : log.source === 'copilot' ? '#fce4ec' : '#f5f5f5',
                        color: log.source === 'agent' ? '#2e7d32' : log.source === 'orchestrate' ? '#1565c0' : log.source === 'copilot' ? '#c62828' : '#666',
                      }}>
                        {log.source}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {agentCfg ? (
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{agentCfg.emoji} {agentCfg.label}</span>
                      ) : (
                        <span style={{ color: '#ccc' }}>{log.agentId || '-'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#888', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.stage || '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: (MODEL_COLORS[log.modelId] || '#666') + '15',
                        color: MODEL_COLORS[log.modelId] || '#666',
                      }}>
                        {log.modelId}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>{formatTokens(log.inputTokens)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>{formatTokens(log.outputTokens)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{formatTokens(log.totalTokens)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: '#52c41a', fontWeight: 600 }}>
                      {formatCost(log.costUsd, currency)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: '#999' }}>
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {log.success ? (
                        <span style={{ color: '#52c41a' }}>✓</span>
                      ) : (
                        <span title={log.errorMessage || ''} style={{ color: '#ff4d4f', cursor: 'help' }}>✗</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'center', gap: 6 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}
            >
              Prev
            </button>
            <span style={{ padding: '4px 12px', fontSize: 13, color: '#666' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
