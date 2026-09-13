'use client';
import React, { useState, useRef, useEffect } from 'react';
import { ShareAltOutlined, EyeOutlined, EyeInvisibleOutlined, SendOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { AudienceMessage } from '@/lib/characters/types';

interface Props {
  roomId: string;
  roomName: string;
  messages: AudienceMessage[];
  presenceCount: number;
  isCreator: boolean;
  username: string;
  presenceId: string;
  characterNames?: string[];
}

const CREATOR_NOTICE = '📢 【直播提醒】您已进入直播聊天室（房主视角）。您在观众席的发言无冷却时间限制，且带有专属标识。祝您直播顺利！';
const AUDIENCE_NOTICE = '📢 【直播提醒】您已进入直播聊天室。每人每 60 秒可发送一条弹幕，请保持友善交流、理性表达，共同营造美好的交流氛围 🌟';

export default function DesktopAudiencePanel({
  roomId, roomName, messages, presenceCount, isCreator, username, presenceId, characterNames = [],
}: Props) {
  const [input, setInput] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [showMsgs, setShowMsgs] = useState(true);
  const [shareDone, setShareDone] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || cooldown > 0) return;
    const content = input.trim();
    setInput('');
    try {
      const res = await fetch(`/api/roundtable/${roomId}/audience/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, username, isCreator }),
      });
      if (res.status === 429) { message.warning('发言太频繁，请休息一分钟'); return; }
      if (!isCreator) {
        setCooldown(60);
        cooldownRef.current = setInterval(() => {
          setCooldown(c => { if (c <= 1) { clearInterval(cooldownRef.current!); return 0; } return c - 1; });
        }, 1000);
      }
    } catch { message.error('发送失败'); }
  };

  const handleShare = async () => {
    const link = `${window.location.origin}/?roomId=${roomId}`;
    const memberNames = characterNames.join('、') || '开始论道';
    const text = `🔥 快来围观直播聊天室：【${roomName}】\n🎙️ 嘉宾：${memberNames}\n👉 立即加入：${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setShareDone(true);
      message.success('邀请文字已复制，快去分享吧！');
      setTimeout(() => setShareDone(false), 2000);
    } catch { message.error('复制失败'); }
  };

  return (
    <div style={{
      width: 248, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg, linear-gradient(175.11deg,rgba(234,244,253,1) 0%,rgba(224,228,242,1) 100%))',
      borderLeft: '1px solid rgba(91,64,232,0.1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(91,64,232,0.1)', flexShrink: 0,
        background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(6px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
            animation: 'audPulse 1.5s infinite',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#14151f' }}>观众席</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{presenceCount} 人在看</span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setShowMsgs(v => !v)} style={iconBtn}>
            {showMsgs ? <EyeOutlined style={{ fontSize: 12 }} /> : <EyeInvisibleOutlined style={{ fontSize: 12 }} />}
          </button>
          <button
            onClick={handleShare}
            style={{ ...iconBtn, ...(shareDone ? { color: '#10b981', borderColor: '#a7f3d0' } : {}) }}>
            <ShareAltOutlined style={{ fontSize: 12 }} />
          </button>
        </div>
      </div>

      {/* 弹幕消息流 */}
      <div ref={msgsRef} style={{
        flex: 1, overflowY: 'auto', padding: '10px 10px 4px',
        display: showMsgs ? 'flex' : 'none',
        flexDirection: 'column', gap: 8,
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(91,64,232,0.2) transparent',
      }}>
        {/* 直播提醒 banner */}
        <div style={{
          background: isCreator ? 'rgba(249,115,22,0.08)' : 'rgba(91,64,232,0.07)',
          border: `1px solid ${isCreator ? 'rgba(249,115,22,0.25)' : 'rgba(91,64,232,0.2)'}`,
          borderRadius: 10, padding: '9px 11px',
          fontSize: 11.5, lineHeight: 1.6,
          color: isCreator ? '#c2410c' : '#4c3aad',
        }}>
          {isCreator ? CREATOR_NOTICE : AUDIENCE_NOTICE}
        </div>

        {messages.map((m, i) => {
          if (m.type === 'system') return (
            <div key={i} style={{
              textAlign: 'center', fontSize: 11,
              color: '#9ca3af', fontStyle: 'italic', padding: '2px 0',
            }}>{m.text}</div>
          );
          return (
            <div key={i}>
              {/* 用户名在气泡外 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, paddingLeft: 2 }}>
                {m.isCreator && (
                  <span style={{ background: '#f97316', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>房主</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: m.isCreator ? '#f97316' : '#10b981' }}>{m.username}</span>
              </div>
              {/* 气泡：半透明蒙版感 */}
              <div style={{
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(6px)',
                border: '1px solid rgba(91,64,232,0.1)',
                borderRadius: '4px 12px 12px 12px',
                padding: '8px 11px',
                fontSize: 13, color: '#374151', lineHeight: 1.5,
                boxShadow: '0 1px 4px rgba(91,64,232,0.06)',
              }}>
                {m.text || m.content}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
            快来发送第一条弹幕吧 ✨
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div style={{
        padding: '10px 10px 14px', flexShrink: 0,
        borderTop: '1px solid rgba(91,64,232,0.1)',
        background: 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(6px)',
      }}>
        {/* 冷却提示 */}
        {cooldown > 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 6 }}>
            下次发言还需等待 <b style={{ color: '#10b981' }}>{cooldown}</b> 秒
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
            placeholder="说点什么…"
            style={{
              flex: 1, padding: '8px 12px', fontSize: 13,
              background: 'rgba(255,255,255,0.8)',
              border: `1px solid ${input ? '#10b981' : 'rgba(16,185,129,0.2)'}`,
              borderRadius: 20, outline: 'none', color: '#14151f',
              backdropFilter: 'blur(4px)',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={handleSend}
            disabled={cooldown > 0 || !input.trim()}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: cooldown > 0 || !input.trim()
                ? 'rgba(156,163,175,0.3)'
                : 'linear-gradient(135deg,#34d399,#10b981)',
              color: cooldown > 0 || !input.trim() ? '#9ca3af' : '#fff',
              cursor: cooldown > 0 || !input.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: input.trim() && cooldown === 0 ? '0 2px 8px rgba(91,64,232,0.4)' : 'none',
              transition: 'all 0.15s',
            }}>
            {cooldown > 0 ? <span style={{ fontSize: 10 }}>{cooldown}</span> : <SendOutlined style={{ fontSize: 13 }} />}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes audPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          60% { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7,
  background: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(91,64,232,0.15)',
  color: '#6b7280', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
};
