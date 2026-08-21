const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'src/app/(dashboard)/layout.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// Update imports
content = content.replace(
  "import { Building2, Cpu, History, BookOpen, Settings, Users, Layout, Wrench, PenTool, MessageSquare, CheckCircle, ChevronDown, Menu, X, LogOut, UserCircle, Phone, AtSign, Camera, Save, PlusCircle } from 'lucide-react';",
  "import { Building2, Cpu, History, BookOpen, Settings, Users, Layout, Wrench, PenTool, MessageSquare, CheckCircle, ChevronDown, Menu, X, LogOut, UserCircle, Phone, AtSign, Camera, Save, PlusCircle, ClipboardList, Brain, ChevronRight } from 'lucide-react';"
);

// Add state for kbExpanded
content = content.replace(
  "const activeTab = pathname.split('/')[1] || 'office'; // e.g. /office -> office",
  "const activeTab = pathname.split('/')[1] || 'office'; // e.g. /office -> office\n  const [kbExpanded, setKbExpanded] = useState(activeTab === 'AIkb');"
);

// Replace nav array mapping
const oldNavStart = "          {[\n            { id: 'office', path: '/office', label: t('bristh.nav.office'), icon: Layout },";
const oldNavEnd = "          ))}";

const navReplacement = `          {[
            { id: 'office', path: '/office', label: t('bristh.nav.office'), icon: Layout },
            { id: 'AImployee', path: '/AImployee', label: t('bristh.nav.employees'), icon: Users },
            { id: 'groupchat', path: '/groupchat', label: t('bristh.nav.group_chat', 'AI 群聊'), icon: MessageSquare },
            { id: 'history', path: '/history', label: t('bristh.nav.history'), icon: History },
            { id: 'kb', label: t('bristh.nav.kb'), icon: BookOpen, children: [
                { id: 'AIkb/business', path: '/AIkb/business', label: '业务知识', icon: BookOpen },
                { id: 'AIkb/tasks', path: '/AIkb/tasks', label: '任务记忆', icon: ClipboardList },
                { id: 'AIkb/memory', path: '/AIkb/memory', label: 'AI 私人记忆', icon: Brain },
            ] },
            { id: 'settings', path: '/AIsettings', label: t('bristh.nav.settings'), icon: Settings },
            { id: 'toolbox', path: '/toolbox', label: t('bristh.nav.toolbox'), icon: Wrench },
            { id: 'skills', path: '/skills', label: t('bristh.nav.skills'), icon: PenTool },
            { id: 'logic', path: '/logic', label: t('bristh.nav.logic'), icon: BookOpen },
            { id: 'users', path: '/users', label: t('bristh.nav.users'), icon: Users },
          ].filter(tab => canAccessTab(tab.id === 'AImployee' ? 'employees' : tab.id === 'groupchat' ? 'group_chat' : tab.id, user?.role || 'user')).map(tab => {
            if (tab.children) {
              return (
                <div key={tab.id} className="w-full mb-1">
                  <button
                    onClick={() => setKbExpanded(!kbExpanded)}
                    className={\`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 \${
                      activeTab === tab.id
                        ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm border border-emerald-100/80'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }\`}
                  >
                    <div className="flex items-center">
                      <tab.icon className={\`w-[18px] h-[18px] mr-3 \${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400'}\`} />
                      <span className="text-[13px] font-semibold">{tab.label}</span>
                    </div>
                    <ChevronDown className={\`w-4 h-4 transition-transform \${kbExpanded ? 'rotate-180' : ''}\`} />
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
                            className={\`w-full flex items-center px-4 py-2 rounded-xl transition-all duration-200 \${
                              isActive
                                ? 'bg-emerald-50/60 text-emerald-600 font-bold'
                                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                            }\`}
                          >
                            <child.icon className={\`w-[14px] h-[14px] mr-3 \${isActive ? 'text-emerald-500' : 'text-gray-300'}\`} />
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
                className={\`w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 mb-1 \${
                  activeTab === tab.id 
                    ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm border border-emerald-100/80' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }\`}
              >
                <tab.icon className={\`w-[18px] h-[18px] mr-3 \${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400'}\`} />
                <span className="text-[13px] font-semibold">{tab.label}</span>
              </Link>
            );
          })}`;

const startIndex = content.indexOf(oldNavStart);
const oldNavMiddle = "          ].filter(tab => canAccessTab(tab.id === 'AImployee' ? 'employees' : tab.id === 'groupchat' ? 'group_chat' : tab.id, user?.role || 'user')).map(tab => (";
const middleIndex = content.indexOf(oldNavMiddle, startIndex);
const endIndex = content.indexOf(oldNavEnd, middleIndex) + oldNavEnd.length;

if (startIndex !== -1 && endIndex !== -1) {
    content = content.slice(0, startIndex) + navReplacement + content.slice(endIndex);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log("Successfully updated layout.tsx");
} else {
    console.error("Failed to find replacement indices");
}
