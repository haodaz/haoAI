'use client';
import React, { useState, useEffect } from 'react';
import { CloseOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { message, Modal } from 'antd';
import { Character, Room } from '@/lib/characters/types';

const PRIMARY = '#10b981';

const LENGTH_OPTIONS = [
  { val: 'short',     label: '简洁',  sub: '200字内' },
  { val: 'medium',    label: '适中',  sub: '500字内' },
  { val: 'detailed',  label: '详尽',  sub: '1000字内' },
  { val: 'unlimited', label: '不限',  sub: '' },
];

interface Props {
  open: boolean;
  room: Room;
  characters: Character[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (updates: Partial<Room & { speakingOrder: string[]; replyLength: string }>) => void;
}

function getAvatarUrl(char: Character | undefined): string {
  if (!char) return '';
  const src = char.assets?.talking || char.assets?.idle || char.assets?.avatar || char.avatar;
  if (!src) return '';
  return src.startsWith('http') || src.startsWith('/') ? src : `/characters/${char.id}/${src}`;
}

export default function RoomSettingsModal({ open, room, characters, isAdmin, onClose, onSaved }: Props) {
  const [order, setOrder] = useState<string[]>([]);
  const [replyLength, setReplyLength] = useState('medium');
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingBroadcast, setTogglingBroadcast] = useState(false);

  useEffect(() => {
    if (!open) return;
    let initialOrder = room.speakingOrder || room.characters || [];
    initialOrder = initialOrder.filter(id => room.characters?.includes(id));
    room.characters?.forEach(id => {
      if (!initialOrder.includes(id)) initialOrder.push(id);
    });
    setOrder(initialOrder);
    setReplyLength(room.replyLength || 'medium');
    setIsBroadcast(!!room.is_broadcast);
  }, [open, room]);

  const move = (charId: string, dir: -1 | 1) => {
    setOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(charId);
      if (idx < 0) return arr;
      if (dir === -1 && idx === 0) return arr;
      if (dir === 1 && idx === arr.length - 1) return arr;
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      return arr;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/roundtable/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakingOrder: order, replyLength }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '保存失败');
      message.success('设置已保存');
      onSaved({ speakingOrder: order, replyLength });
      onClose();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBroadcast = async () => {
    const turningOn = !isBroadcast;
    const confirmed = await new Promise<boolean>(resolve =>
      Modal.confirm({
        title: turningOn ? '确定要开启直播？' : '确定要暂停直播？',
        content: turningOn
          ? '观众只能看到从现在开始的新消息，之前的对话对观众不可见。'
          : '暂停后观众将无法继续看到新内容。',
        okText: turningOn ? '开启直播' : '暂停直播',
        okType: turningOn ? 'primary' : 'danger',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    );
    if (!confirmed) return;

    setTogglingBroadcast(true);
    try {
      const res = await fetch(`/api/roundtable/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_broadcast: turningOn }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '切换失败');
      setIsBroadcast(turningOn);
      onSaved({ is_broadcast: turningOn } as any);
      message.success(turningOn ? '直播已开启 🔴' : '直播已暂停');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setTogglingBroadcast(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.18s ease',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: 'calc(100vw - 32px)',
          maxHeight: '90vh', overflowY: 'auto',
          background: '#fff', borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          animation: 'modalIn 0.22s cubic-bezier(.4,0,.2,1)',
        }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 24px 0',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#14151f' }}>座谈室设置</h3>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: '#f3f4f6', cursor: 'pointer', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <CloseOutlined style={{ fontSize: 13 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* AI 发言顺序 */}
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9ca3af' }}>拖动或点击箭头调整 AI 的发言顺序</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {order.map((cid, idx) => {
                const char = characters.find(c => c.id === cid);
                const avatarUrl = getAvatarUrl(char);
                return (
                  <div key={cid} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#f9fafb', borderRadius: 12, padding: '10px 14px',
                    border: '1px solid #f0f0f4',
                  }}>
                    <span style={{ fontSize: 14, color: '#d1d5db', fontWeight: 600, width: 18, textAlign: 'center' }}>
                      {idx + 1}
                    </span>
                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
                      background: '#e0e7ff', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14,
                    }}>
                      {avatarUrl
                        ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        : <span>🤖</span>
                      }
                    </div>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#14151f' }}>
                      {char?.name || cid}
                    </span>
                    {/* ↑↓ buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[{ dir: -1 as const, Icon: ArrowUpOutlined, disabled: idx === 0 },
                        { dir: 1 as const, Icon: ArrowDownOutlined, disabled: idx === order.length - 1 }
                      ].map(({ dir, Icon, disabled }) => (
                        <button
                          key={dir}
                          onClick={() => !disabled && move(cid, dir)}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            border: `1px solid ${disabled ? '#f0f0f4' : '#e5e7eb'}`,
                            background: disabled ? '#f9fafb' : '#fff',
                            color: disabled ? '#d1d5db' : '#374151',
                            cursor: disabled ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.12s',
                          }}
                          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#f0eeff'; }}
                          onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
                          <Icon style={{ fontSize: 11 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI 回复长度 */}
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#14151f' }}>AI 回复长度</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {LENGTH_OPTIONS.map(opt => {
                const active = replyLength === opt.val;
                return (
                  <button
                    key={opt.val}
                    onClick={() => setReplyLength(opt.val)}
                    style={{
                      padding: '10px 4px', borderRadius: 12,
                      border: `1.5px solid ${active ? PRIMARY : '#e5e7eb'}`,
                      background: active ? PRIMARY : '#fff',
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : '#374151' }}>
                      {opt.label}
                    </div>
                    {opt.sub && (
                      <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.8)' : '#9ca3af', marginTop: 2 }}>
                        {opt.sub}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 直播状态（仅 admin） */}
          {isAdmin && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderTop: '1px solid #f3f4f6', paddingTop: 20,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#14151f' }}>直播状态</div>
                <div style={{ fontSize: 12, color: isBroadcast ? '#ef4444' : '#9ca3af', marginTop: 3 }}>
                  {isBroadcast ? '直播中（观众可见）' : '未开启（观众不可见）'}
                </div>
              </div>
              <button
                onClick={handleToggleBroadcast}
                disabled={togglingBroadcast}
                style={{
                  padding: '7px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: isBroadcast ? '#fef2f2' : '#f0fdf4',
                  color: isBroadcast ? '#ef4444' : '#16a34a',
                  border: `1px solid ${isBroadcast ? '#fee2e2' : '#bbf7d0'}`,
                }}>
                {togglingBroadcast ? '处理中…' : isBroadcast ? '暂停直播' : '开启直播'}
              </button>
            </div>
          )}

          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', height: 48, borderRadius: 14, border: 'none',
              background: saving ? '#c4b5fd' : `linear-gradient(135deg, #786cff, ${PRIMARY})`,
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              boxShadow: '0 4px 16px rgba(91,64,232,0.3)',
              transition: 'opacity 0.15s',
            }}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
