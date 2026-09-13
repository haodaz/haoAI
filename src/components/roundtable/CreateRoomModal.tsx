'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { message } from 'antd';
import { CheckOutlined, CloseOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { Character } from '@/lib/ai/types';
import { useThemeNames } from '@/hooks/useThemeNames';

interface Props {
  open: boolean;
  characters: Character[];
  themes: string[];
  isAdmin?: boolean;
  onClose: () => void;
  onCreated: (data: any) => void;
}

const REPLY_LENGTHS = [
  { key: 'short',    label: '简洁', sub: '200字内' },
  { key: 'medium',   label: '适中', sub: '500字内' },
  { key: 'detailed', label: '详尽', sub: '1000字内' },
  { key: 'unlimited',label: '不限', sub: '' },
];

const PRIMARY = '#10b981';

// 获取头像 URL
function getAvatarUrl(char: Character): string | null {
  const src = char.assets?.idle || char.avatar;
  if (!src) return null;
  return src.startsWith('http') || src.startsWith('/') ? src : `/characters/${char.id}/${src}`;
}

export default function CreateRoomModal({ open, characters, themes, isAdmin, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState('全部');
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [roomName, setRoomName] = useState('');
  const themeNames = useThemeNames();
  const [replyLength, setReplyLength] = useState('medium');
  const [isLive, setIsLive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 动态专题列表（从角色数据中提取），按显示名去重
  const allThemes = useMemo(() => {
    const rawIds = Array.from(new Set(characters.map(c => c.theme_id).filter(Boolean))) as string[];
    const seenLabels = new Set<string>();
    const unique = rawIds.filter(id => {
      const label = themeNames[id] || id;
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    });
    return ['全部', ...unique];
  }, [characters, themeNames]);

  // 过滤角色
  const filtered = characters.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchTheme = themeFilter === '全部' || c.theme_id === themeFilter;
    return matchSearch && matchTheme;
  });

  // 同步 order 跟 selected
  useEffect(() => {
    setOrder(prev => {
      const next = prev.filter(id => selected.includes(id));
      selected.forEach(id => { if (!next.includes(id)) next.push(id); });
      return next;
    });
  }, [selected]);

  // 重置 state
  useEffect(() => {
    if (!open) {
      setStep(1); setSearch(''); setThemeFilter('全部');
      setSelected([]); setOrder([]); setRoomName('');
      setReplyLength('medium'); setIsLive(false);
    }
  }, [open]);

  const toggleSelect = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 5 ? prev : [...prev, id]
    );
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
  };
  const moveDown = (idx: number) => {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
  };

  const handleNext = () => {
    if (selected.length < 2) { message.warning('请至少选择 2 个角色'); return; }
    const names = order.map(id => characters.find(c => c.id === id)?.name).filter(Boolean);
    if (!roomName) setRoomName(names.join(' × '));
    setStep(2);
  };

  const handleCreate = async () => {
    if (!roomName.trim()) { message.warning('请填写聊天室名称'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/roundtable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), characters: order, replyLength, is_broadcast: isLive }),
      });
      const result = await res.json();
      if (result.ok) { message.success('聊天室创建成功'); onCreated(result.data); }
      else message.error(result.error || '创建失败');
    } catch { message.error('创建失败，请重试'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  if (typeof window === 'undefined') return null;

  return ReactDOM.createPortal(
    <div ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000000001,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
          width: 560, maxWidth: '95vw', maxHeight: '85vh',
          borderRadius: 22, background: '#fff',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.20)',
          animation: 'modal-in 0.22s ease',
          overflow: 'hidden'
      }}>

        {/* ── 顶部 Header ── */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#14151f' }}>创建聊天室</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: 4 }}>
            <CloseOutlined />
          </button>
        </div>

        {/* ── 步骤指示条 ── */}
        <div style={{ padding: '0 24px 16px', flexShrink: 0 }}>
          <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 3, display: 'flex', gap: 2 }}>
            {['选择 AI 角色', '设置发言顺序'].map((label, i) => {
              const active = step === i + 1;
              return (
                <div key={label} style={{
                  flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: active ? '#fff' : 'transparent',
                  color: active ? PRIMARY : '#9ca3af',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                  transition: 'all 0.18s',
                }}>
                  {i + 1}. {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body（可滚动）── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 4px', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>

          {/* ════ 第一步 ════ */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 搜索框 */}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 搜索角色名称…"
                style={{
                  width: '100%', border: `1.5px solid ${search ? PRIMARY : '#e5e7eb'}`,
                  borderRadius: 10, padding: '9px 14px', fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', background: '#fff',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = PRIMARY}
                onBlur={e => e.target.style.borderColor = search ? PRIMARY : '#e5e7eb'}
              />

              {/* 专题筛选 — 单行横滑 */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap',
                paddingBottom: 2, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <style>{`.theme-strip::-webkit-scrollbar { display: none; }`}</style>
                {allThemes.map(t => {
                  const active = themeFilter === t;
                  return (
                    <button key={t} onClick={() => setThemeFilter(t)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                        border: `1px solid ${active ? PRIMARY : '#e5e7eb'}`,
                        background: active ? PRIMARY : '#f9f9fb',
                        color: active ? '#fff' : '#6b7280',
                        cursor: 'pointer', transition: 'all 0.15s',
                        flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#ecfdf5'; (e.currentTarget as HTMLElement).style.borderColor = '#6ee7b7'; (e.currentTarget as HTMLElement).style.color = PRIMARY; } }}
                      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#f9f9fb'; (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; } }}>
                      {t === '全部' ? '全部' : (themeNames[t] || t)}
                    </button>
                  );
                })}
              </div>

              {/* 已选计数 */}
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                已选 <span style={{ color: PRIMARY, fontWeight: 600 }}>{selected.length}</span> / 5 个（最少 2 个）
              </div>

              {/* 角色列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(char => {
                  const isSelected = selected.includes(char.id);
                  const isDisabled = !isSelected && selected.length >= 5;
                  const avatarUrl = getAvatarUrl(char);
                  return (
                    <div key={char.id} onClick={() => !isDisabled && toggleSelect(char.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10, cursor: isDisabled ? 'not-allowed' : 'pointer',
                        border: `1.5px solid ${isSelected ? '#6ee7b7' : 'transparent'}`,
                        background: isSelected ? '#ecfdf5' : 'transparent',
                        opacity: isDisabled ? 0.4 : 1,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isDisabled && !isSelected) { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; } }}
                      onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; } }}>
                      {/* 头像 */}
                      <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#f3f4f6' }}>
                        {avatarUrl
                          ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{char.name[0]}</div>
                        }
                      </div>
                      {/* 文字 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#14151f' }}>{char.name}</div>
                        {char.tagline && <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.tagline.split('/').pop()?.trim()}</div>}
                      </div>
                      {/* 勾选圆圈 */}
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? PRIMARY : '#d1d5db'}`,
                        background: isSelected ? PRIMARY : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {isSelected && <CheckOutlined style={{ fontSize: 10, color: '#fff' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════ 第二步 ════ */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 发言顺序卡片 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>发言顺序</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {order.map((id, idx) => {
                    const char = characters.find(c => c.id === id);
                    if (!char) return null;
                    const avatarUrl = getAvatarUrl(char);
                    return (
                      <div key={id} style={{
                        padding: '12px 14px', background: '#f9f9fb',
                        borderRadius: 12, border: '1.5px solid #e5e7eb',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        {/* 序号 */}
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: PRIMARY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        {/* 头像 */}
                        <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#f3f4f6' }}>
                          {avatarUrl
                            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }}>{char.name[0]}</div>
                          }
                        </div>
                        {/* 名字 */}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#14151f' }}>{char.name}</span>
                        {/* 上下箭头 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {[{ fn: () => moveUp(idx), icon: <UpOutlined style={{ fontSize: 8 }} />, disabled: idx === 0 },
                            { fn: () => moveDown(idx), icon: <DownOutlined style={{ fontSize: 8 }} />, disabled: idx === order.length - 1 }]
                            .map((btn, bi) => (
                              <button key={bi} onClick={btn.fn} disabled={btn.disabled}
                                style={{
                                  width: 22, height: 18, border: '1px solid #e5e7eb', borderRadius: 4,
                                  background: btn.disabled ? '#f9f9fb' : '#fff', cursor: btn.disabled ? 'default' : 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: btn.disabled ? '#d1d5db' : '#6b7280', opacity: btn.disabled ? 0.5 : 1,
                                }}
                                onMouseEnter={e => { if (!btn.disabled) (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = btn.disabled ? '#f9f9fb' : '#fff'; }}>
                                {btn.icon}
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 聊天室名称 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>座谈室名称</div>
                <input value={roomName} onChange={e => setRoomName(e.target.value)}
                  placeholder="给聊天室起个名字…"
                  style={{
                    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10,
                    padding: '9px 14px', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', background: '#fff', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = PRIMARY}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              {/* AI 回复长度 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>AI 回复长度</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {REPLY_LENGTHS.map(opt => {
                    const active = replyLength === opt.key;
                    return (
                      <button key={opt.key} onClick={() => setReplyLength(opt.key)}
                        style={{
                          padding: '10px 6px', borderRadius: 10, border: `1.5px solid ${active ? PRIMARY : '#e5e7eb'}`,
                          background: active ? PRIMARY : '#fff', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = PRIMARY; (e.currentTarget as HTMLElement).style.background = '#ecfdf5'; } }}
                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.background = '#fff'; } }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#fff' : '#374151' }}>{opt.label}</span>
                        {opt.sub && <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.75)' : '#9ca3af' }}>{opt.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 直播模式（仅 admin 可见）*/}
              {isAdmin && (
                <div style={{ background: '#fff1f2', border: '1px solid #ffe4e6', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input type="checkbox" id="live-mode" checked={isLive} onChange={e => setIsLive(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#ef4444', marginTop: 2, flexShrink: 0 }} />
                  <label htmlFor="live-mode" style={{ fontSize: 13, color: '#991b1b', cursor: 'pointer', lineHeight: 1.5 }}>
                    🔴 设为直播聊天室（向所有人公开）
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderTop: '1px solid #f1f3f4' }}>
          <button
            onClick={step === 1 ? onClose : () => setStep(1)}
            style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {step === 1 ? '取消' : '上一步'}
          </button>
          <button
            onClick={step === 1 ? handleNext : handleCreate}
            disabled={submitting}
            style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
            {step === 1 ? '下一步 →' : submitting ? '创建中…' : '创建聊天室'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}
