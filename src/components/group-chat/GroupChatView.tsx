'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Spin, Modal, Checkbox, message, Popconfirm } from 'antd';
import { Send, Plus, Users, Trash2, CheckCircle, XCircle, Settings, ArrowUp, ArrowDown, Play, Copy, Zap, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/layout/WorkspaceContext';

// ── 聊天大厅卡片 ──
function GroupChatLobby({ onEnterChat, allAgents }: { onEnterChat: (id: string) => void, allAgents: any[] }) {
  const { t } = useTranslation();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/bristh/group-chat');
      if (!res.ok) {
        const text = await res.text();
        console.error('API Error:', res.status, text);
        message.error(`Failed to load chats: ${res.status} ${text.substring(0, 50)}`);
        setChats([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setChats(data);
      } else {
        console.error('Expected array but got:', data);
        setChats([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchChats(); }, []);

  const handleCreate = async () => {
    if (!newChatName.trim()) return message.error(t('bristh.groupChat.reqName', '请输入群名称'));
    if (selectedAgents.length === 0) return message.error(t('bristh.groupChat.reqAgents', '请选择至少一个 AI 员工'));
    setCreating(true);
    try {
      const res = await fetch('/api/bristh/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChatName, topic: '', agents: selectedAgents })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error: ${text}`);
      }
      const data = await res.json();
      setCreateModalOpen(false);
      setNewChatName('');
      setSelectedAgents([]);
      fetchChats();
      onEnterChat(data.id);
    } catch (e: any) {
      message.error(e.message || t('bristh.groupChat.createFailed', '创建失败'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/bristh/group-chat/${id}`, { method: 'DELETE' });
      message.success(t('bristh.groupChat.deleted', '已删除'));
      fetchChats();
    } catch (e) {
      message.error(t('bristh.groupChat.delFailed', '删除失败'));
    }
  };

  if (loading) return <div className="p-10 text-center"><Spin size="large" /></div>;

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-gray-800 flex items-center">
          <Users className="w-6 h-6 mr-2 text-indigo-500" /> {t('bristh.groupChat.title', 'AI 员工群聊 (Roundtable)')}
        </h2>
        <button 
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm font-bold text-sm"
        >
          <Plus className="w-4 h-4 mr-1" /> {t('bristh.groupChat.newChat', '新建群聊')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {chats.map(chat => (
          <div key={chat.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow relative group">
            <Popconfirm title={t('bristh.groupChat.confirmDelete', '确定解散此群吗？')} onConfirm={() => handleDelete(chat.id)}>
              <button className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-4 h-4" />
              </button>
            </Popconfirm>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{chat.name}</h3>
            <div className="flex gap-2 mb-4">
              {chat.participants.map((p: any) => {
                const agent = allAgents.find(a => a.id === p.agentId);
                if (!agent) return null;
                return (
                  <div key={p.id} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-200" title={agent.name}>
                    {agent.avatar ? <img src={agent.avatar} className="w-full h-full rounded-full object-cover" /> : agent.name[0]}
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 line-clamp-2 min-h-[40px]">
              {chat.messages?.[0]?.content || t('bristh.groupChat.noMsgs', '暂无消息')}
            </p>
            <button 
              onClick={() => onEnterChat(chat.id)}
              className="mt-4 w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-100"
            > {t('bristh.groupChat.enterChat', '进入群聊')} </button>
          </div>
        ))}
        {chats.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400 font-bold"> {t('bristh.groupChat.noChatTitle', '暂无群聊，快去创建一个吧')} </div>
        )}
      </div>

      <Modal title={t('bristh.groupChat.createModalTitle', '新建 AI 群聊')} open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={handleCreate} confirmLoading={creating}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1"> {t('bristh.groupChat.chatName', '群名称')} </label>
            <input 
              value={newChatName} onChange={e => setNewChatName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
              placeholder={t('bristh.groupChat.chatNamePlaceholder', '例如：市场方案攻坚组')}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2"> {t('bristh.groupChat.selectAgents', '选择参与的 AI 员工')} </label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {allAgents.map(agent => (
                <label key={agent.id} className="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-100">
                  <Checkbox 
                    checked={selectedAgents.includes(agent.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedAgents([...selectedAgents, agent.id]);
                      else setSelectedAgents(selectedAgents.filter(id => id !== agent.id));
                    }}
                  />
                  <div className="ml-3 flex items-center">
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 overflow-hidden shadow-sm mr-3">
                      {agent.avatar ? <img src={agent.avatar} className="w-full h-full object-cover"/> : agent.name[0]}
                    </div>
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{agent.name}</div>
                      <div className="text-xs text-gray-500">{agent.title || agent.description?.substring(0, 20)}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── 聊天室窗口 ──
function ChatRoom({ chatId, onBack, allAgents }: { chatId: string, onBack: () => void, allAgents: any[] }) {
  const { t } = useTranslation();
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState<{ id: string, name: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convertingToTask, setConvertingToTask] = useState(false);
  const router = useRouter();
  const { setPendingNewTaskInput, setPendingAgentTask } = useWorkspace();
  
  // Settings State
  const [speakingOrder, setSpeakingOrder] = useState<string[]>([]);
  const [responseLength, setResponseLength] = useState('moderate');
  const [mentionMenu, setMentionMenu] = useState<{ visible: boolean, filter: string }>({ visible: false, filter: '' });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchChat = () => {
    fetch(`/api/bristh/group-chat/${chatId}`)
      .then(res => res.json())
      .then(data => {
        setChatInfo(data);
        setMessages(data.messages || []);
        
        let order = data.speakingOrder || [];
        const parts = data.participants.map((p: any) => p.agentId).filter((id: string) => id !== 'USER');
        // Ensure all participants are in order array
        parts.forEach((p: string) => { if (!order.includes(p)) order.push(p); });
        order = order.filter((p: string) => parts.includes(p)); // filter out removed
        
        setSpeakingOrder(order);
        setResponseLength(data.responseLength || 'moderate');
        scrollToBottom();
      });
  };

  useEffect(() => { fetchChat(); }, [chatId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msgText = input;
    setInput('');
    setMentionMenu({ visible: false, filter: '' });
    setSending(true);

    try {
      const res = await fetch(`/api/bristh/group-chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText })
      });

      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'start') {
                  setMessages(prev => [...prev, data.data]);
                  scrollToBottom();
                } else if (data.type === 'agent_start') {
                  setAgentTyping(data.data);
                  setMessages(prev => [...prev, { _temp: true, senderId: data.data.agentId, content: '' }]);
                  scrollToBottom();
                } else if (data.type === 'agent_chunk') {
                  setMessages(prev => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last._temp) {
                      last.content += data.data.text;
                    }
                    return next;
                  });
                  scrollToBottom();
                } else if (data.type === 'agent_done') {
                  setAgentTyping(null);
                  setMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1] = data.data; // replace temp with real
                    return next;
                  });
                  scrollToBottom();
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      message.error(t('bristh.groupChat.sendFailed', '发送失败'));
    } finally {
      setSending(false);
      setAgentTyping(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(`/api/bristh/group-chat/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakingOrder, responseLength })
      });
      message.success(t('bristh.groupChat.saved', '设置已保存'));
      setSettingsOpen(false);
      fetchChat();
    } catch (e) {
      message.error(t('bristh.groupChat.saveFailed', '保存失败'));
    }
  };

  const moveOrder = (id: string, dir: number) => {
    setSpeakingOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(id);
      if (idx < 0) return arr;
      if (dir === -1 && idx === 0) return arr;
      if (dir === 1 && idx === arr.length - 1) return arr;
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      return arr;
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    const lastAtIdx = val.lastIndexOf('@');
    if (lastAtIdx !== -1 && !val.substring(lastAtIdx).includes(' ')) {
      setMentionMenu({ visible: true, filter: val.substring(lastAtIdx + 1).toLowerCase() });
    } else {
      setMentionMenu({ visible: false, filter: '' });
    }
  };

  if (!chatInfo) return <div className="flex h-full items-center justify-center"><Spin size="large"/></div>;

  const participantsInfo = speakingOrder.map(id => allAgents.find(a => a.id === id)).filter(Boolean);
  // for @ mention menu
  const mentionCandidates = participantsInfo.filter((a: any) => 
    a.name.toLowerCase().includes(mentionMenu.filter) || 
    a.id.toLowerCase().includes(mentionMenu.filter) || 
    (a.title && a.title.toLowerCase().includes(mentionMenu.filter))
  );

  return (
    <div className="flex h-full bg-white relative">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-gray-100 bg-gray-50 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-gray-200">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 text-sm font-bold flex items-center mb-4 transition-colors">
            ← 返回大厅
          </button>
          <h2 className="font-black text-gray-900 text-lg truncate">{chatInfo.name}</h2>
          <div className="text-xs text-gray-500 mt-1 font-medium">{participantsInfo.length} Agents participating</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {participantsInfo.map((a: any, idx: number) => (
            <div key={a.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 relative">
              <div className="absolute -top-2 -left-2 w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-sm z-10">{idx + 1}</div>
              <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                {a.avatar ? <img src={a.avatar} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full w-full font-bold text-gray-500">{a.name[0]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-gray-900 text-sm truncate">{a.name}</div>
                <div className="text-xs text-gray-500 truncate">{a.title || a.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shadow-sm z-10 shrink-0">
          <div className="flex items-center md:hidden">
            <button onClick={onBack} className="mr-4 text-gray-400 font-bold hover:text-gray-800"> {t('bristh.groupChat.backBtn', '返回')} </button>
            <h2 className="text-lg font-black truncate">{chatInfo.name}</h2>
          </div>
          <div className="hidden md:block text-sm font-bold text-gray-500 truncate mr-4">
            {chatInfo.topic || 'Roundtable Discussion'}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={async () => {
                if (messages.length === 0) return message.warning('没有对话内容可以转为任务');
                setConvertingToTask(true);
                // Format chat history with agent names
                const transcript = messages.map(msg => {
                  if (msg.senderId === 'USER') return `[用户]: ${msg.content}`;
                  const agent = allAgents.find(a => a.id === msg.senderId);
                  const label = agent ? `${agent.name}, ${agent.title}` : msg.senderId;
                  return `[${label}]: ${msg.content}`;
                }).join('\n\n');
                const header = `以下是一段 AI 圆桌讨论记录，请根据讨论共识制定任务：\n\n---\n\n`;
                setPendingNewTaskInput(header + transcript);
                setConvertingToTask(false);
                router.push('/new-task');
              }}
              disabled={convertingToTask || messages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all text-xs font-bold shrink-0 shadow-sm shadow-emerald-500/20 disabled:opacity-50"
            >
              {convertingToTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              转为任务
            </button>
            <button 
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold shrink-0"
            >
              <Settings className="w-4 h-4" /> {t('bristh.groupChat.settings', '设置')}
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
          {messages.map((msg, idx) => {
            const isUser = msg.senderId === 'USER';
            const agentInfo = allAgents.find(a => a.id === msg.senderId);
            
            return (
              <div key={msg.id || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
                  <div className="w-10 h-10 rounded-full flex-shrink-0 bg-gray-200 overflow-hidden border-2 border-white shadow-sm flex justify-center items-center font-bold text-gray-500">
                    {isUser ? 'U' : (agentInfo?.avatar ? <img src={agentInfo.avatar} className="w-full h-full object-cover"/> : agentInfo?.name?.[0])}
                  </div>
                  <div className="group/bubble">
                    {!isUser && <div className="text-xs font-bold text-gray-500 mb-1 ml-1">{agentInfo?.name}</div>}
                    <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm whitespace-pre-wrap leading-relaxed ${isUser ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'}`}>
                      {msg.content}
                      {msg.content.includes('Please confirm and I will execute it') && (
                        <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                          <span className="text-indigo-800 font-bold flex items-center text-xs"><CheckCircle className="w-4 h-4 mr-1 text-indigo-500"/> Action Requested</span>
                          <div className="space-x-2">
                            <button className="px-3 py-1 bg-white text-gray-600 font-bold text-xs rounded shadow-sm hover:text-red-500">Decline</button>
                            <button className="px-3 py-1 bg-indigo-600 text-white font-bold text-xs rounded shadow-sm hover:bg-indigo-700">Approve & Execute</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {!isUser && !msg._temp && msg.content && (
                      <div className="flex items-center gap-1 mt-1 ml-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                        <button
                          onClick={() => { navigator.clipboard.writeText(msg.content); message.success('已复制'); }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="复制内容"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {agentInfo && (
                          <button
                            onClick={() => {
                              const context = messages.map(m => {
                                if (m.senderId === 'USER') return `[用户]: ${m.content}`;
                                const a = allAgents.find(ag => ag.id === m.senderId);
                                return `[${a?.name || m.senderId}]: ${m.content}`;
                              }).join('\n');
                              setPendingAgentTask({ agentId: agentInfo.id, context });
                              router.push('/AImployee');
                            }}
                            className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                            title={`让 ${agentInfo.name} 执行`}
                          >
                            <Zap className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {agentTyping && (
            <div className="flex justify-start">
              <div className="flex items-center bg-white px-4 py-3 rounded-full shadow-sm border border-gray-100 text-sm text-gray-500 font-bold">
                <Spin size="small" className="mr-2" /> {agentTyping.name} is typing...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-100 relative shrink-0">
          {/* Mention Popover */}
          {mentionMenu.visible && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
              <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 border-b border-gray-100"> {t('bristh.groupChat.mention', '提到 (Mention)')} </div>
              <div className="max-h-48 overflow-y-auto">
                {mentionCandidates.map((a: any) => (
                  <button 
                    key={a.id}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      const lastAtIdx = input.lastIndexOf('@');
                      setInput(input.substring(0, lastAtIdx) + `@${a.name} `);
                      setMentionMenu({ visible: false, filter: '' });
                      inputRef.current?.focus();
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shrink-0 border border-gray-100">
                      {a.avatar ? <img src={a.avatar} className="w-full h-full object-cover"/> : <span className="flex h-full items-center justify-center text-xs font-bold">{a.name[0]}</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{a.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{a.title}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={sending}
              placeholder={t('bristh.groupChat.placeholder', 'Type a message... Use @ to mention specific AI.')}
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
            />
            <button 
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm transition-colors shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal
        title={<div className="text-lg font-black text-gray-800">{t('bristh.groupChat.settingsTitle', '座谈室设置')}</div>}
        open={settingsOpen}
        onCancel={() => {
          setSettingsOpen(false);
          // Revert to fetched state on cancel
          fetchChat(); 
        }}
        footer={null}
        width={460}
      >
        <div className="space-y-6 mt-4">
          <div>
            <div className="text-sm font-bold text-gray-700 mb-1"> {t('bristh.groupChat.orderTitle', '调整发言顺序')} </div>
            <div className="text-xs text-gray-400 mb-3"> {t('bristh.groupChat.orderSub', '使用箭头调整 AI 依次回复的先后顺序')} </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto p-2 border border-gray-100 rounded-xl bg-gray-50/50">
              {participantsInfo.map((a: any, idx: number) => (
                <div key={a.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-xs font-bold text-gray-400 shrink-0">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                      {a.avatar ? <img src={a.avatar} className="w-full h-full object-cover"/> : <span className="flex h-full items-center justify-center text-xs font-bold">{a.name[0]}</span>}
                    </div>
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-sm text-gray-800 truncate">{a.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{a.title}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button 
                      onClick={() => moveOrder(a.id, -1)} 
                      disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    ><ArrowUp className="w-4 h-4"/></button>
                    <button 
                      onClick={() => moveOrder(a.id, 1)} 
                      disabled={idx === participantsInfo.length - 1}
                      className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    ><ArrowDown className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <div className="text-sm font-bold text-gray-700 mb-3"> {t('bristh.groupChat.lengthTitle', 'AI 回复长度')} </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: 'short', label: t('bristh.groupChat.lenShort', '简洁'), sub: t('bristh.groupChat.lenShortSub', '200字内') },
                { val: 'moderate', label: t('bristh.groupChat.lenMod', '适中'), sub: t('bristh.groupChat.lenModSub', '500字内') },
                { val: 'detailed', label: t('bristh.groupChat.lenDet', '详尽'), sub: t('bristh.groupChat.lenDetSub', '1000字') },
                { val: 'unlimited', label: t('bristh.groupChat.lenUnl', '不限'), sub: t('bristh.groupChat.lenUnlSub', '畅所欲言') }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setResponseLength(opt.val)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${responseLength === opt.val ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                >
                  <span className={`font-bold text-sm ${responseLength === opt.val ? 'text-indigo-700' : 'text-gray-700'}`}>{opt.label}</span>
                  <span className={`text-[10px] mt-1 ${responseLength === opt.val ? 'text-indigo-400' : 'text-gray-400'}`}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <button onClick={() => { setSettingsOpen(false); fetchChat(); }} className="px-5 py-2 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"> {t('bristh.groupChat.cancel', '取消')} </button>
            <button onClick={handleSaveSettings} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"> {t('bristh.groupChat.save', '保存设置')} </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function GroupChatView() {
  const { t } = useTranslation();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bristh/agents/config')
      .then(res => res.json())
      .then(data => {
        const HIDDEN_AGENTS = ['atlas', 'jarvis', 'nexus', 'nova'];
        setAllAgents(data.filter((a: any) => a.role !== 'orchestrator' && a.enabled && !HIDDEN_AGENTS.includes(a.name?.toLowerCase())));
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex h-full items-center justify-center"><Spin size="large"/></div>;

  if (activeChatId) {
    return <ChatRoom chatId={activeChatId} onBack={() => setActiveChatId(null)} allAgents={allAgents} />;
  }
  return <GroupChatLobby onEnterChat={setActiveChatId} allAgents={allAgents} />;
}
