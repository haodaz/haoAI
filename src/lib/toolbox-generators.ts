/**
 * toolbox-generators.ts
 * Server-side generation functions used by both:
 * 1. /api/toolbox/* SSE routes (for direct user access + Copilot)
 * 2. Agent routes (Alice, Eric) — await full result, bring content back to pipeline
 */

import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

// ─── Proposal ────────────────────────────────────────────────────────────────

const COMMERCIAL_MODELS: Record<string, string> = {
  'Fixed Retainer': `The Fixed Retainer model is best suited to a school with strong existing demand, clear market appeal, and an ambition to expand into new territories.
- BEP acts as an extension of the school's international recruitment team.
- No operational fee or enrolment-based charge.
- Fixed monthly fee of £4,800 plus VAT.
- Offers optimum flexibility across BEP's agency partner network.`,
  'Performance Partnership': `The Performance Partnership offers the school a no-upfront-cost model, with payment linked to successful enrolments.
- BEP carries the initial cost and commercial risk of developing new markets.
- BEP receives a 15% operational service fee for each year of a student's enrolment.
- Agent commission remains separate and is collected by BEP on behalf of the agent.`,
  'Hybrid (混合模式)': `A Hybrid Model combines a lower fixed monthly retainer with a reduced performance-based consultation fee.
- Reduces upfront risk while ensuring BEP remains incentivized for success.
- Specific financial terms to be negotiated based on market targets and volume expectations.`
};

export interface ProposalParams {
  targetSchool: string;
  schoolProfile?: string;
  businessModel?: string;
  focusAreas?: string[];
  additionalNotes?: string;
  kbFileIds?: string[];
  background?: string; // Kelly-parsed context from agent
}

export interface ProposalResult {
  content: string;
  assetId: string;
  title: string;
}

/**
 * Generate a full Proposal and save to GeneratedAsset.
 * onProgress: called after each block with a status string (for the rolling ticker).
 */
export async function generateProposal(
  params: ProposalParams,
  onProgress?: (msg: string) => void
): Promise<ProposalResult> {
  const { targetSchool, schoolProfile, businessModel = 'Fixed Retainer', focusAreas = [], kbFileIds = [], background = '' } = params;
  const focusString = focusAreas.length > 0 ? focusAreas.join(', ') : 'General International Recruitment';
  const { client, config } = await getModelClient();

  let fullText = '';
  const append = (text: string) => { fullText += text; };

  // ── BLOCK 1: KB retrieval ──
  onProgress?.('[1/4] 正在检索 BEP 核心知识库与自定义文档...');
  let kbContext = '';
  if (kbFileIds.length > 0) {
    const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
    kbContext += kbFiles.map((f: any) => `【补充资料: ${f.title}】\n${f.content}`).join('\n\n') + '\n\n';
  }
  const coreKbFiles = await prisma.knowledgeItem.findMany({ where: { title: { startsWith: 'BEP Introduction' } }, take: 2 });
  kbContext += coreKbFiles.map((f: any) => `【BEP核心资料: ${f.title}】\n${f.content}`).join('\n\n');
  if (background) kbContext += `\n\n【背景资料 (Kelly 解析)】\n${background}`;

  // ── BLOCK 2: Initial Conversation ──
  onProgress?.('[2/4] 正在生成 Initial Conversation...');
  const header = `# British Enrolment Partners x ${targetSchool}\n\n*Private & Confidential*\n*Date: ${new Date().toLocaleDateString()}*\n\n## International Enrolment Strategy, Recruitment Coordination and Growth Partnership\n\n### 1. Initial Conversation\n\n`;
  append(header);

  const introRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are an expert business proposal writer for "British Enrolment Partners (BEP)".
Draft the "Initial Conversation" section (3-4 paragraphs) of a partnership proposal for ${targetSchool}.
School Profile & Needs: ${schoolProfile || 'General growth'}
Focus Areas: ${focusString}
Knowledge Base: ${kbContext}
Requirement: Explain why BEP is exceptionally well placed to support the school. State the school retains full control over admissions and pastoral care. Output ONLY the paragraphs, no headers.` }]),
    stream: true,
  });
  for await (const chunk of introRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // ── BLOCK 3: Commercial Model (hardcoded) ──
  onProgress?.('[3/4] 拼接商业条款 (Commercial Model)...');
  const modelDescription = COMMERCIAL_MODELS[businessModel] || COMMERCIAL_MODELS['Fixed Retainer'];
  append(`\n\n### 2. Commercial Model: ${businessModel}\n\n${modelDescription}\n\n### 3. What ${targetSchool} Gains\n\n`);

  // ── BLOCK 4: What School Gains + Next Steps ──
  onProgress?.('[4/4] 正在生成定制化收益 (What School Gains)...');
  const benefitsRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are an expert business proposal writer for BEP.
Draft the "What School Gains" section for ${targetSchool}.
School Profile: ${schoolProfile || 'General growth'}
Focus Areas: ${focusString}
Commercial Model: ${businessModel}
Requirement: 5-7 compelling benefits tailored to the school. Leverage BEP's global network. Output ONLY bullet points, no headers.` }]),
    stream: true,
  });
  for await (const chunk of benefitsRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // Hardcoded Next Steps
  append(`\n\n### 4. Recommendation and Next Steps\n\nShould ${targetSchool} wish to proceed, we suggest the following next steps:\n- Confirm the preferred partnership model.\n- Jointly agree recruitment targets, implementation roadmap and reporting framework.\n- Deliver comprehensive training for the BEP recruitment team to understand the ${targetSchool} offering.\n- Work closely with your marketing team to develop a coordinated recruitment plan for the agreed markets.\n\nWe are genuinely excited by the opportunity to work with you.`);

  onProgress?.('[完毕] ✅ Proposal 生成完毕！');

  // Save to GeneratedAsset
  const asset = await prisma.generatedAsset.create({
    data: {
      type: 'PROPOSAL',
      title: `${targetSchool} — Proposal`,
      payload: JSON.stringify({ content: fullText, targetSchool, businessModel }),
    }
  });

  return { content: fullText, assetId: asset.id, title: asset.title };
}

// ─── Legal ───────────────────────────────────────────────────────────────────

export interface LegalParams {
  docType: string;
  partyA: string;
  partyB?: string;
  keyTerms?: string;
  background?: string;
  templateStyle?: string;
  kbFileIds?: string[];
}

export interface LegalResult {
  content: string;
  assetId: string;
  title: string;
}

const DOC_TYPE_PROMPTS: Record<string, string> = {
  NDA: 'a Non-Disclosure Agreement (NDA) covering mutual confidentiality of business information',
  MOU: 'a Memorandum of Understanding (MOU) outlining the framework for cooperation',
  '服务协议': 'a Service Agreement defining scope, deliverables, fees and payment terms',
  '合作合同': 'a Partnership Contract covering profit sharing, governance, and exit provisions',
  '劳动合同': 'an Employment Contract covering role, compensation, benefits and restrictive covenants',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  '标准英式': 'Use formal British legal English. Include numbered clauses and standard definitions.',
  '中英双语': 'Draft in both English and Chinese. Each clause in English followed by its Chinese translation.',
  '简约版': 'Use plain language. Keep clauses concise and avoid unnecessary legalese.',
};

const STANDARD_CLAUSES: Record<string, string> = {
  NDA: `\n\n## 5. Standard Protective Provisions\n\n**5.1 Governing Law:** This Agreement shall be governed by and construed in accordance with the laws of England and Wales.\n\n**5.2 Dispute Resolution:** Any dispute shall first be submitted to good-faith mediation before proceeding to binding arbitration.\n\n**5.3 Severability:** If any provision is found invalid, the remainder of this Agreement shall continue in full force and effect.\n\n**5.4 Entire Agreement:** This Agreement constitutes the entire agreement between the parties and supersedes all prior discussions or agreements on the subject matter herein.`,
  MOU: `\n\n## 5. Standard Provisions\n\n**5.1 Non-Binding Nature:** This MOU is a statement of intent and does not create legally binding obligations unless expressly stated.\n\n**5.2 Governing Law:** Governed by the laws of England and Wales.\n\n**5.3 Termination:** Either party may terminate this MOU with 30 days written notice.`,
};

export async function generateLegal(
  params: LegalParams,
  onProgress?: (msg: string) => void
): Promise<LegalResult> {
  const { docType, partyA, partyB = '', keyTerms = '', background = '', templateStyle = '标准英式', kbFileIds = [] } = params;
  const { client, config } = await getModelClient();

  let fullText = '';
  const append = (text: string) => { fullText += text; };

  // ── BLOCK 1: KB retrieval ──
  onProgress?.('[1/4] 初始化参数，加载文书类型配置...');
  let kbContext = '';
  if (kbFileIds.length > 0) {
    const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
    kbContext = kbFiles.map((f: any) => `【参考资料: ${f.title}】\n${f.content || ''}`).join('\n\n');
  }
  if (background) kbContext += `\n\n【背景资料 (Kelly 解析)】\n${background}`;

  // ── BLOCK 2: AI generates main body ──
  onProgress?.(`[2/4] AI 生成主体条款 (${docType})...`);
  const styleInstruction = STYLE_INSTRUCTIONS[templateStyle] || STYLE_INSTRUCTIONS['标准英式'];
  const docInstruction = DOC_TYPE_PROMPTS[docType] || docType;

  const aiRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are an expert legal document drafter. Draft the MAIN BODY of ${docInstruction}.
Style: ${styleInstruction}
Party A: ${partyA}
Party B: ${partyB || '[To Be Confirmed]'}
Key Business Terms: ${keyTerms || 'Standard terms'}
Background: ${background || 'None'}
${kbContext ? `Reference Context:\n${kbContext}` : ''}

Output ONLY the following sections in Markdown (do NOT include standard protective clauses like Governing Law or Dispute Resolution — those will be added separately):
1. Document title, reference number, and date
2. Parties identification
3. Recitals / Background (WHEREAS)
4. Core business clauses numbered from 1 to 4
5. Signature blocks for both parties

Use [INSERT ...] placeholders for any missing specific values. Output ONLY raw Markdown.` }]),
    stream: true,
  });
  for await (const chunk of aiRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // ── BLOCK 3: Hardcoded standard clauses ──
  onProgress?.('[3/4] 拼接硬编码标准保护性条款...');
  const standardBlock = STANDARD_CLAUSES[docType] || '';
  if (standardBlock) append(standardBlock);

  onProgress?.('[4/4] ✅ 法律文书生成完成！');

  // Save to GeneratedAsset
  const asset = await prisma.generatedAsset.create({
    data: {
      type: 'LEGAL',
      title: `${docType} — ${partyA}${partyB ? ' × ' + partyB : ''}`,
      payload: JSON.stringify({ content: fullText, docType, partyA, partyB, templateStyle }),
    }
  });

  return { content: fullText, assetId: asset.id, title: asset.title };
}
