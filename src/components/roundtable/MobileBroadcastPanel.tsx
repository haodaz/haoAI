'use client';
import React, { useState, useRef, useEffect } from 'react';
import { ShareAltOutlined, EyeOutlined, EyeInvisibleOutlined, SendOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { AudienceMessage } from '@/lib/characters/types';

const CREATOR_NOTICE = '📢 【直播提醒】您已进入直播聊天室（房主视角）。发言无冷却时间限制，且带有专属标识。祝您直播顺利！';
const AUDIENCE_NOTICE = '📢 【直播提醒】您已进入直播聊天室。每人每 60 秒可发送一条弹幕，请保持友善交流、理性表达，共同营造美好氛围 🌟';

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

export default function MobileBroadcastPanel({
  roomId, roomName, messages, presenceCount, isCreator, username, presenceId, characterNames = [],
}: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showMsgs, setShowMsgs] = useState(true);
  const [shareDone, setShareDone] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll danmaku
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || cooldown > 0) return;
    const content = input.trim();
    setInput('');
    try {
      const res = await fetch(`/api/roundtable/${roomId}/audience/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, username, isCreator }),
      });
      if (res.status === 429) { message.warning('发言太频繁，请休息一分钟'); return; }
      if (!isCreator) {
        setCooldown(60);
        cooldownRef.current = setInterval(() => {
          setCooldown(c => {
            if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
            return c - 1;
          });
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
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: '25%', display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', background: 'transparent',
      zIndex: 20, pointerEvents: 'none',
    }}>
      {/* Danmaku stream */}
      {showMsgs && (
        <div ref={msgsRef} style={{
          flex: 1, overflowY: 'auto', padding: '6px 12px',
          display: 'flex', flexDirection: 'column', gap: 5,
          pointerEvents: 'auto',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black)',
          maskImage: 'linear-gradient(to bottom, transparent, black 20%, black)',
        }}>
          {/* 直播提醒 */}
          <div style={{
            alignSelf: 'flex-start', maxWidth: '95%',
            background: isCreator ? 'rgba(249,115,22,0.75)' : 'rgba(91,64,232,0.75)',
            color: '#fff', padding: '6px 10px', borderRadius: 10,
            fontSize: 11.5, lineHeight: 1.5,
          }}>
            {isCreator ? CREATOR_NOTICE : AUDIENCE_NOTICE}
          </div>
          {messages.map((m, i) => {
            if (m.type === 'system') return (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', paddingLeft: 4 }}>
                {m.text}
              </div>
            );
            return (
              <div key={i} style={{
                alignSelf: 'flex-start', maxWidth: '90%',
                background: 'rgba(0,0,0,0.45)', color: '#fff',
                padding: '5px 10px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.4,
              }}>
                {m.isCreator && (
                  <span style={{ background: '#f97316', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, marginRight: 5 }}>房主</span>
                )}
                <span style={{ color: m.isCreator ? '#fb923c' : '#facc15', fontWeight: 600, marginRight: 4 }}>{m.username}</span>
                {m.text || m.content}
              </div>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 52px 8px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
        pointerEvents: 'auto', position: 'relative',
      }}>
        {/* Input */}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { if (!input) setFocused(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder="说点什么…"
          style={{
            flex: focused ? 1 : undefined,
            width: focused ? undefined : 'calc(100% - 110px)',
            padding: '9px 14px', fontSize: 14,
            background: 'rgba(0,0,0,0.25)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 20, outline: 'none',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        />

        {/* Send button — only visible when focused */}
        {focused && (
          <button
            onClick={handleSend}
            disabled={cooldown > 0}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: cooldown > 0
                ? 'rgba(100,100,100,0.6)'
                : 'linear-gradient(135deg,#34d399,#10b981)',
              color: '#fff', cursor: cooldown > 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
              boxShadow: '0 2px 8px rgba(91,64,232,0.4)',
            }}>
            {cooldown > 0 ? cooldown : <SendOutlined style={{ fontSize: 15 }} />}
          </button>
        )}

        {/* Share — fixed top-right */}
        <button onClick={handleShare} style={{
          position: 'absolute', right: 8, top: 'calc(50% - 44px)',
          transform: 'translateY(-50%)',
          width: 36, height: 36, borderRadius: '50%',
          background: shareDone ? 'rgba(16,185,129,0.7)' : 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}>
          <ShareAltOutlined style={{ fontSize: 16 }} />
        </button>

        {/* Eye toggle — fixed right */}
        <button onClick={() => setShowMsgs(v => !v)} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {showMsgs
            ? <EyeOutlined style={{ fontSize: 16 }} />
            : <EyeInvisibleOutlined style={{ fontSize: 16 }} />
          }
        </button>
      </div>
    </div>
  );
}
