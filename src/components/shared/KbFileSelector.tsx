'use client';
import React, { useState, useEffect } from 'react';
import { Search, FileText, X, Check, Loader2, Folder, ChevronRight, CornerUpLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface KbFile {
  id: string;
  title: string;
  type: string;
  fileType?: string;
  fileSize?: number;
}

interface KbFileSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedFiles: KbFile[]) => void;
  initialSelected?: KbFile[];
}

export function KbFileSelector({ isOpen, onClose, onConfirm, initialSelected = [] }: KbFileSelectorProps) {
  const { t, i18n } = useTranslation();
  
  // Quick translation helper fallback
  const isZh = i18n.language?.startsWith('zh');
  const str = {
    title: isZh ? '从知识库选择文件' : 'Select from Knowledge Base',
    searchPlaceholder: isZh ? '搜索知识库文件 (全局查找)...' : 'Search KB files (Global)...',
    selected: isZh ? '已选' : 'Selected',
    files: isZh ? '个文件' : 'files',
    loading: isZh ? '加载中...' : 'Loading...',
    noFiles: isZh ? '未找到相关文件' : 'No files found',
    cancel: isZh ? '取消' : 'Cancel',
    confirm: isZh ? '确认选择' : 'Confirm',
    root: isZh ? '根目录' : 'Root',
    back: isZh ? '返回上级' : 'Back'
  };

  const [items, setItems] = useState<KbFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KbFile[]>(initialSelected);

  // Hierarchy
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderHistory, setFolderHistory] = useState<{id: string, name: string}[]>([{id: 'root', name: str.root}]);

  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected, isOpen]);

  useEffect(() => {
    // When language changes, update root name in history
    setFolderHistory(prev => {
      const newHist = [...prev];
      if (newHist.length > 0 && newHist[0].id === 'root') {
        newHist[0].name = str.root;
      }
      return newHist;
    });
  }, [isZh]);

  useEffect(() => {
    if (isOpen) {
      if (search.trim()) {
        fetchSearch(search.trim());
      } else {
        fetchFolder(currentFolder);
      }
    }
  }, [isOpen, currentFolder, search]);

  const fetchFolder = async (folderId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/kb/knowledge?parentId=${folderId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setItems(data);
      }
    } catch (e) {
      console.error('Failed to fetch KB items', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSearch = async (query: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/kb/knowledge?allFiles=1');
      const data = await res.json();
      if (Array.isArray(data)) {
        setItems(data.filter((f: any) => f.title.toLowerCase().includes(query.toLowerCase())));
      }
    } catch (e) {
      console.error('Failed to search KB files', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (file: KbFile) => {
    if (file.type === 'FOLDER') {
      // Enter folder
      setCurrentFolder(file.id);
      setFolderHistory([...folderHistory, { id: file.id, name: file.title }]);
      setSearch(''); // Clear search when navigating FOLDER
      return;
    }

    // Select file
    if (selected.find(f => f.id === file.id)) {
      setSelected(selected.filter(f => f.id !== file.id));
    } else {
      setSelected([...selected, file]);
    }
  };

  const handleGoBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = folderHistory.slice(0, -1);
      setFolderHistory(newHistory);
      setCurrentFolder(newHistory[newHistory.length - 1].id);
    }
  };

  const handleCrumbClick = (index: number) => {
    if (index === folderHistory.length - 1) return;
    const newHistory = folderHistory.slice(0, index + 1);
    setFolderHistory(newHistory);
    setCurrentFolder(newHistory[index].id);
  };

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{str.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Selected Count */}
        <div className="p-4 border-b border-gray-50 flex items-center justify-between gap-4 bg-gray-50/30">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder={str.searchPlaceholder} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>
          <div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg whitespace-nowrap border border-indigo-100 shadow-sm">
            {str.selected} {selected.length} {str.files}
          </div>
        </div>

        {/* Breadcrumbs (only show if not searching) */}
        {!search && (
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-sm bg-white overflow-x-auto whitespace-nowrap">
            {folderHistory.length > 1 && (
              <button 
                onClick={handleGoBack}
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 mr-2 transition-colors font-medium"
              >
                <CornerUpLeft className="w-4 h-4" /> {str.back}
              </button>
            )}
            {folderHistory.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                <button 
                  onClick={() => handleCrumbClick(idx)}
                  className={`font-medium transition-colors ${idx === folderHistory.length - 1 ? 'text-gray-800 pointer-events-none' : 'text-gray-500 hover:text-indigo-600'}`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">{str.loading}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <FileText className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">{str.noFiles}</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {items.map((file) => {
                const isFolder = file.type === 'FOLDER';
                const isSelected = selected.some(f => f.id === file.id);
                
                return (
                  <div 
                    key={file.id} 
                    onClick={() => toggleSelect(file)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border group ${isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-transparent hover:bg-gray-50'}`}
                  >
                    {!isFolder ? (
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'border-2 border-gray-300 group-hover:border-indigo-300'}`}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    ) : (
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        {/* No checkbox for folder, just spacer */}
                      </div>
                    )}
                    
                    {isFolder ? (
                      <Folder className="w-5 h-5 flex-shrink-0 text-blue-400 fill-blue-50" />
                    ) : (
                      <FileText className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`} />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{file.title}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors">
            {str.cancel}
          </button>
          <button onClick={handleConfirm} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-600/20">
            {str.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
