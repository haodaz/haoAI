'use client';
import React, { useState, useEffect } from 'react';
import { Search, FileText, X, Check, Loader2 } from 'lucide-react';

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
  const [files, setFiles] = useState<KbFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KbFile[]>(initialSelected);

  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected, isOpen]);

  useEffect(() => {
    if (isOpen && files.length === 0) {
      fetchFiles();
    }
  }, [isOpen]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/kb/knowledge?allFiles=1');
      const data = await res.json();
      if (Array.isArray(data)) {
        setFiles(data);
      }
    } catch (e) {
      console.error('Failed to fetch KB files', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (file: KbFile) => {
    if (selected.find(f => f.id === file.id)) {
      setSelected(selected.filter(f => f.id !== file.id));
    } else {
      setSelected([...selected, file]);
    }
  };

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  const filteredFiles = files.filter(f => f.title.toLowerCase().includes(search.toLowerCase()));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">从知识库选择文件</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Selected Count */}
        <div className="p-4 border-b border-gray-50 flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="搜索知识库文件..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="text-xs font-medium text-gray-500 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg whitespace-nowrap">
            已选 {selected.length} 个文件
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">加载中...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <FileText className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">未找到相关文件</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredFiles.map((file) => {
                const isSelected = selected.some(f => f.id === file.id);
                return (
                  <div 
                    key={file.id} 
                    onClick={() => toggleSelect(file)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'border-indigo-500 bg-indigo-50/50' : 'border-transparent hover:bg-gray-50'}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'border-2 border-gray-300'}`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                    <FileText className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`} />
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
            取消
          </button>
          <button onClick={handleConfirm} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-600/20">
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}
