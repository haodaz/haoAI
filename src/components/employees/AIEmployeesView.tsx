'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Sparkles } from 'lucide-react';
import AgentChat from './AgentChat';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '@/components/layout/WorkspaceContext';

interface AgentConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  avatar: string;
  realistic_avatar?: string;
  color: string;
  skills_preview: string[];
  role: string;
  enabled: boolean;
  greeting?: string;
  quick_prompts?: string[];
}

const COLOR_MAP: Record<string, { bg: string; border: string; tag: string; gradient: string; shadow: string }> = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200', tag: 'bg-blue-100 text-blue-700',       gradient: 'from-blue-500 to-blue-600',    shadow: 'shadow-blue-500/20' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', tag: 'bg-emerald-100 text-emerald-700', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/20' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200', tag: 'bg-purple-100 text-purple-700',   gradient: 'from-purple-500 to-purple-600', shadow: 'shadow-purple-500/20' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200', tag: 'bg-red-100 text-red-700',         gradient: 'from-red-500 to-red-600',      shadow: 'shadow-red-500/20' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200', tag: 'bg-amber-100 text-amber-700',     gradient: 'from-amber-500 to-amber-600',  shadow: 'shadow-amber-500/20' },
  cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200', tag: 'bg-cyan-100 text-cyan-700',       gradient: 'from-cyan-500 to-cyan-600',    shadow: 'shadow-cyan-500/20' },
  pink:    { bg: 'bg-pink-50',    border: 'border-pink-200', tag: 'bg-pink-100 text-pink-700',       gradient: 'from-pink-500 to-pink-600',    shadow: 'shadow-pink-500/20' },
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200', tag: 'bg-indigo-100 text-indigo-700',   gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/20' },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-200', tag: 'bg-teal-100 text-teal-700',       gradient: 'from-teal-500 to-teal-600',    shadow: 'shadow-teal-500/20' },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-200', tag: 'bg-rose-100 text-rose-700',       gradient: 'from-rose-500 to-rose-600',    shadow: 'shadow-rose-500/20' },
};

export default function AIEmployeesView() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');
  const { pendingAgentTask } = useWorkspace();

  useEffect(() => {
    fetch('/api/bristh/agents/config')
      .then(r => r.json())
      .then((data: AgentConfig[]) => {
        const HIDDEN_AGENTS = ['atlas', 'jarvis', 'nexus', 'nova'];
        const filtered = data.filter(a => a.role !== 'orchestrator' && a.enabled && !HIDDEN_AGENTS.includes(a.id?.toLowerCase()));
        setAgents(filtered);
        setLoading(false);
        // Auto-open agent chat if coming from group chat with pending task
        if (pendingAgentTask) {
          const target = filtered.find(a => a.id === pendingAgentTask.agentId);
          if (target) setSelectedAgent(target);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  // If an agent is selected, show chat
  if (selectedAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentChat agent={selectedAgent} onBack={() => setSelectedAgent(null)} />
      </div>
    );
  }

  // Roster grid
  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight">{isEn ? 'AI Employees' : 'AI 员工'}</h1>
            <p className="text-xs text-gray-400 font-medium">{isEn ? 'Select an AI employee to start chatting' : '选择一位 AI 员工开始对话'}</p>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-fit mx-auto pb-8">
            {agents.map(agent => {
              const colors = COLOR_MAP[agent.color] || COLOR_MAP.blue;
              return (
                <div
                  key={agent.id}
                  className="w-[350px] flex flex-col group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-gray-200 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                  onClick={() => setSelectedAgent(agent)}
                >
                  {/* Large Image Header */}
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100 shrink-0">
                    <img
                      src={agent.realistic_avatar || agent.avatar}
                      alt={agent.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-white/90 backdrop-blur rounded-full shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-gray-700">{isEn ? 'Online' : '在线'}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex-1 flex flex-col">
                    {/* Name & Title */}
                    <h3 className="text-lg font-black text-gray-900 mb-1">{agent.name}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{agent.title}</p>

                    {/* Description */}
                    <p className="text-[13px] text-gray-500 leading-relaxed line-clamp-2 mb-4">{isEn ? ((agent as any).description_en || agent.description) : agent.description}</p>

                    {/* Skills tags (mt-auto pushes it to bottom) */}
                    <div className="flex flex-wrap gap-1.5 mb-5 mt-auto">
                      {(isEn ? ((agent as any).skills_preview_en || agent.skills_preview) : agent.skills_preview).map((skill: string) => (
                        <span key={skill} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-100">
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* CTA Button */}
                    <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isEn ? 'Start Chat' : '开始对话'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
