'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ProChatArea from '@/components/chat/ProChatArea';
import { Building2, Search, LineChart, ShieldCheck } from 'lucide-react';

const getCards = (lang: string) => [
  { 
    id: 'partnership',
    title: lang === 'en' ? 'Why Choose BEP?' : '核心优势', 
    desc: lang === 'en' ? 'Redefining international admissions' : '重新定义国际招生，降本增效', 
    icon: <Building2 className="w-5 h-5 text-emerald-500" />, 
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    greeting: lang === 'en' 
      ? 'Hello! Outsourcing your international admissions office to us can save you money and increase efficiency. How can I help you today?'
      : '您好！将国际招生办外包给我们，不仅能帮学校降本增效，还能重新定义国际招生体验。我可以为您解答任何关于 BEP 核心优势的问题。',
    prompts: lang === 'en' 
      ? ['How are you different from traditional agencies or BBSN?', 'Can outsourcing to you really save/make us money?', 'How do you ensure students are a true fit for our school?']
      : ['你们和传统的留学中介、或者 BBSN 平台有什么根本区别？', '把国际招生办外包给你们，真能帮学校省钱/赚钱吗？', "你们怎么保证招来的学生不仅仅是'能入学'，而且真正适合我们学校？"]
  },
  { 
    id: 'painpoints',
    title: lang === 'en' ? 'What We Do' : '服务涵盖', 
    desc: lang === 'en' ? 'Full management from channels to families' : '从渠道拓展到家庭沟通的全托管', 
    icon: <ShieldCheck className="w-5 h-5 text-teal-500" />, 
    bg: 'bg-teal-50 hover:bg-teal-100',
    greeting: lang === 'en'
      ? 'We offer full management services from channel expansion to direct family communication. What would you like to know?'
      : '我们提供从渠道拓展到家庭沟通的全托管服务。作为您的海外招生办公室，我们包揽了哪些工作？',
    prompts: lang === 'en'
      ? ['What daily admissions tasks does BEP actually handle?', 'How do you help us manage our existing overseas agency network?', 'What follow-up work do you handle after an offer is made?']
      : ['BEP 具体包揽了哪些日常招生工作？', '你们如何帮我们管理现有的海外中介网络？', '在拿到 Offer 之后，你们还会负责哪些跟进工作？']
  },
  { 
    id: 'services',
    title: lang === 'en' ? 'Models & Pricing' : '合作与收费', 
    desc: lang === 'en' ? 'Fixed retainer or pure performance' : '固定月费与纯绩效提成模式', 
    icon: <LineChart className="w-5 h-5 text-green-500" />, 
    bg: 'bg-green-50 hover:bg-green-100',
    greeting: lang === 'en'
      ? 'We offer a Fixed Retainer model and a pure Performance Commission model. I can explain the pricing and structure in detail.'
      : '我们提供“固定月费”与“纯绩效提成”两种合作模式。我可以为您详细讲解我们的收费标准及运作方式。',
    prompts: lang === 'en'
      ? ['What are your fees? What partnership models are available?', 'How does your Performance Model (15% commission) work?', 'Who pays the commission to the sub-agencies?']
      : ['你们的收费标准是怎样的？有哪几种合作模式？', '如果我们不想出固定的月费，你们的‘绩效模式 (15% 提成)’是怎么运作的？', '和你们合作后，支付给底层中介的佣金是由谁来付？']
  },
  { 
    id: 'knowledge',
    title: lang === 'en' ? 'Addressing Concerns' : '打消顾虑', 
    desc: lang === 'en' ? 'Regarding data, control & agencies' : '关于数据、控制权与现有中介', 
    icon: <Search className="w-5 h-5 text-cyan-500" />, 
    bg: 'bg-cyan-50 hover:bg-cyan-100',
    greeting: lang === 'en'
      ? 'I understand you may have concerns about data ownership, control, or your existing agencies. Ask me anything to clear your doubts.'
      : '我理解您在合作前可能对控制权、数据归属或现有中介关系有顾虑。您可以随时向我提问，我会为您打消这些疑虑。',
    prompts: lang === 'en'
      ? ['Do we need to abandon our existing agencies?', 'Will outsourcing mean losing control over final offers?', 'Who owns the data if we terminate the partnership?', 'How do you ensure you prioritize promoting our school?']
      : ['如果和你们合作，我们需要放弃或切断自己现有的优质中介吗？', '把招生外包出去，学校会不会失去对最终录取和发 Offer 的控制权？', '如果以后我们终止了合作，学校的生源管道和家庭数据归谁？', '如果不用签排他协议，你们怎么保证优先推销我们学校？']
  },
];

export default function BEPChatPage() {
  const [language, setLanguage] = useState<'zh' | 'en'>('en');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const storedLang = localStorage.getItem('bep_chat_language');
    if (storedLang === 'zh' || storedLang === 'en') {
      setLanguage(storedLang);
    }
  }, []);

  const handleSelectLang = (lang: 'zh' | 'en') => {
    setLanguage(lang);
    localStorage.setItem('bep_chat_language', lang);
  };

  if (!isMounted) return null; // Avoid hydration mismatch

  const componentKey = `chat-ext-bep-${language}`;
  const cards = getCards(language);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc]">
      {/* BEP Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-6 md:px-12 lg:px-24 py-4 flex items-center justify-between shadow-md relative z-10">
        <div className="flex items-center space-x-6">
          <Link href="/office" className="flex items-center text-white/90 hover:text-white transition-colors cursor-pointer group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium text-sm">{language === 'en' ? 'Back to Office' : '返回 Office'}</span>
          </Link>

          <div className="flex items-center space-x-3 border-l border-white/20 pl-6">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-inner">
              <span className="text-emerald-700 font-black text-xl">BEP</span>
            </div>
            <span className="font-bold text-xl tracking-wide text-white drop-shadow-md">
              {language === 'en' ? 'UK Boarding Schools Overseas Admissions' : '英国寄宿学校海外招生办'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-black/10 p-1 rounded-lg">
          <button
            onClick={() => handleSelectLang('en')}
            className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${language === 'en' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
          >
            En
          </button>
          <button
            onClick={() => handleSelectLang('zh')}
            className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${language === 'zh' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
          >
            中
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-hidden relative">
        <ProChatArea 
          key={componentKey} 
          api={`/api/chat/bep?lang=${language}`} 
          language={language} 
          customTitle={language === 'en' ? "Welcome to BEP Digital Assistant" : "欢迎来到 BEP 智能助手"}
          customSubtitle={language === 'en' ? "Your outsourced admissions office for UK boarding schools." : "您好！我是 BEP 的数字代表。BEP 作为英国寄宿学校的海外招生办公室，致力于帮学校统管国际招生流程。"}
          customCards={cards}
          customLogo={<div className="w-full h-full bg-emerald-600 rounded-lg flex items-center justify-center text-white font-black text-xl">BEP</div>}
          customDisclaimer={language === 'en' ? "AI generated content. Please verify with our official consultants." : "AI 生成内容仅供参考，具体合作细节请与我们的业务团队确认。"}
          customQuickPrompts={language === 'en' ? ["How are you fundamentally different from traditional agencies?", "Will we lose control over final admissions?", "How does the Performance Model (15% commission) work?", "Who owns the data if we terminate the partnership?"] : ["你们和传统的留学中介有什么根本区别？", "学校会失去对最终录取和发 Offer 的控制权吗？", "‘绩效模式 (15% 提成)’是怎么运作的？", "如果终止合作，生源管道和数据归谁？"]}
          customPlaceholder={language === 'en' ? "Ask about admissions, fees, or type: 'How can I get more suitable international students for my school?'" : "请输入您关心的招生政策、费用细节，或直接询问：'如何让我的学校获得更多合适的国际生源？'"}
        />
      </main>
    </div>
  );
}
