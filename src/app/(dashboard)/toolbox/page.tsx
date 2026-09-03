'use client';
import { Wrench } from 'lucide-react';

export default function ToolboxIndexPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-10">
      <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
        <Wrench className="w-9 h-9 text-indigo-400" />
      </div>
      <h2 className="text-xl font-black text-gray-800 mb-2">Select a Tool to Begin</h2>
      <p className="text-sm text-gray-400 max-w-md">Toolbox is a visual testing workbench. After validating a tool's I/O here, AI Agents will invoke it using the same parameter protocol.</p>
    </div>
  );
}