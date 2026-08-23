import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Map, BookOpen, Calendar, Home, Loader2, ShieldCheck, FileText, Users, BarChart, Globe, Database, PenTool, Sparkles, X } from 'lucide-react';
import { useChat } from '@/hooks/useChat';

export default function ProChatArea({ 
  api = '/api/chat', 
  variant = 'external', 
  language = 'zh',
  customTitle,
  customSubtitle,
  customCards,
  customQuickPrompts,
  customLogo,
  customDisclaimer,
  customPlaceholder
}: { 
  api?: string; 
  variant?: 'external' | 'internal'; 
  language?: 'zh' | 'en';
  customTitle?: string;
  customSubtitle?: string;
  customCards?: any[];
  customQuickPrompts?: string[];
  customLogo?: React.ReactNode;
  customDisclaimer?: string;
  customPlaceholder?: string;
}) {
  const { messages, sendMessage, loading: isLoading } = useChat([], api);
  const [localInput, setLocalInput] = useState('');
  const [activeMode, setActiveMode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleQuickSend = (text: string) => {
    sendMessage(text, undefined, undefined, undefined, { activeMode: activeMode || undefined });
  };

  const EXTERNAL_CARDS = language === 'en' ? [
    { 
      id: 'about',
      title: 'About', 
      desc: 'About Myddelton', 
      icon: <Map className="w-5 h-5 text-emerald-500" />, 
      bg: 'bg-emerald-50 hover:bg-emerald-100',
      greeting: 'Hello! I am the Myddelton College Info Assistant 🏫 I can tell you about our history, location, and campus facilities.',
      prompts: ['Tell me about the school history', 'Where is the school located?', 'What facilities do you have?']
    },
    { 
      id: 'admissions',
      title: 'Admissions', 
      desc: 'Admissions & Fees', 
      icon: <BookOpen className="w-5 h-5 text-blue-500" />, 
      bg: 'bg-blue-50 hover:bg-blue-100',
      greeting: 'Hello! I am the Admissions & Fees Assistant 📝 I can help you understand our application process, tuition fees, and scholarship opportunities.',
      prompts: ['What are the tuition fees?', 'How do I apply?', 'Are there any scholarships available?']
    },
    { 
      id: 'tour',
      title: 'Book a Tour', 
      desc: 'Book a Tour', 
      icon: <Calendar className="w-5 h-5 text-purple-500" />, 
      bg: 'bg-purple-50 hover:bg-purple-100',
      greeting: 'Hello! I am the Campus Tour Assistant 📅 I can help you schedule a visit to our beautiful campus, either in-person or virtually.',
      prompts: ['I want to book an in-person tour', 'Do you offer virtual tours?', 'When can I visit the school?']
    },
    { 
      id: 'boarding',
      title: 'Boarding', 
      desc: 'Boarding Life', 
      icon: <Home className="w-5 h-5 text-orange-500" />, 
      bg: 'bg-orange-50 hover:bg-orange-100',
      greeting: 'Hello! I am the Boarding Life Assistant 🛏️ I can share information about our boarding houses, daily routines, and weekend activities.',
      prompts: ['What is the boarding house like?', 'Describe a typical day for a boarder', 'What do boarders do on weekends?']
    },
  ] : [
    { 
      id: 'about',
      title: '学校概况', 
      desc: '了解米德尔顿', 
      icon: <Map className="w-5 h-5 text-emerald-500" />, 
      bg: 'bg-emerald-50 hover:bg-emerald-100',
      greeting: '你好！我是米德尔顿中学概况小助手 🏫 我可以为你介绍学校的历史背景、地理位置以及校园设施。',
      prompts: ['帮我介绍一下学校历史', '学校具体在英国哪里？', '校园里有哪些主要设施？']
    },
    { 
      id: 'admissions',
      title: '招生政策', 
      desc: '申请与学费', 
      icon: <BookOpen className="w-5 h-5 text-blue-500" />, 
      bg: 'bg-blue-50 hover:bg-blue-100',
      greeting: '你好！我是招生与学费小助手 📝 我可以带你了解申请流程、学费标准以及奖学金机会。',
      prompts: ['学费标准是多少？', '国际生如何申请？', '有没有针对新生的奖学金？']
    },
    { 
      id: 'tour',
      title: '访校预约', 
      desc: '实地与线上访校', 
      icon: <Calendar className="w-5 h-5 text-purple-500" />, 
      bg: 'bg-purple-50 hover:bg-purple-100',
      greeting: '你好！我是访校预约小助手 📅 我可以帮你安排实地参观我们美丽的校园，或者预约线上虚拟访校。',
      prompts: ['我想预约实地访校', '提供线上虚拟访校吗？', '什么时候可以参观学校？']
    },
    { 
      id: 'boarding',
      title: '寄宿生活', 
      desc: '宿舍与日常', 
      icon: <Home className="w-5 h-5 text-orange-500" />, 
      bg: 'bg-orange-50 hover:bg-orange-100',
      greeting: '你好！我是寄宿生活小助手 🛏️ 我可以为你分享宿舍环境、作息时间以及丰富的周末活动。',
      prompts: ['宿舍环境怎么样？', '寄宿生的一天是怎么安排的？', '周末有哪些课外活动？']
    },
  ];

  const INTERNAL_CARDS = [
    { 
      id: 'leads',
      title: '最新客情', 
      desc: '跟进意向客户', 
      icon: <Users className="w-5 h-5 text-emerald-500" />, 
      bg: 'bg-emerald-50 hover:bg-emerald-100',
      greeting: '你好！我是客情管理助手 👥 我可以帮你调取最新的意向客户名单并规划跟进策略。',
      prompts: ['查询今天新增的线索', '列出高意向但未分配的客户', '帮我拟定一封回访邮件']
    },
    { 
      id: 'reports',
      title: '生成周报', 
      desc: '分析咨询情况', 
      icon: <BarChart className="w-5 h-5 text-blue-500" />, 
      bg: 'bg-blue-50 hover:bg-blue-100',
      greeting: '你好！我是数据分析小助手 📊 我可以为你生成详尽的业务周报。',
      prompts: ['生成本周招生咨询分析报告', '对比上周的线索转化率', '导出重点客户跟进记录']
    },
    { 
      id: 'kb',
      title: '库容检测', 
      desc: '维护知识库', 
      icon: <Database className="w-5 h-5 text-purple-500" />, 
      bg: 'bg-purple-50 hover:bg-purple-100',
      greeting: '你好！我是知识库维护小助手 📚 我可以帮你检测知识盲区并完善问答库。',
      prompts: ['检查近期无法回答的提问', '有哪些高频问题需要补充？', '整理待完善的知识库词条']
    },
    { 
      id: 'tasks',
      title: '待办任务', 
      desc: '处理积压工作', 
      icon: <FileText className="w-5 h-5 text-orange-500" />, 
      bg: 'bg-orange-50 hover:bg-orange-100',
      greeting: '你好！我是待办任务小助手 ✅ 我可以帮你梳理并提醒今天需要优先处理的工作。',
      prompts: ['列出我今天的待办事项', '有哪些逾期未跟进的客户？', '提醒我下午三点的线上访校']
    },
  ];

  const isInternal = variant === 'internal';
  const activeCards = customCards || (isInternal ? INTERNAL_CARDS : EXTERNAL_CARDS);
  const activeModeData = activeMode ? activeCards.find(c => c.id === activeMode) : null;


  const displayMessages = useMemo(() => {
    if (activeModeData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return [{ id: 'mock-intro', role: 'assistant', content: '', toolCard: activeModeData } as any, ...messages];
    }
    return messages;
  }, [messages, activeModeData]);

  return (
    <div className={`flex flex-col h-full ${isInternal ? 'bg-[#f8fafc]' : 'bg-[#f4f7fa]'} relative font-sans`}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-24 py-8">
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pt-10 pb-20 animate-fade-in-up">
            <div className="mb-6 flex justify-center">
              <div className={`w-16 h-16 bg-white shadow-md rounded-full flex items-center justify-center overflow-hidden ${isInternal ? 'text-[#141b38]' : ''}`}>
                {isInternal ? (
                  <ShieldCheck className="w-8 h-8" />
                ) : customLogo ? (
                  customLogo
                ) : (
                  <img src="/logo-img.png" alt="Myddelton Crest" className="w-[90%] h-[90%] object-contain" />
                )}
              </div>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-medium text-[#141b38] mb-2 tracking-wide font-serif text-center">
              {customTitle || (isInternal ? '校长秘书工作台' : (language === 'en' ? 'Welcome to Myddelton College' : '欢迎来到米德尔顿中学'))}
            </h1>
            <p className="text-slate-500 mb-10 text-sm md:text-base text-center max-w-2xl">
              {customSubtitle || (isInternal 
                ? '已连接内部专线。支持查询 CRM 客情数据与高级知识库检索。' 
                : (language === 'en' ? 'I am your exclusive AI admissions assistant. I am happy to help you learn more about this century-old school in Wales.' : '我是您的专属智能咨询助理。很高兴能陪伴您了解这所位于威尔士的百年名校。'))}
            </p>

            {/* Pro Mode Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full mb-10">
              {activeCards.map((card, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setActiveMode(card.id)}
                  className={`${card.bg} rounded-2xl p-5 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-md border border-white/50 group text-left`}
                >
                  <div className="bg-white w-10 h-10 rounded-full flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    {card.icon}
                  </div>
                  <h3 className="text-[#141b38] font-bold text-base mb-1">{card.title}</h3>
                  <p className="text-slate-500 text-xs">{card.desc}</p>
                </button>
              ))}
            </div>

            {/* Quick Suggestions Pills (Small Tags) */}
            <div className="flex flex-wrap justify-center gap-3 w-full max-w-[800px]">
              {(customQuickPrompts || (language === 'en' 
                ? ['Where is the school located?', 'What is the application process for international students?', 'Do you offer scholarships?', 'What extracurricular activities are there?']
                : ['学校具体位置在哪？', '国际生申请流程是什么？', '有提供奖学金吗？', '课外活动有哪些？']
              )).map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickSend(q)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-sm hover:border-[#427759] hover:text-[#427759] transition-colors shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6 pb-32">
            {displayMessages.map((m) => {
              if (m.toolCard) {
                return (
                  <div key={m.id} className="flex justify-start mb-4">
                    <div className={`w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center mr-3 mt-1 flex-shrink-0 border border-slate-100 overflow-hidden ${isInternal ? 'text-[#141b38]' : ''}`}>
                      {isInternal ? <ShieldCheck className="w-5 h-5" /> : customLogo ? customLogo : <img src="/logo-img.png" alt="AI" className="w-[80%] h-[80%] object-contain" />}
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-2xl text-[15px] animate-fade-in-up w-full">
                      <h3 className="text-[#1e293b] leading-relaxed mb-5 font-medium">{m.toolCard.greeting}</h3>
                      <div className="flex flex-col gap-3">
                        {m.toolCard.prompts.map((p: string, i: number) => (
                          <button 
                            key={i}
                            onClick={() => handleQuickSend(p)}
                            className="text-left px-4 py-3 bg-[#f8fafc] hover:bg-[#eff6ff] rounded-xl text-[14px] text-[#3b82f6] transition-colors border border-blue-100 flex items-center"
                          >
                            <span className="mr-2 opacity-60 font-bold">#</span>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role !== 'user' && (
                    <div className={`w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center mr-3 mt-1 flex-shrink-0 border border-slate-100 overflow-hidden ${isInternal ? 'text-[#141b38]' : ''}`}>
                      {isInternal ? <ShieldCheck className="w-5 h-5" /> : customLogo ? customLogo : <img src="/logo-img.png" alt="AI" className="w-[80%] h-[80%] object-contain" />}
                    </div>
                  )}
                  
                  <div 
                    className={`px-5 py-3.5 max-w-[85%] md:max-w-[75%] rounded-2xl leading-relaxed text-[15px] ${
                      m.role === 'user' 
                        ? (isInternal ? 'bg-gradient-to-br from-[#141b38] to-slate-800 text-white rounded-br-sm shadow-md' : 'bg-gradient-to-br from-[#427759] to-[#2e5941] text-white rounded-br-sm shadow-md') 
                        : 'bg-white text-[#141b38] rounded-bl-sm shadow-sm border border-slate-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>

                  {m.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center ml-3 mt-1 flex-shrink-0">
                      <span className="text-xs font-medium text-slate-500">You</span>
                    </div>
                  )}
                </div>
              );
            })}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className={`w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center mr-3 mt-1 flex-shrink-0 border border-slate-100 overflow-hidden ${isInternal ? 'text-[#141b38]' : ''}`}>
                  {isInternal ? <ShieldCheck className="w-5 h-5" /> : customLogo ? customLogo : <img src="/logo-img.png" alt="AI" className="w-[80%] h-[80%] object-contain" />}
                </div>
                <div className="px-5 py-4 max-w-[75%] rounded-2xl bg-white text-[#141b38] rounded-bl-sm shadow-sm border border-slate-100 flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isInternal ? 'bg-[#141b38]' : 'bg-[#427759]'} animate-bounce`} style={{ animationDelay: '0ms' }} />
                  <div className={`w-2 h-2 rounded-full ${isInternal ? 'bg-[#141b38]' : 'bg-[#427759]'} animate-bounce`} style={{ animationDelay: '150ms' }} />
                  <div className={`w-2 h-2 rounded-full ${isInternal ? 'bg-[#141b38]' : 'bg-[#427759]'} animate-bounce`} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#f4f7fa] via-[#f4f7fa] to-transparent pt-12 pb-6 px-4 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto relative">
          
          {/* Active Mode Chip */}
          {activeModeData && (
             <div className="absolute -top-12 left-4 bg-white px-3 py-1.5 rounded-full text-[12px] text-[#427759] border border-slate-200 flex items-center gap-2 shadow-sm animate-fade-in-up">
                <span className="flex items-center gap-1.5 font-medium">
                  {activeModeData.icon} {activeModeData.title} 模式
                </span>
                <button type="button" onClick={() => setActiveMode(null)} className="opacity-50 hover:opacity-100 transition-opacity ml-1">
                  <X size={14} />
                </button>
             </div>
          )}

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (!localInput.trim()) return;
              sendMessage(localInput, undefined, undefined, undefined, { activeMode: activeMode || undefined });
              setLocalInput('');
            }}
            className={`relative bg-white rounded-full shadow-lg border border-slate-200 flex items-center p-1.5 focus-within:ring-2 transition-all ${
              isInternal 
                ? 'focus-within:ring-[#141b38]/20 focus-within:border-[#141b38]' 
                : 'focus-within:ring-[#427759]/20 focus-within:border-[#427759]'
            }`}
          >
            <input
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder={customPlaceholder || (isInternal ? "指派工作任务、查询客户信息..." : (language === 'en' ? "Ask about admissions, fees, or campus life..." : "询问招生政策、学费信息或校园环境..."))}
              className="flex-1 bg-transparent px-5 py-3 outline-none text-[#141b38] placeholder-slate-400 text-[15px]"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !localInput.trim()}
              className={`w-12 h-12 rounded-full text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-2 flex-shrink-0 ${
                isInternal ? 'bg-[#141b38] hover:bg-slate-800' : 'bg-[#6055f5] hover:bg-[#4d44c4]'
              }`}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </form>
          <div className="text-center mt-3">
            <span className="text-[11px] text-slate-400 font-medium">
              {customDisclaimer || "AI generated content may be inaccurate. Please consult the official Myddelton College staff for final verification."}
            </span>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .animate-fade-in-up {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.8s ease-out forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}} />
    </div>
  );
}
