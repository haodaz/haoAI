'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface WorkspaceContextProps {
  pendingPptData: { slides: any[]; fileUrl: string; topic: string } | null;
  setPendingPptData: (data: { slides: any[]; fileUrl: string; topic: string } | null) => void;
  copilotView: { taskId: string; agent: string } | null;
  setCopilotView: (data: { taskId: string; agent: string } | null) => void;
  pendingDispatchTask: { input: string; inputMode: string; contextId?: string; tasks?: any[]; attachments?: any[] } | null;
  setPendingDispatchTask: (data: { input: string; inputMode: string; contextId?: string; tasks?: any[]; attachments?: any[] } | null) => void;
  pendingNewTaskInput: string | null;
  setPendingNewTaskInput: (data: string | null) => void;
  pendingAgentTask: { agentId: string; context: string } | null;
  setPendingAgentTask: (data: { agentId: string; context: string } | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextProps>({
  pendingPptData: null,
  setPendingPptData: () => {},
  copilotView: null,
  setCopilotView: () => {},
  pendingDispatchTask: null,
  setPendingDispatchTask: () => {},
  pendingNewTaskInput: null,
  setPendingNewTaskInput: () => {},
  pendingAgentTask: null,
  setPendingAgentTask: () => {},
});

export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [pendingPptData, setPendingPptData] = useState<{ slides: any[]; fileUrl: string; topic: string } | null>(null);
  const [copilotView, setCopilotView] = useState<{ taskId: string; agent: string } | null>(null);
  const [pendingDispatchTask, setPendingDispatchTask] = useState<{ input: string; inputMode: string; contextId?: string; tasks?: any[]; attachments?: any[] } | null>(null);
  const [pendingNewTaskInput, setPendingNewTaskInput] = useState<string | null>(null);
  const [pendingAgentTask, setPendingAgentTask] = useState<{ agentId: string; context: string } | null>(null);

  return (
    <WorkspaceContext.Provider value={{ pendingPptData, setPendingPptData, copilotView, setCopilotView, pendingDispatchTask, setPendingDispatchTask, pendingNewTaskInput, setPendingNewTaskInput, pendingAgentTask, setPendingAgentTask }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
