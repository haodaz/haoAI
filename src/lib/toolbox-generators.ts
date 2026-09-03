/**
 * toolbox-generators.ts
 * Server-side generation functions used by both:
 * 1. /api/toolbox/* SSE routes (for direct user access + Copilot)
 * 2. Agent routes (Alice, Eric) — await full result, bring content back to pipeline
 */

import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

// ─── Proposal ────────────────────────────────────────────────────────────────

/**
 * COMMERCIAL MODEL DESCRIPTIONS — Extracted verbatim from the official BEP Proposal Template.
 * These are hardcoded to ensure every proposal uses the exact same approved language.
 */
const COMMERCIAL_MODELS: Record<string, (school: string) => string> = {
  'Fixed Retainer': (school: string) => `Fixed Retainer - The Fixed Retainer model is best suited to a school with strong existing demand, clear market appeal, and an ambition to expand into new territories and develop a wider international network. This model offers optimum flexibility across BEP's agency partner network.

BEP would act as an extension of ${school}'s international recruitment team, combining strategic oversight, market expertise and global reach. Our in-region teams in China and South East Asia, supported by experienced UK-based student recruiters overseeing global recruitment, provide the College with local market knowledge, established agency relationships and coordinated recruitment support across key international markets. We also expect to shortly add two further in-country representatives to our Latin America team, further strengthening our regional presence and capacity.

We would not replace ${school}'s admissions authority or ask the school to give up trusted agent relationships. Instead, we would agree a clear and defined process aligned with ${school}'s priorities, covering agent network development, agent management, lead generation, family liaison, application support, offer conversion and pre-arrival follow-up.

All activity would remain focused on pupil fit, nationality balance and long-term retention. There would be no operational fee or enrolment-based charge, only a fixed monthly fee of £4,800 plus VAT. As well as offering the greatest flexibility, the Fixed Retainer may also prove to be the more economical option.`,

  'Performance Partnership': (school: string) => `Performance Partnership - The Performance Partnership offers ${school} a no-upfront-cost model, with payment linked to successful enrolments.

Under this model, BEP would carry the initial cost and commercial risk of developing new markets and agent relationships. In return, BEP would receive a 15% operational service fee for each year of a student's enrolment.

As BEP would be making this investment without a retainer, we would take clear responsibility for the markets and recruitment channels assigned, enabling the school to benefit from greater international coverage without increasing the demands on its internal team. This approach is particularly valuable when raising the profile of ${school} in strategic markets, where BEP can lead the development of agency relationships, market activity and student recruitment from the ground up.

Where an agent is involved, the agent's commission would remain entirely separate from BEP's operational service fee. BEP would collect the commission on behalf of the relevant agent and pass it on in full. BEP would not retain any part of the agent commission or determine the commission structure.`,

  'Hybrid (混合模式)': (school: string) => `Hybrid Model - A Hybrid Model combines a lower fixed monthly retainer with a reduced performance-based operational fee.

This approach reduces ${school}'s upfront financial commitment while ensuring BEP remains fully incentivised to deliver results. The retainer component provides a foundation for strategic planning, market development and team allocation, while the performance element aligns BEP's commercial return with successful student enrolments.

Specific financial terms — including the monthly retainer amount, the operational service fee percentage, and the markets covered — would be negotiated based on ${school}'s recruitment targets, market ambitions and expected volume.`
};

/**
 * STANDARD BENEFITS — Based on the official BEP Proposal Template Section 3.
 * These serve as the baseline; AI will personalise them for each school.
 */
const STANDARD_BENEFITS = [
  'A stronger and more consistent international recruitment pipeline.',
  'An extensive and robust international partner network.',
  "An 'always on' international recruitment function and greater in-country exposure in select markets.",
  'Better conversion from enquiry to application and from offer to enrolment.',
  'More strategic market development, with clearer control over geography, profile and nationality balance.',
  "Better use of the school's internal team by removing the in-market grind and follow-up burden.",
  'Greater visibility and control over international performance.',
];

/**
 * FEW-SHOT STYLE REFERENCE — Extracted from real Wellington School proposal Section 1.
 * Used to guide AI tone and structure when generating Initial Conversation.
 */
const INITIAL_CONVERSATION_EXAMPLE = `British Enrolment Partners ('BEP') is pleased to present this proposal to Wellington School, offering targeted international recruitment support designed to complement the school's existing international recruitment capability. Following our meeting on the 20th August, we identified an opportunity to strengthen the diversity and scale of Wellington School's international boarding community.

As a BEP partner school, Wellington School would benefit from direct access to BEP's established international network, market knowledge and recruitment infrastructure.

BEP recognises Wellington School's commitment to enhancing its international student community through a strong combination of academic progress, sporting opportunities and an extensive co-curricular offering. We can help promote this proposition through our established global network of international education agents.

BEP combines an established global network of educational agents with strong coverage across key international regions. Our reach spans Europe, Asia and Latin America, supported by experienced colleagues and in-market representation. This combination of trusted agency relationships, local market knowledge and international expertise enables us to identify and engage relevant recruitment partners and prospective families for Wellington School across an expansive range of international markets.

Importantly, Wellington School would retain ownership and control of the areas that are fundamental to the school's identity, standards and relationships with families. This includes:
• Admissions standards and final admissions decisions
• Scholarship and bursary decisions
• Pastoral oversight and boarding provision
• Final approval of student offers
• Direct relationships with students and their families once they join the school`;

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
 * Generate a full Proposal using the BEP Proposal Template as backbone.
 * Template-driven: AI only generates Initial Conversation + personalised benefits.
 * All commercial terms, structure and next steps are hardcoded from approved templates.
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
  onProgress?.('[1/5] 正在检索 BEP 核心知识库与自定义文档...');
  let kbContext = '';
  if (kbFileIds.length > 0) {
    const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
    kbContext += kbFiles.map((f: any) => `【补充资料: ${f.title}】\n${f.content}`).join('\n\n') + '\n\n';
  }
  const coreKbFiles = await prisma.knowledgeItem.findMany({ where: { title: { startsWith: 'BEP Introduction' } }, take: 2 });
  kbContext += coreKbFiles.map((f: any) => `【BEP核心资料: ${f.title}】\n${f.content}`).join('\n\n');
  if (background) kbContext += `\n\n【背景资料 (Kelly 解析)】\n${background}`;
  onProgress?.('[1/5] ✅ 知识库检索完毕');

  // ── BLOCK 2: Document Header (hardcoded from template) ──
  onProgress?.('[2/5] 正在组装文档头 (Proposal Template)...');
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const header = `# British Enrolment Partners x ${targetSchool}\n\n**Prepared by** British Enrolment Partners\n**Prepared for** ${targetSchool}\n\n*Private & Confidential*\n*${dateStr}*\n\n## International Enrolment Strategy, Recruitment Coordination and Growth Partnership\n\n### 1. Initial Conversation\n\n`;
  append(header);

  // ── BLOCK 3: Initial Conversation (AI-generated, style-guided) ──
  onProgress?.('[3/5] 正在生成 Initial Conversation (模板风格引导)...');

  const introRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are the proposal writer at British Enrolment Partners (BEP). You are drafting the "Initial Conversation" section of a formal partnership proposal.

STYLE REFERENCE — Here is how a real BEP proposal for Wellington School was written. Match this tone, structure and level of professionalism exactly:

---
${INITIAL_CONVERSATION_EXAMPLE}
---

NOW WRITE the "Initial Conversation" section for ${targetSchool}.

TARGET SCHOOL PROFILE:
${schoolProfile || 'A UK independent school seeking to strengthen international student recruitment.'}

FOCUS AREAS: ${focusString}

ADDITIONAL CONTEXT:
${kbContext}

RULES:
1. Follow the exact structure: opening paragraph (pleased to present + context of meeting) → school recognition paragraph (what makes this school strong) → BEP capability paragraph (global network, in-region teams) → school retains control paragraph (bullet list of 5 items).
2. Personalise for ${targetSchool} based on the school profile. Reference specific strengths, challenges or meeting context if provided.
3. Use professional British English. No contractions. Persuasive but understated.
4. The bullet list of retained controls MUST include these 5 items exactly: Admissions standards and final admissions decisions / Scholarship and bursary decisions / Pastoral oversight and boarding provision / Final approval of student offers / Direct relationships with students and their families once they join the school.
5. Do NOT use the word "guarantee" or make specific numerical promises about student numbers.
6. Output ONLY the paragraphs and bullet list. No section headers.` }]),
    stream: true,
  });
  for await (const chunk of introRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // ── BLOCK 4: Commercial Model (hardcoded from template) ──
  onProgress?.('[4/5] 拼接官方商业条款 (Commercial Model)...');
  const modelFn = COMMERCIAL_MODELS[businessModel] || COMMERCIAL_MODELS['Fixed Retainer'];
  const modelDescription = modelFn(targetSchool);

  // If the chosen model is Fixed Retainer or Performance, also include the other as an alternative
  let modelSection = `\n\n### 2. The Models: Fixed Retainer v Performance Partnership\n\n`;
  if (businessModel === 'Fixed Retainer') {
    modelSection += modelDescription;
    modelSection += `\n\n${COMMERCIAL_MODELS['Performance Partnership'](targetSchool)}`;
  } else if (businessModel === 'Performance Partnership') {
    modelSection += COMMERCIAL_MODELS['Fixed Retainer'](targetSchool);
    modelSection += `\n\n${modelDescription}`;
  } else {
    // Hybrid — show all three
    modelSection += COMMERCIAL_MODELS['Fixed Retainer'](targetSchool);
    modelSection += `\n\n${COMMERCIAL_MODELS['Performance Partnership'](targetSchool)}`;
    modelSection += `\n\n${modelDescription}`;
  }
  append(modelSection);

  // ── BLOCK 5: What School Gains (AI-personalised from template baseline) ──
  append(`\n\n### 3. What ${targetSchool} Gains\n\n`);
  onProgress?.('[5/5] 正在生成定制化收益 (What School Gains)...');

  const benefitsRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are the proposal writer at British Enrolment Partners (BEP).

Write the "What School Gains" section for ${targetSchool}. This is a bulleted list of 7 key benefits.

BASELINE BENEFITS (from the standard BEP template):
${STANDARD_BENEFITS.map((b, i) => `${i + 1}. ${b}`).join('\n')}

TARGET SCHOOL PROFILE: ${schoolProfile || 'A UK independent school seeking to grow international recruitment.'}
FOCUS AREAS: ${focusString}
COMMERCIAL MODEL: ${businessModel}

RULES:
1. Keep all 7 baseline benefits but personalise the wording for ${targetSchool}. Replace generic terms with school-specific language where the profile provides context.
2. You may reorder them to put the most relevant benefits first for this school.
3. Each benefit should be a single bullet point starting with "• ".
4. Use professional British English, matching the tone of the rest of the proposal.
5. Output ONLY the bullet points. No headers, no numbering, no introductory text.` }]),
    stream: true,
  });
  for await (const chunk of benefitsRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // ── BLOCK 6: Next Steps (hardcoded from template) ──
  onProgress?.('[完毕] 拼接推进步骤 (Next Steps)...');
  append(`\n\n### 4. Recommendation and Next Steps\n\nShould ${targetSchool} wish to proceed, we suggest the following next steps:\n\n• Confirm the preferred partnership model.\n\n• Jointly agree recruitment/revenue targets & markets, implementation roadmap and reporting framework.\n\n• Deliver comprehensive training for the BEP recruitment team, including in-person sessions for our UK staff and online training for our overseas teams, ensuring everyone has a thorough understanding of the ${targetSchool} offering, culture and admissions process.\n\n• Work closely with your marketing team to obtain the necessary marketing materials and develop a coordinated recruitment and marketing plan for the agreed markets.\n\n• We are genuinely excited by the opportunity to work together and believe BEP can make a meaningful contribution to expanding ${targetSchool}'s international presence.`);

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
  NDA: 'a Non-Disclosure Agreement (NDA) covering mutual confidentiality of business information, with provisions for permitted disclosures and remedies for breach',
  MOU: 'a Memorandum of Understanding (MOU) outlining the framework for cooperation between the parties, including scope, responsibilities and timeline',
  '服务协议': 'an International Recruitment Management Service Agreement defining scope of recruitment services, fee structure, agent management responsibilities, data protection obligations and termination provisions',
  '合作合同': 'a Partnership Contract covering service scope, revenue/commission sharing, exclusivity arrangements, governance structure, IP ownership and exit provisions',
  '劳动合同': 'an Employment Contract covering role, compensation, benefits, restrictive covenants and termination provisions',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  '标准英式': 'Use formal British legal English. Include numbered clauses and standard definitions. Follow the structure of English law commercial agreements.',
  '中英双语': 'Draft in both English and Chinese. Each clause in English followed by its Chinese translation. Use formal legal terminology in both languages.',
  '简约版': 'Use plain language. Keep clauses concise and avoid unnecessary legalese. Still include essential protective provisions.',
};

/**
 * STANDARD PROTECTIVE CLAUSES — Extracted from the real BEP Fixed Retainer Agreement.
 * These are appended to every legal document to ensure proper legal protection.
 */
const STANDARD_CLAUSES: Record<string, string> = {
  NDA: `\n\n## Standard Protective Provisions

**Governing Law and Jurisdiction**

This Agreement and any dispute or claim arising out of or in connection with it (including non-contractual disputes or claims) shall be governed by and construed in accordance with the law of England and Wales. Each party irrevocably agrees that the courts of England and Wales shall have exclusive jurisdiction to settle any dispute or claim that arises out of or in connection with this Agreement.

**Termination**

This Agreement shall remain in force for a period of [INSERT TERM] from the Effective Date and shall automatically renew for successive periods of equal length unless either party gives not less than 30 days' written notice prior to the end of the then-current term. Either party may terminate immediately for material breach that is not remedied within 14 days after written notice specifying the breach and required remedy.

**Remedies**

Each party acknowledges that a breach of the confidentiality obligations may cause irreparable harm for which damages may not be an adequate remedy, and agrees that the disclosing party shall be entitled to seek injunctive relief in addition to any other remedies available at law or in equity.

**General Provisions**

This Agreement constitutes the entire agreement between the parties in relation to its subject matter and supersedes all prior agreements, representations, and understandings. No amendment shall be valid unless made in writing and signed by authorised representatives of both parties. If any provision is found to be invalid or unenforceable, that provision shall be modified to the minimum extent necessary and the remaining provisions shall continue in full force and effect.`,

  MOU: `\n\n## Standard Provisions

**Non-Binding Nature**

This MOU is a statement of intent and does not create legally binding obligations unless expressly stated. The parties intend to negotiate and enter into a formal agreement based on the principles set out herein.

**Governing Law**

This MOU shall be governed by and construed in accordance with the law of England and Wales.

**Duration and Termination**

This MOU shall remain in effect for a period of [INSERT TERM] from the date of execution. Either party may withdraw from this MOU by giving 30 days' written notice to the other party.

**Confidentiality**

The parties agree to treat the contents and discussions arising from this MOU as confidential and shall not disclose them to third parties without the prior written consent of the other party, except as required by law or regulation.`,

  '服务协议': `\n\n## Standard Protective Provisions

**Termination and Exit**

This Agreement begins on the Effective Date and continues for a firm Initial Term of 12 months. Neither party may terminate for convenience so as to take effect during the Initial Term. After the Initial Term, the Agreement continues until either party gives not less than three months' written notice.

Either party may terminate immediately for insolvency or an irremediable material breach, or by written notice if a remediable material breach is not remedied within 14 days after a notice specifying the breach and required remedy.

Expiry or termination does not affect accrued rights or obligations to pay fees accrued up to the effective date, properly approved expenses, or agent commission payable under approved terms.

**Liability and Indemnities**

Subject to liabilities that cannot lawfully be limited, each party's aggregate liability arising in a Contract Year shall not exceed the greater of: (a) 125% of the Service Fees paid or payable for that Contract Year; and (b) GBP 50,000. Neither party shall be liable for indirect or consequential loss.

The limitations shall not apply to: death or personal injury caused by negligence; fraud or fraudulent misrepresentation; any liability that cannot be limited or excluded by law; breach of data protection obligations; or breach of confidentiality and non-circumvention obligations.

**Confidentiality**

Each party shall keep confidential all Confidential Information of the other party and shall not use it for any purpose other than performing its obligations under this Agreement. Confidential Information may be disclosed to professional advisers, employees and subcontractors who need to know it, provided they are bound by obligations of confidence no less onerous than this clause.

**Data Protection**

The parties shall comply with all applicable data protection legislation including the UK GDPR and the Data Protection Act 2018. Where the Service Provider processes personal data on behalf of the Partner, the parties shall enter into a data processing agreement in accordance with Article 28 of the UK GDPR.

**Dispute Resolution**

If a dispute arises, the parties shall first attempt to resolve it by escalation to senior representatives within 14 days. If not resolved within 30 days, either party may refer the dispute to mediation in accordance with the CEDR Model Mediation Procedure. Nothing shall prevent either party from seeking urgent injunctive relief from a court of competent jurisdiction.

**Governing Law and Jurisdiction**

This Agreement shall be governed by and construed in accordance with the law of England and Wales. Each party irrevocably agrees that the courts of England and Wales shall have exclusive jurisdiction.

**General Provisions**

This Agreement constitutes the entire agreement between the parties. No amendment shall be valid unless in writing signed by authorised representatives. No waiver of any right shall constitute a waiver of any subsequent right. If any provision is found invalid, the remaining provisions continue in full force. The Service Provider is an independent contractor; nothing creates a partnership, joint venture or employment relationship.`,

  '合作合同': `\n\n## Standard Protective Provisions

**Termination and Exit**

This Agreement begins on the Effective Date and continues for a firm Initial Term of 12 months. After the Initial Term, the Agreement continues until either party gives not less than three months' written notice. Either party may terminate immediately for insolvency or irremediable material breach.

During the notice period, the parties shall maintain an orderly transition, including handover of relevant records and return or deletion of personal data. Post-termination transition assistance is subject to separate written agreement.

**Liability**

Each party's aggregate liability shall not exceed the greater of 125% of fees paid or payable in the relevant year and GBP 50,000. A separate cap of 200% of fees and GBP 100,000 applies to breach of confidentiality, data protection and IP obligations. Neither party is liable for indirect or consequential loss.

**Confidentiality and Non-Circumvention**

Each party shall keep confidential all Confidential Information. Neither party shall circumvent the other by directly approaching the other party's introduced contacts, clients or partners to bypass the commercial arrangements established under this Agreement.

**Data Protection**

The parties shall comply with UK GDPR and the Data Protection Act 2018.

**Dispute Resolution**

Disputes shall be resolved by escalation → mediation (CEDR) → litigation in the courts of England and Wales.

**Governing Law**

Governed by the law of England and Wales. Courts of England and Wales have exclusive jurisdiction.

**General**

Entire agreement. Amendments in writing only. Independent contractor relationship. Severability applies.`,

  '劳动合同': `\n\n## Standard Provisions

**Governing Law**

This Contract shall be governed by and construed in accordance with the law of England and Wales.

**Confidentiality**

The Employee shall not during or after employment disclose any Confidential Information of the Employer to any third party without prior written consent.

**Restrictive Covenants**

For a period of [INSERT MONTHS] months following termination, the Employee shall not: (a) solicit or deal with any client or prospective client; (b) solicit or entice away any employee; (c) compete with the business within [INSERT GEOGRAPHY]. Each restriction is separate and severable.

**Data Protection**

The Employer shall process the Employee's personal data in accordance with the UK GDPR, the Data Protection Act 2018 and its privacy notice.

**Dispute Resolution**

Any dispute shall first be addressed through the Employer's internal grievance procedure. If not resolved, disputes shall be governed by the law of England and Wales.`
};

/**
 * LEGAL STYLE REFERENCE — Extracted from the BEP Fixed Retainer Agreement definitions.
 * Used to guide AI tone when drafting formal legal clauses.
 */
const LEGAL_STYLE_REFERENCE = `STYLE REFERENCE — The following is an extract from a real BEP Service Agreement showing the expected level of legal drafting formality:

"This Agreement is between the following named parties:
Partner School: [School Name]
Service Provider: IQ Schools Group Ltd, a company incorporated in England and Wales with company number 09631449 whose registered address is Crossway, 156 Charles Street Queensway, 6th Floor (6.03) Birmingham, West Midlands, England B3 3H, trading as British Enrolment Partners ('BEP')

IMPORTANT NOTICE: This Agreement is a legally binding contract. The Partner School should seek independent legal advice before signing.

'Academic Term' means the period of study at the Partner School commencing on the date on which the Partner School's academic term begins and ending on the last day of that academic term.

'Applicable Law' means all applicable laws, regulations, and regulatory guidance in force from time to time, including but not limited to the UK GDPR, the Data Protection Act 2018, the Children Act 1989, and any guidance issued by the Independent Schools Inspectorate, the British Council, or the UKVI."`;

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

  const isServiceAgreement = docType === '服务协议' || docType === '合作合同';

  const aiRes = await client.chat.completions.create({
    ...buildCompletionParams(config, [{ role: 'system', content: `You are a senior legal drafter at a UK law firm specialising in international education partnerships. Draft the MAIN BODY of ${docInstruction}.

${LEGAL_STYLE_REFERENCE}

Style: ${styleInstruction}
Party A: ${partyA}
Party B: ${partyB || '[To Be Confirmed]'}
Key Business Terms: ${keyTerms || 'Standard terms'}
Background: ${background || 'None'}
${kbContext ? `Reference Context:\n${kbContext}` : ''}

STRUCTURE — Output the following sections in Markdown:
1. **Document Header**: Title, reference number (format: BEP/[TYPE]/[YEAR]/[NNN]), and date
2. **Parties Identification**: Full legal names, registered addresses, company numbers where applicable
3. **Recitals / Background (WHEREAS)**: 3-4 recital paragraphs establishing the context
4. **Definitions**: At least 8 key defined terms relevant to the document type${isServiceAgreement ? ', including: "Academic Term", "Applicable Law", "Agent Commission", "Confidential Information", "Effective Date", "Initial Term", "Service Fees", "Recruited Student"' : ''}
5. **Core Business Clauses** (numbered 1-${isServiceAgreement ? '8' : '4'}): ${isServiceAgreement ? 'Scope of Services, Service Provider obligations, School obligations, Fee structure and payment terms, Agent management and commission, Reporting and review, Marketing approval and brand, Intellectual property' : 'Core commercial terms specific to the document type'}
6. **Signature blocks** for both parties with name, title, date fields

RULES:
- Use formal British legal English throughout
- Use [INSERT ...] placeholders for any missing specific values
- Do NOT include Governing Law, Dispute Resolution, Termination, Liability, Confidentiality or Data Protection — these standard protective clauses will be added separately from approved templates
- Each clause must be properly numbered (1.1, 1.2, etc.)
- Include "IMPORTANT NOTICE: This Agreement is a legally binding contract" after the header
- Output ONLY raw Markdown` }]),
    stream: true,
  });
  for await (const chunk of aiRes) {
    append(chunk.choices[0]?.delta?.content || '');
  }

  // ── BLOCK 3: Hardcoded standard clauses from real BEP agreements ──
  onProgress?.('[3/4] 拼接标准保护性条款 (来自 BEP 真实协议模板)...');
  const standardBlock = STANDARD_CLAUSES[docType] || STANDARD_CLAUSES['服务协议'];
  append(standardBlock);

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

