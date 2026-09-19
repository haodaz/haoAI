
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Tooltip, Spin } from 'antd';
import { marked } from 'marked';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ThinkBlock, ToolCallsBlock, renderPreviewStandalone, COLOR_BORDER_MAP } from '@/components/shared/UIBlocks';
import { Building2, Cpu, Activity, History, BookOpen, Settings, Send, CheckCircle2, ChevronRight, ChevronLeft, Users, Layout, Plus, FileText, Calendar, Presentation, AlertTriangle, Scale, Mail, StopCircle, Edit, Edit3, Link2, UploadCloud, Terminal, Info, Download, MessageSquare, Wrench, PenTool, CheckCircle, XCircle, Hourglass, ChevronDown, ChevronUp, Database, Menu, X, Copy, RefreshCw, GitMerge, LogOut, UserCircle, Phone, AtSign, Camera, Save, ArrowLeft, ArrowRight, SaveAll, Loader2 } from 'lucide-react';

export default function SkillsView() {
  const { t } = useTranslation();
  const [selectedSkill, setSelectedSkill] = useState<number | null>(null);
  const skillDetails = [
    { icon: '🎓', title: '留学咨询标准流', desc: '串联 Alice(方案) → Edda(宣讲PPT) → Grace(发送邮件)', pipeline: ['Alice – 方案架构', 'Edda – PPT制作', 'Grace – 邮件分发'] },
    { icon: '🏢', title: '企业内控流', desc: '串联 David(审查) → Fiona(通报Memo)', pipeline: ['David – 内控审查', 'Fiona – 通报宣发'] },
  ];
  if (selectedSkill !== null) {
    const s = skillDetails[selectedSkill];
    return (
      <div className="w-full h-full bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <button onClick={() => setSelectedSkill(null)} className="flex items-center text-sm text-gray-500 hover:text-gray-800 font-medium">
            <ChevronLeft className="w-4 h-4 mr-1" /> {t('bristh.skills.backToList')}
          </button>
        </div>
        <div className="flex-1 p-5 md:p-10 overflow-y-auto">
          <div className="text-4xl mb-3">{s.icon}</div>
          <h2 className="text-xl font-black text-gray-900 mb-2">{s.title}</h2>
          <p className="text-gray-500 mb-6">{s.desc}</p>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('bristh.skills.pipeline')}</h3>
          <div className="space-y-2">
            {s.pipeline.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600">{i+1}</div>
                <span className="text-sm font-medium text-gray-700">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full h-full bg-white p-4 md:p-10 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-purple-50 rounded-full flex items-center justify-center mb-6">
        <PenTool className="w-10 h-10 text-purple-600" />
      </div>
      <h2 className="text-2xl font-black text-gray-900 mb-2">{t('bristh.skills.title')}</h2>
      <p className="text-gray-500 max-w-md mb-8">{t('bristh.skills.desc')}</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full text-left">
        <div className="border border-gray-200 p-5 rounded-xl hover:border-purple-500 transition-colors cursor-pointer" onClick={() => setSelectedSkill(0)}>
           <h3 className="font-bold text-gray-800 mb-1">🎓 留学咨询标准流</h3>
           <p className="text-xs text-gray-500">串联 Alice(方案) → Edda(宣讲PPT) → Grace(发送邮件)</p>
        </div>
        <div className="border border-gray-200 p-5 rounded-xl hover:border-purple-500 transition-colors cursor-pointer" onClick={() => setSelectedSkill(1)}>
           <h3 className="font-bold text-gray-800 mb-1">🏢 企业内控流</h3>
           <p className="text-xs text-gray-500">串联 David(审查) → Fiona(通报Memo)</p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Others...
// ==========================================