# 📦 myAI_a2 → myAI 功能迁移导引

**目标：** 将 myAI_a2 的「文件上传解析」和「AI多角色编排」功能迁移到 myAI 项目。
**源项目：** `/Users/aisandbox/Documents/myAI_a2`
**目标项目：** `/Users/aisandbox/Documents/myAI`（另一侧 Copilot 负责执行）

---

## 一、架构总览

### 文件上传 → 解析 → AI处理 流程

```
用户拖入文件
    ↓
前端 FileUploadPanel 组件
    ↓ FormData (multipart)
POST /api/bristh/upload
    ↓ 调用
src/lib/file-parser.ts     → 解析 PDF/DOCX/XLSX/TXT 提取文本
src/lib/storage.ts         → 存储到 Supabase Storage 或 本地 public/uploads/
    ↓ 返回
AttachmentMeta[]（含 extractedText、summary、storagePath）
    ↓ 传给
POST /api/bristh/orchestrate/analyze → Chief AI 分析任务+分派子Agent
    ↓ 附件文本注入
各 Agent API (/api/bristh/agents/{name}/route.ts) 执行具体任务
```

### AI 多角色编排流程

```
用户输入任务文本 + 附件
    ↓
POST /api/bristh/orchestrate/analyze （Phase 1: 分析+任务拆解）
    ↓ Chief AI 调用大模型，产出 tasks[] JSON
前端展示任务分派方案，用户确认审批节点
    ↓
POST /api/bristh/orchestrate/confirm （Phase 2: 写入DB+启动执行）
    ↓ 按 phase 顺序执行
POST /api/bristh/agents/{alice|kelly|david|...}/ （各Agent独立执行）
    ↓ 产出物存入 DB，自动注入后续 phase 的上下文
最终汇总 → Grace 邮件分发
```

---

## 二、需要迁移的核心文件清单

### 🔴 必须迁移（7个核心文件）

| # | 文件路径 | 职责 | 行数 |
|---|---------|------|------|
| 1 | [file-parser.ts](file:///Users/aisandbox/Documents/myAI_a2/src/lib/file-parser.ts) | 文件解析引擎（PDF/DOCX/DOC/XLSX/TXT） | 250行 |
| 2 | [storage.ts](file:///Users/aisandbox/Documents/myAI_a2/src/lib/storage.ts) | 文件存储（Supabase Storage + 本地回退） | 143行 |
| 3 | [upload/route.ts](file:///Users/aisandbox/Documents/myAI_a2/src/app/api/bristh/upload/route.ts) | 文件上传API端点 | 214行 |
| 4 | [model-registry.ts](file:///Users/aisandbox/Documents/myAI_a2/src/lib/model-registry.ts) | 多模型注册表（DeepSeek/Gemini/GPT/Claude） | 192行 |
| 5 | [bristh-config.ts](file:///Users/aisandbox/Documents/myAI_a2/src/lib/bristh-config.ts) | Agent配置加载器 | 196行 |
| 6 | [analyze/route.ts](file:///Users/aisandbox/Documents/myAI_a2/src/app/api/bristh/orchestrate/analyze/route.ts) | Chief AI 任务分析+拆解 | 200行 |
| 7 | [orchestrate/route.ts](file:///Users/aisandbox/Documents/myAI_a2/src/app/api/bristh/orchestrate/route.ts) | 旧版一步式编排（可选） | 204行 |

### 🟡 Agent 执行层（按需迁移）

| # | 文件路径 | 职责 |
|---|---------|------|
| 8 | `src/app/api/bristh/agents/kelly/route.ts` | Kelly - 文档解析Agent |
| 9 | `src/app/api/bristh/agents/alice/route.ts` | Alice - 方案撰写Agent |
| 10 | `src/app/api/bristh/agents/david/route.ts` | David - 内控审计Agent |
| 11 | `src/app/api/bristh/agents/*/route.ts` | 其他Agent（按需） |

### 🔵 AI角色配置（静态文件目录）

| # | 路径 | 说明 |
|---|------|------|
| 12 | `public/characters/bristh_chief/` | Chief 调度器配置 (config.json + agent_capabilities.yaml) |
| 13 | `public/characters/bristh_alice/` | Alice 配置 (config.json + persona) |
| 14 | `public/characters/bristh_kelly/` | Kelly 配置 |
| 15 | `public/characters/bristh_*/` | 其他角色... |

---

## 三、各核心文件详解

### 1. `src/lib/file-parser.ts` — 文件解析引擎

**职责：** 接收 Buffer + MIME type，根据文件类型调用不同解析器，返回提取的文本。

**支持格式：**
- PDF → `pdf-parse` 库
- DOCX → `mammoth` 库
- DOC → `mammoth`（best effort）
- XLSX/XLS → `xlsx` 库（转 markdown 表格）
- TXT/MD/JSON/CSV/YAML → 直接 UTF-8 读取

**接口：**
```typescript
interface ParsedFile {
  extractedText: string;
  pageCount?: number;      // PDF 专有
  sheetNames?: string[];   // Excel 专有
}

function parseFileContent(buffer: Buffer, mimeType: string, fileName: string): Promise<ParsedFile>
```

**依赖：** `pdf-parse`, `mammoth`, `xlsx`

### 2. `src/lib/storage.ts` — 文件存储

**职责：** 将上传文件存入 Supabase Storage（云端）或 `public/uploads/`（本地回退）。

**关键函数：**
```typescript
function isCloudStorageEnabled(): boolean
function uploadToCloud(buffer, path, mime): Promise<string | null>
function getPublicUrl(path): string
```

**环境变量：** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
**Supabase Bucket 名：** `task-attachments`

### 3. `src/app/api/bristh/upload/route.ts` — 上传API

**路由：** `POST /api/bristh/upload`
**接收：** `multipart/form-data`，字段 `files`（File[]）+ 可选 `contextId`
**返回：** `{ success, contextId, storageMode, attachments: AttachmentMeta[] }`

**关键类型：**
```typescript
interface AttachmentMeta {
  id: string;                    // "att_timestamp_random"
  originalName: string;          // 原始文件名
  storagePath: string;           // 云URL或本地路径
  storageType: 'cloud' | 'local';
  mimeType: string;
  size: number;
  extractedText: string;         // ⬅️ 解析出的全文文本（核心！）
  summary: string;               // 前200字摘要
  pageCount?: number;
  sheetNames?: string[];
}
```

**限制：** 单文件≤20MB，最多10个文件

### 4. `src/lib/model-registry.ts` — 多模型注册表

**职责：** 管理多个大模型配置和切换。所有模型走 OpenAI 兼容 API。

**关键函数：**
```typescript
function getModelClient(): Promise<{ client: OpenAI, config: ModelConfig }>
function buildCompletionParams(config, messages, options): any  // 自动处理各模型差异
```

**已注册模型：** DeepSeek V3、Gemini 3.5/3.6 Flash、GPT-4o、Claude Sonnet 5

### 5. `src/lib/bristh-config.ts` — Agent配置加载

**职责：** 从 `public/characters/bristh_{agentId}/config.json` 读取 Agent 配置。

**config.json 结构：**
```json
{
  "id": "alice",
  "name": "Alice",
  "title": "方案架构师",
  "persona": "你是Alice，一位资深方案架构师...(完整system prompt)",
  "avatar": "/characters/bristh_alice/avatar.png",
  "color": "#6366f1",
  "skills_preview": ["方案撰写", "企划书", "分析报告"],
  "output_format": "markdown",
  "enabled": true
}
```

**关键：** `persona` 字段就是 Agent 的完整 system prompt，定义了 Agent 的人格和能力边界。

### 6. `orchestrate/analyze/route.ts` — Chief 任务分析

**核心逻辑：**
1. 创建 DRAFT TaskContext（存入 Prisma）
2. 将附件信息注入 Chief 的 system prompt
3. 加载 `agent_capabilities.yaml`（Agent 能力字典）
4. 调用大模型输出 JSON：`{ tasks: [{ agent, instruction, phase, complexity, reason }] }`
5. phase 编排规则：Phase 1（解析提取）→ Phase 2（撰写分析）→ Phase 3（Grace邮件）

---

## 四、npm 依赖

```bash
npm install pdf-parse mammoth xlsx openai @supabase/supabase-js
```

---

## 五、Prisma 模型

```prisma
model TaskContext {
  id             String   @id @default(cuid())
  source         String
  rawContent     String   @db.Text
  parsedData     String?  @db.Text
  attachments    String?  @db.Text
  approvalConfig String?  @db.Text
  modelUsed      String?
  userId         String?
  pipelineStatus String?  @default("ACTIVE")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  tasks          Task[]
}

model Task {
  id               String      @id @default(cuid())
  contextId        String
  context          TaskContext  @relation(fields: [contextId], references: [id])
  agent            String
  instruction      String      @db.Text
  status           String      @default("PENDING")
  result           String?     @db.Text
  requiresApproval Boolean     @default(false)
  attachmentIds    String?     @db.Text
  phase            Int         @default(1)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
}
```

---

## 六、环境变量

```env
DASHSCOPE_API_KEY=xxx          # DeepSeek V3
GEMINI_API_KEY=xxx             # Gemini
OPENAI_API_KEY=xxx             # GPT-4o
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
DATABASE_URL=xxx
```

---

## 七、AI角色配置目录

```
public/characters/
├── bristh_chief/
│   ├── config.json
│   ├── avatar.png
│   └── agent_capabilities.yaml  ← Agent能力字典（Chief分派任务用）
├── bristh_alice/
│   ├── config.json              ← persona字段 = 完整system prompt
│   ├── avatar.png
│   └── context/                 ← 可选：Agent专有知识文件
├── bristh_kelly/
│   ├── config.json
│   └── avatar.png
└── ...
```

---

## 八、前端调用示例

```typescript
// 1. 上传文件
const formData = new FormData();
files.forEach(f => formData.append('files', f));
const { attachments } = await fetch('/api/bristh/upload', {
  method: 'POST', body: formData
}).then(r => r.json());

// 2. 调用Chief分析
const { tasks, contextId } = await fetch('/api/bristh/orchestrate/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rawContent: userInput, attachments, locale: 'zh-CN' }),
}).then(r => r.json());

// 3. tasks 数组即为各Agent的任务分派方案
// [{ agent: "Kelly", instruction: "...", phase: 1 }, { agent: "Alice", ... phase: 2 }]
```

---

## 九、迁移步骤检查表

```
[ ] 1. npm install pdf-parse mammoth xlsx openai @supabase/supabase-js
[ ] 2. 复制 src/lib/file-parser.ts
[ ] 3. 复制 src/lib/storage.ts
[ ] 4. 复制 src/lib/model-registry.ts
[ ] 5. 复制 src/lib/bristh-config.ts
[ ] 6. 创建 src/app/api/bristh/upload/route.ts
[ ] 7. 创建 src/app/api/bristh/orchestrate/analyze/route.ts
[ ] 8. 更新 prisma/schema.prisma (TaskContext + Task)
[ ] 9. npx prisma db push
[ ] 10. 复制 public/characters/ 目录
[ ] 11. 配置 .env 环境变量
[ ] 12. 创建 Supabase bucket "task-attachments"
[ ] 13. 迁移 Agent routes (agents/alice, kelly, david 等)
[ ] 14. 前端集成上传+编排调用
[ ] 15. 端到端测试：上传PDF → 解析 → Chief分析 → Agent执行
```

> **给另一侧 Copilot：** 请先逐个读取上述源文件理解完整实现，再在 myAI 项目中创建对应文件。`file-parser.ts` 和 `storage.ts` 可原样复制，API 路由需根据 myAI 的路由结构适配路径。
