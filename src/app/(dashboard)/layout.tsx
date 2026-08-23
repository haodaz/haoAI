'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthGuard';
import { canAccessTab } from '@/lib/roles';
import { useTranslation } from 'react-i18next';
import { Building2, Cpu, History, BookOpen, Settings, Users, Layout, Wrench, PenTool, MessageSquare, CheckCircle, ChevronDown, Menu, X, LogOut, UserCircle, Phone, AtSign, Camera, Save, PlusCircle, ClipboardList, Brain, ChevronRight } from 'lucide-react';
import { Modal } from 'antd';
import { WorkspaceProvider, useWorkspace } from '@/components/layout/WorkspaceContext';
import DocumentEditorView from '@/components/shared/DocumentEditorView';

const PROVIDER_COLORS: Record<string, string> = {
  DashScope: 'bg-blue-100 text-blue-600',
  Anthropic: 'bg-violet-100 text-violet-600',
  Google: 'bg-emerald-100 text-emerald-600',
};

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const activeTab = pathname.split('/')[1] || 'office'; // e.g. /office -> office
  const [kbExpanded, setKbExpanded] = useState(activeTab === 'AIkb');
  
  // Profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState({ displayName: '', phone: '', email: '', avatarUrl: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  
  // Model selector state
  const [currentModel, setCurrentModel] = useState<{id: string, name: string, provider: string} | null>(null);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, provider: string, hasKey: boolean}[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSwitching, setModelSwitching] = useState(false);

  useEffect(() => {
    fetch('/api/bristh/model')
      .then(r => r.json())
      .then(data => {
        setCurrentModel(data.current);
        setAvailableModels(data.available || []);
      }).catch(() => {});
  }, []);

  const switchModel = async (modelId: string) => {
    setModelSwitching(true);
    try {
      const res = await fetch('/api/bristh/model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentModel(data.model);
        setModelDropdownOpen(false);
      } else {
        alert(data.error || 'Failed to switch model');
      }
    } catch { alert('Network error'); }
    setModelSwitching(false);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Use the workspace context for the global Document Editor modal
  const { copilotView, setCopilotView } = useWorkspace();

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans relative overflow-hidden">
      {/* Aurora gradient blobs */}
      <div className="fixed top-[-10%] right-[10%] w-[500px] h-[500px] bg-gradient-to-br from-emerald-200/40 via-teal-200/30 to-transparent rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="fixed bottom-[-5%] left-[5%] w-[400px] h-[400px] bg-gradient-to-tr from-emerald-200/30 via-green-100/20 to-transparent rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="fixed top-[40%] left-[40%] w-[300px] h-[300px] bg-gradient-to-br from-teal-100/20 via-emerald-100/15 to-transparent rounded-full blur-[80px] pointer-events-none z-0" />

      {/* Mobile Header Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200/80 z-40 flex items-center px-4 shadow-sm">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 mr-3">
          {sidebarOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
        </button>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-[8px] font-black mr-2">BEP</div>
        <span className="text-xs font-bold text-gray-700">Bristh Auto Office</span>
        {currentModel && (
          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold ${PROVIDER_COLORS[currentModel.provider] || 'bg-gray-100 text-gray-500'}`}>
            {currentModel.name}
          </span>
        )}
      </div>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/30 z-30" onClick={() => setSidebarOpen(false)} />}
      
      {/* 左侧导航栏 */}
      <div className={`
        w-64 bg-white text-gray-700 flex flex-col border-r border-gray-200/80 z-30 shadow-sm
        fixed md:relative inset-y-0 left-0
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        pt-14 md:pt-0
      `}>
        <div className="p-5 pb-3 border-b border-gray-200/80 hidden md:block">
          <div className="flex items-center">
            <img src="/logo_transparent.png" alt="BEP Logo" className="h-10 w-auto object-contain" />
          </div>
        </div>

        <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          {/* New Task CTA Button */}
          {canAccessTab('new-task', user?.role || 'user') && (
            <Link
              href="/new-task"
              onClick={() => setSidebarOpen(false)}
              className={`w-full flex items-center justify-center px-4 py-3 rounded-xl transition-all duration-200 mb-3 ${
                activeTab === 'new-task'
                  ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30'
                  : 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.02] hover:bg-emerald-700'
              }`}
            >
              <PlusCircle className="w-[18px] h-[18px] mr-2" />
              <span className="text-[13px]">{t('bristh.nav.new_task', '发布新任务')}</span>
            </Link>
          )}

          {[
            { id: 'office', path: '/office', label: t('bristh.nav.office'), icon: Layout },
            { id: 'AImployee', path: '/AImployee', label: t('bristh.nav.employees'), icon: Users },
            { id: 'groupchat', path: '/groupchat', label: t('bristh.nav.group_chat', 'AI 群聊'), icon: MessageSquare },
            { id: 'history', path: '/history', label: t('bristh.nav.history'), icon: History },
            { id: 'kb', label: t('bristh.nav.kb'), icon: BookOpen, children: [
                { id: 'AIkb/business', path: '/AIkb/business', label: t('bristh.nav.kb_business', '业务知识'), icon: BookOpen },
                { id: 'AIkb/tasks', path: '/AIkb/tasks', label: t('bristh.nav.kb_tasks', '任务记忆'), icon: ClipboardList },
                { id: 'AIkb/memory', path: '/AIkb/memory', label: t('bristh.nav.kb_memory', 'AI 私人记忆'), icon: Brain },
            ] },
            { id: 'settings', path: '/AIsettings', label: t('bristh.nav.settings'), icon: Settings },
            { id: 'toolbox', path: '/toolbox', label: t('bristh.nav.toolbox'), icon: Wrench },
            { id: 'skills', path: '/skills', label: t('bristh.nav.skills'), icon: PenTool },
            { id: 'logic', path: '/logic', label: t('bristh.nav.logic'), icon: BookOpen },
            { id: 'users', path: '/users', label: t('bristh.nav.users'), icon: Users },
            { id: 'external_ai', path: '/chat/bep', label: 'BEP 对外 AI', icon: MessageSquare, target: '_blank' },
          ].filter(tab => canAccessTab(tab.id === 'AImployee' ? 'employees' : tab.id === 'groupchat' ? 'group_chat' : tab.id, user?.role || 'user')).map(tab => {
            if (tab.children) {
              return (
                <div key={tab.id} className="w-full mb-1">
                  <button
                    onClick={() => setKbExpanded(!kbExpanded)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm border border-emerald-100/80'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <div className="flex items-center">
                      <tab.icon className={`w-[18px] h-[18px] mr-3 ${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400'}`} />
                      <span className="text-[13px] font-semibold">{tab.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${kbExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {kbExpanded && (
                    <div className="mt-1 pl-4 space-y-1">
                      {tab.children.map(child => {
                        const isActive = pathname.startsWith(child.path);
                        return (
                          <Link
                            key={child.id}
                            href={child.path}
                            onClick={() => setSidebarOpen(false)}
                            className={`w-full flex items-center px-4 py-2 rounded-xl transition-all duration-200 ${
                              isActive
                                ? 'bg-emerald-50/60 text-emerald-600 font-bold'
                                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                          >
                            <child.icon className={`w-[14px] h-[14px] mr-3 ${isActive ? 'text-emerald-500' : 'text-gray-300'}`} />
                            <span className="text-xs font-semibold">{child.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={tab.id}
                href={tab.path}
                onClick={() => setSidebarOpen(false)}
                {...('target' in tab && tab.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={`w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 mb-1 ${
                  activeTab === tab.id 
                    ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm border border-emerald-100/80' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <tab.icon className={`w-[18px] h-[18px] mr-3 ${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-[13px] font-semibold">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200/80 space-y-2">
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-all text-left"
            >
              <div className="flex items-center min-w-0">
                <Cpu className="w-3.5 h-3.5 mr-2 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium leading-none">{t('bristh.model.current')}</p>
                  <p className="text-[11px] font-bold text-gray-700 truncate mt-0.5">{currentModel?.name || 'Loading...'}</p>
                </div>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ml-2 ${PROVIDER_COLORS[currentModel?.provider || ''] || 'bg-gray-100 text-gray-500'}`}>
                {currentModel?.provider || '...'}
              </span>
            </button>

            {/* Dropdown */}
            {modelDropdownOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">{t('bristh.model.switch')}</p>
                </div>
                <div className="p-1.5">
                  {availableModels.map(m => (
                    <button
                      key={m.id}
                      disabled={!m.hasKey || modelSwitching}
                      onClick={() => switchModel(m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left ${
                        currentModel?.id === m.id
                          ? 'bg-emerald-50 border border-emerald-100'
                          : m.hasKey
                            ? 'hover:bg-gray-50'
                            : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-bold ${currentModel?.id === m.id ? 'text-emerald-700' : 'text-gray-700'}`}>{m.name}</p>
                        <p className="text-[10px] text-gray-400">{m.provider}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!m.hasKey && <span className="text-[9px] text-red-400 font-medium">{t('bristh.model.noKey')}</span>}
                        {currentModel?.id === m.id && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Card */}
          <div className="flex items-center px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100 group">
            <button
              onClick={() => {
                fetch('/api/auth/profile').then(r => r.json()).then(d => {
                  if (d.user) setProfileData({
                    displayName: d.user.displayName || '',
                    phone: d.user.phone || '',
                    email: d.user.email || '',
                    avatarUrl: d.user.avatarUrl || '',
                  });
                });
                setShowProfile(true);
              }}
              className="flex items-center flex-1 min-w-0 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-[10px] font-bold text-white mr-2.5 shadow-md shadow-emerald-500/20 shrink-0 overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span>{(user?.displayName || user?.username || '?')[0].toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-700 truncate">{user?.displayName || user?.username || 'User'}</p>
                <p className="text-[10px] font-semibold text-gray-400">
                  {user?.role === 'admin' ? 'Admin' : 'User'}
                  <span className="ml-1.5 text-emerald-500">● Online</span>
                </p>
              </div>
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all ml-1 shrink-0"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Language Toggle */}
          <button
            onClick={() => { const next = i18n.language === 'zh' ? 'en' : 'zh'; i18n.changeLanguage(next); localStorage.setItem('bristh_lang', next); }}
            className="w-full flex items-center justify-center px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-all text-xs font-bold text-gray-500"
          >
            🌐 {t('bristh.lang.toggle')}
          </button>
        </div>
      </div>

      {/* Profile Modal */}
      <Modal
        open={showProfile}
        onCancel={() => setShowProfile(false)}
        footer={null}
        title={null}
        width={440}
        centered
        destroyOnClose
      >
        <div className="pt-2">
          <h3 className="text-lg font-black text-gray-900 mb-6">{t('bristh.profile.title')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('bristh.profile.displayName')}</label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={profileData.displayName}
                  onChange={e => setProfileData(p => ({ ...p, displayName: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                  placeholder="Your display name"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('bristh.profile.phone')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={e => setProfileData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                  placeholder="+86 ..."
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('bristh.profile.email')}</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={profileData.email}
                  onChange={e => setProfileData(p => ({ ...p, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('bristh.profile.avatar')}</label>
              <div className="relative">
                <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={profileData.avatarUrl}
                  onChange={e => setProfileData(p => ({ ...p, avatarUrl: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              setProfileSaving(true);
              try {
                const res = await fetch('/api/auth/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(profileData),
                });
                if (res.ok) {
                  setShowProfile(false);
                  window.location.reload(); // refresh to pick up new session
                }
              } finally {
                setProfileSaving(false);
              }
            }}
            disabled={profileSaving}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {profileSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-3">
            账号: <span className="font-bold text-gray-500">{user?.username}</span>
            <span className="mx-2">·</span>
            {t('bristh.profile.role')}: <span className="font-bold text-gray-500">{user?.role === 'admin' ? t('bristh.profile.admin') : t('bristh.profile.user')}</span>
          </p>
        </div>
      </Modal>

      {/* 右侧主视窗 */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden relative pt-14 md:pt-0 flex flex-col">
        {copilotView && (
          <DocumentEditorView taskId={copilotView.taskId} agent={copilotView.agent} onClose={() => setCopilotView(null)} />
        )}
        <div style={{ display: copilotView ? 'none' : 'contents' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <DashboardShell>
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
