/**
 * Memory Engine — AI 记忆系统核心 (Database-backed)
 * 
 * 使用 Prisma 数据库存储，兼容 Vercel 只读文件系统。
 * 
 * Tables:
 *   AgentMemory  — 记忆条目（替代 JSONL）
 *   AgentSoul    — 灵魂文件（替代 soul.md）
 */

import prisma from '@/lib/prisma';

// ── Types ────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  ts: string;
  type: 'task_feedback' | 'lesson_learned' | 'user_preference' | 'task_summary' | 'copilot_feedback' | 'dreaming_insight';
  source: 'user' | 'self' | 'system' | 'dreaming';
  content: string;
  importance: number; // 0.0 - 1.0
  taskId?: string;
  archived?: boolean;
}

export interface TaskMemory {
  taskId: string;
  agentId: string;
  instruction: string;
  summary: string;
  createdAt: string;
}

// ── Write Operations ────────────────────────────────────────────────

/**
 * Write a single memory entry for an agent
 */
export async function writeMemory(agentId: string, entry: Omit<MemoryEntry, 'id' | 'ts'>): Promise<MemoryEntry> {
  const record = await prisma.agentMemory.create({
    data: {
      agentId: agentId.toLowerCase(),
      type: entry.type,
      source: entry.source,
      content: entry.content,
      importance: entry.importance,
      taskId: entry.taskId || null,
      archived: entry.archived || false,
    }
  });

  return {
    id: record.id,
    ts: record.createdAt.toISOString(),
    type: record.type as MemoryEntry['type'],
    source: record.source as MemoryEntry['source'],
    content: record.content,
    importance: record.importance,
    taskId: record.taskId || undefined,
    archived: record.archived,
  };
}

/**
 * Save a task memory summary (stored as a memory entry with type task_summary)
 */
export async function writeTaskMemory(agentId: string, memory: TaskMemory): Promise<void> {
  await prisma.agentMemory.create({
    data: {
      agentId: agentId.toLowerCase(),
      type: 'task_summary',
      source: 'self',
      content: `任务: ${memory.instruction.slice(0, 100)} → ${memory.summary}`,
      importance: 0.5,
      taskId: memory.taskId,
    }
  });
}

/**
 * Update the soul file (used by Dreaming Agent)
 */
export async function writeSoulFile(agentId: string, content: string): Promise<void> {
  await prisma.agentSoul.upsert({
    where: { agentId: agentId.toLowerCase() },
    update: { content },
    create: { agentId: agentId.toLowerCase(), content },
  });
}

// ── Read Operations ─────────────────────────────────────────────────

/**
 * Load agent's soul file
 */
export async function loadSoulFile(agentId: string): Promise<string> {
  try {
    const soul = await prisma.agentSoul.findUnique({
      where: { agentId: agentId.toLowerCase() }
    });
    return soul?.content || '';
  } catch {
    return '';
  }
}

/**
 * Load memory entries for a specific date
 */
export async function loadMemoriesByDate(agentId: string, date: string): Promise<MemoryEntry[]> {
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const records = await prisma.agentMemory.findMany({
    where: {
      agentId: agentId.toLowerCase(),
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { createdAt: 'asc' },
  });

  return records.map(r => ({
    id: r.id,
    ts: r.createdAt.toISOString(),
    type: r.type as MemoryEntry['type'],
    source: r.source as MemoryEntry['source'],
    content: r.content,
    importance: r.importance,
    taskId: r.taskId || undefined,
    archived: r.archived,
  }));
}

/**
 * Load recent memories, sorted by importance (highest first)
 */
export async function loadAgentMemories(agentId: string, limit: number = 20): Promise<MemoryEntry[]> {
  const records = await prisma.agentMemory.findMany({
    where: {
      agentId: agentId.toLowerCase(),
      archived: false,
    },
    orderBy: { importance: 'desc' },
    take: limit,
  });

  return records.map(r => ({
    id: r.id,
    ts: r.createdAt.toISOString(),
    type: r.type as MemoryEntry['type'],
    source: r.source as MemoryEntry['source'],
    content: r.content,
    importance: r.importance,
    taskId: r.taskId || undefined,
    archived: r.archived,
  }));
}

/**
 * Load task summaries written by writeTaskMemory, newest first
 */
export async function loadTaskMemories(agentId: string, limit: number = 50): Promise<MemoryEntry[]> {
  const records = await prisma.agentMemory.findMany({
    where: { agentId: agentId.toLowerCase(), type: 'task_summary', archived: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return records.map(r => ({
    id: r.id,
    ts: r.createdAt.toISOString(),
    type: r.type as MemoryEntry['type'],
    source: r.source as MemoryEntry['source'],
    content: r.content,
    importance: r.importance,
    taskId: r.taskId || undefined,
    archived: r.archived,
  }));
}

/**
 * List all agents that have memory entries or soul files
 */
export async function listAgentsWithMemory(): Promise<string[]> {
  const [memoryAgents, soulAgents] = await Promise.all([
    prisma.agentMemory.findMany({
      select: { agentId: true },
      distinct: ['agentId'],
    }),
    prisma.agentSoul.findMany({
      select: { agentId: true },
    }),
  ]);

  const all = new Set([
    ...memoryAgents.map(a => a.agentId),
    ...soulAgents.map(a => a.agentId),
  ]);
  return [...all];
}

/**
 * Get memory stats for an agent (for KB UI display)
 */
export async function getAgentMemoryStats(agentId: string): Promise<{
  hasSoul: boolean;
  todayCount: number;
  totalCount: number;
  lastMemoryDate: string | null;
}> {
  const aid = agentId.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [soul, todayCount, totalCount, lastMemory] = await Promise.all([
    prisma.agentSoul.findUnique({ where: { agentId: aid } }),
    prisma.agentMemory.count({ where: { agentId: aid, createdAt: { gte: today } } }),
    prisma.agentMemory.count({ where: { agentId: aid } }),
    prisma.agentMemory.findFirst({ where: { agentId: aid }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    hasSoul: !!soul?.content,
    todayCount,
    totalCount,
    lastMemoryDate: lastMemory?.createdAt.toISOString().split('T')[0] || null,
  };
}

/**
 * Delete a specific memory entry by ID
 */
export async function deleteMemory(agentId: string, memoryId: string): Promise<boolean> {
  try {
    await prisma.agentMemory.delete({ where: { id: memoryId } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Purge expired memories based on importance-driven retention policy:
 * - High importance (>0.7): permanent
 * - Medium importance (0.4-0.7): 30 days
 * - Low importance (<0.4): 7 days
 */
export async function purgeExpiredMemories(agentId: string): Promise<number> {
  const aid = agentId.toLowerCase();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Delete archived
  const archived = await prisma.agentMemory.deleteMany({
    where: { agentId: aid, archived: true }
  });

  // Delete low importance older than 7 days
  const low = await prisma.agentMemory.deleteMany({
    where: {
      agentId: aid,
      importance: { lt: 0.4 },
      createdAt: { lt: sevenDaysAgo },
    }
  });

  // Delete medium importance older than 30 days
  const med = await prisma.agentMemory.deleteMany({
    where: {
      agentId: aid,
      importance: { gte: 0.4, lte: 0.7 },
      createdAt: { lt: thirtyDaysAgo },
    }
  });

  return archived.count + low.count + med.count;
}
