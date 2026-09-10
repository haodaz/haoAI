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
type Currency = 'CNY' | 'USD';

const MODEL_COLORS: Record<string, string> = {
  'deepseek-v3': '#7c3aed',
  'deepseek-chat': '#8b5cf6',
  'claude-sonnet-5': '#d97706',
  'claude-sonnet-4': '#f59e0b',
  'gemini-3.6-flash': '#4285f4',
  'gemini-3.5-flash': '#34a853',
  'gpt-4o': '#10a37f',
  'gpt-4o-mini': '#6ee7b7',
};

const AGENT_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  chief: { label: 'Chief 编排', emoji: '👨‍✈️', color: '#6055f5' },
  alice: { label: 'Alice 方案', emoji: '📋', color: '#e8710a' },
  bob: { label: 'Bob 日程', emoji: '📅', color: '#34a853' },
  david: { label: 'David 审计', emoji: '🚨', color: '#ef4444' },
  edda: { label: 'Edda PPT', emoji: '🎨', color: '#ec4899' },
  eric: { label: 'Eric 法务', emoji: '⚖️', color: '#0ea5e9' },
  fiona: { label: 'Fiona 通报', emoji: '📢', color: '#f59e0b' },
  grace: { label: 'Grace 邮件', emoji: '✉️', color: '#8b5cf6' },
  hugo: { label: 'Hugo 翻译', emoji: '🌐', color: '#14b8a6' },
  iris: { label: 'Iris 财务', emoji: '💰', color: '#22c55e' },
  jarvis: { label: 'Jarvis 研报', emoji: '📊', color: '#6366f1' },
  kelly: { label: 'Kelly 解析', emoji: '📎', color: '#a855f7' },
  nexus: { label: 'Nexus 搜索', emoji: '🔍', color: '#3b82f6' },
  nova: { label: 'Nova 会诊', emoji: '🏥', color: '#ef4444' },
  atlas: { label: 'Atlas 数据', emoji: '📡', color: '#06b6d4' },
  approval: { label: '审批解析', emoji: '✅', color: '#10b981' },
};

const DAYS_OPTIONS = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
  { label: '全部', value: 0 },
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
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>📊 Token 用量台账</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8c8c8c' }}>追踪 AI Agent 调用消耗与成本分析</p>
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
            <option value="">全部模型</option>
            {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={agentFilter}
            onChange={e => { setAgentFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', minWidth: 130 }}
          >
            <option value="">全部 Agent</option>
            {agentOptions.map(a => <option key={a} value={a}>{AGENT_CONFIG[a]?.label || a}</option>)}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            {loading ? '⏳' : '🔄'} 刷新
          </button>
          <button
            onClick={() => setCurrency(c => c === 'CNY' ? 'USD' : 'CNY')}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {currency === 'CNY' ? '¥ CNY' : '$ USD'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'AI 调用总数', value: String(stats.total_calls), icon: '📋', color: '#6055f5' },
            { label: '总 Token 消耗', value: formatTokens(stats.total_tokens), sub: `${formatTokens(stats.total_input_tokens)} in / ${formatTokens(stats.total_output_tokens)} out`, icon: '⚡', color: '#fa8c16' },
            { label: '总成本', value: formatCost(stats.total_cost_usd, currency), icon: '💰', color: '#52c41a' },
            { label: 'Agent 种类', value: String(Object.keys(stats.agent_stats).filter(a => a !== 'unknown').length), icon: '🤖', color: '#1890ff' },
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
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#555' }}>模型分布</div>
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

      {/* Agent Stats Grid */}
      {stats?.agent_stats && Object.keys(stats.agent_stats).filter(a => a !== 'unknown').length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#555' }}>Agent 分类统计</div>
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
          <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>用量明细</span>
          <span style={{ fontSize: 12, color: '#999' }}>共 {total} 条记录</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                {['时间', '来源', 'Agent', '阶段', '模型', '输入', '输出', '总 Token', '成本', '耗时', '状态'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr><td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#ccc' }}>暂无数据</td></tr>
              )}
              {loading && (
                <tr><td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#ccc' }}>加载中...</td></tr>
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
              上一页
            </button>
            <span style={{ padding: '4px 12px', fontSize: 13, color: '#666' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
