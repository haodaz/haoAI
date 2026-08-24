import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

export const maxDuration = 300;

// ─── Hardcoded "non-negotiable" standard legal clauses ────────────────────────
const STANDARD_CLAUSES: Record<string, string> = {
  NDA: `
### 5. Standard Protective Clauses (Hardcoded)

**5.1 Governing Law**
This Agreement shall be governed by and construed in accordance with the laws of England and Wales. Each party irrevocably submits to the exclusive jurisdiction of the courts of England and Wales.

**5.2 Confidentiality Obligations**
The Receiving Party shall: (a) hold the Confidential Information in strict confidence; (b) not disclose any Confidential Information to any third party without prior written consent of the Disclosing Party; (c) use the Confidential Information solely for the Purpose set out in this Agreement.

**5.3 Term and Survival**
The obligations of confidentiality shall survive termination or expiry of this Agreement for a period of five (5) years.

**5.4 Remedies**
The parties acknowledge that any breach of this Agreement would cause irreparable harm for which monetary damages would be insufficient. The Disclosing Party shall be entitled to seek injunctive relief without the requirement to post bond.`,

  MOU: `
### 5. Standard Protective Clauses (Hardcoded)

**5.1 Non-Binding Nature**
This Memorandum of Understanding is not legally binding except for clauses 5.2, 5.3, and 5.4.

**5.2 Governing Law**
This MOU shall be governed by the laws of England and Wales.

**5.3 Confidentiality**
Each party shall keep confidential all information received from the other party marked as confidential or which ought reasonably be considered confidential.

**5.4 Termination**
Either party may terminate this MOU upon thirty (30) days' written notice to the other party.`,

  '服务协议': `
### 6. Standard Protective Clauses (Hardcoded)

**6.1 Governing Law**
This Agreement is governed by the laws of the People's Republic of China / England and Wales [as applicable].

**6.2 Liability Cap**
The Service Provider's total liability shall not exceed the total fees paid by the Client in the three (3) months preceding the claim.

**6.3 Dispute Resolution**
Any dispute shall first be resolved by good-faith negotiation. If unresolved within thirty (30) days, the dispute shall be submitted to arbitration in accordance with the applicable rules.

**6.4 Intellectual Property**
All deliverables created under this Agreement shall be owned by the Client upon full payment of fees.`,

  '合作合同': `
### 7. Standard Protective Clauses (Hardcoded)

**7.1 Governing Law**
This Agreement shall be governed by the laws of England and Wales.

**7.2 Exit Mechanism**
Either party may exit the partnership with ninety (90) days' written notice. Upon exit, assets and liabilities shall be divided in proportion to each party's capital contribution.

**7.3 Non-Compete**
During the term of this Agreement, neither party shall engage in activities that directly compete with the partnership's core business.`,

  '劳动合同': `
### 8. Standard Protective Clauses (Hardcoded)

**8.1 Governing Law**
This Contract is governed by the Labour Contract Law of the People's Republic of China.

**8.2 Non-Compete**
The Employee agrees not to engage in activities competing with the Employer's business for twelve (12) months following termination.

**8.3 Probation Period**
A probation period of [INSERT PERIOD] shall apply, during which either party may terminate with three (3) days' written notice.`,
};

const DOC_TYPE_PROMPTS: Record<string, string> = {
  NDA: 'a Non-Disclosure Agreement (保密协议). Cover definitions of confidential information, scope, obligations, permitted disclosures, and recitals.',
  MOU: 'a Memorandum of Understanding (谅解备忘录). Cover purpose, scope of cooperation, responsibilities, timeline, and intent of partnership.',
  '服务协议': 'a Service Agreement (服务协议). Cover scope of services, fees and payment schedule, deliverables, SLA, termination conditions.',
  '合作合同': 'a Partnership Agreement (合作合同). Cover purpose, profit sharing, management structure, decision making, and exit mechanism.',
  '劳动合同': 'an Employment Contract (劳动合同). Cover position, duties, compensation, benefits, working hours, non-compete, and termination.',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  '标准英式': 'Use formal British legal English. Include "WHEREAS" recitals, numbered clauses, and "IN WITNESS WHEREOF" execution block.',
  '中英双语': 'Write each clause in Chinese first, then the English translation immediately below. Use formal legal language in both.',
  '简约版': 'Use plain, modern plain-English. Keep clauses short and clear. Avoid excessive jargon. Target clarity over formality.',
};

export async function POST(req: Request) {
  try {
    const { docType, partyA, partyB, keyTerms, background, templateStyle, kbFileIds } = await req.json();

    if (!docType || !partyA) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (step: string, message: string) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'log', data: { step, message } })}\n\n`
          ));
        };
        const sendChunk = (text: string) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'ai_chunk', data: text })}\n\n`
          ));
        };
        const sendError = (message: string) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'error', data: { message } })}\n\n`
          ));
        };

        try {
          sendLog('[1/4]', '✅ 初始化参数，加载文书类型配置...');

          // --- BLOCK 1: KB retrieval ---
          let kbContext = '';
          if (kbFileIds?.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext = kbFiles.map((f: any) => `【参考资料: ${f.title}】\n${f.content || ''}`).join('\n\n');
          }
          sendLog('[2/4]', `✅ 知识库加载完毕。开始 AI 生成主体条款 (${docType})...`);

          // --- BLOCK 2: AI generates the variable clauses ---
          const { client, config } = await getModelClient();
          const styleInstruction = STYLE_INSTRUCTIONS[templateStyle] || STYLE_INSTRUCTIONS['标准英式'];
          const docInstruction = DOC_TYPE_PROMPTS[docType] || docType;

          const systemPrompt = `You are an expert legal document drafter. Draft the MAIN BODY of ${docInstruction}.
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
4. Core business clauses numbered from 1 to 4 (covering ${docInstruction})
5. Signature blocks for both parties

Use [INSERT ...] placeholders for any missing specific values. Output ONLY raw Markdown.`;

          const aiRes = await client.chat.completions.create({
            ...buildCompletionParams(config, [{ role: 'system', content: systemPrompt }]),
            stream: true,
          });

          for await (const chunk of aiRes) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendChunk(text);
          }

          // --- BLOCK 3: Hardcoded standard clauses ---
          sendLog('[3/4]', '✅ 主体条款生成完毕。正在拼接硬编码标准保护性条款...');
          const standardBlock = STANDARD_CLAUSES[docType] || '';
          if (standardBlock) {
            sendChunk(standardBlock);
          }

          // --- BLOCK 4: Footer ---
          sendLog('[4/4]', '✅ 标准条款已拼装完毕。法律文书生成完成！');

          controller.close();
        } catch (err: any) {
          console.error(err);
          sendError(err.message || 'Server error');
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Legal Toolbox error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
