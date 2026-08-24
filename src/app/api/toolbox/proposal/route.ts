import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

export const maxDuration = 300; // Allow long execution

const COMMERCIAL_MODELS: Record<string, string> = {
  'Fixed Retainer': `The Fixed Retainer model is best suited to a school with strong existing demand, clear market appeal, and an ambition to expand into new territories. 
- BEP acts as an extension of the school's international recruitment team.
- No operational fee or enrolment-based charge.
- Fixed monthly fee of £4,800 plus VAT.
- Offers optimum flexibility across BEP’s agency partner network.`,
  'Performance Partnership': `The Performance Partnership offers the school a no-upfront-cost model, with payment linked to successful enrolments.
- BEP carries the initial cost and commercial risk of developing new markets.
- BEP receives a 15% operational service fee for each year of a student’s enrolment.
- Agent commission remains separate and is collected by BEP on behalf of the agent.`,
  'Hybrid (混合模式)': `A Hybrid Model combines a lower fixed monthly retainer with a reduced performance-based operational fee.
- Reduces upfront risk while ensuring BEP remains incentivized for success.
- Specific financial terms to be negotiated based on market targets and volume expectations.`
};

export async function POST(req: Request) {
  try {
    const { targetSchool, schoolProfile, businessModel, focusAreas, additionalNotes, kbFileIds } = await req.json();

    if (!targetSchool) {
      return NextResponse.json({ error: 'Missing targetSchool' }, { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (step: string, message: string) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'log', data: { step, message } })}\n\n`));
        };
        let fullText = '';
        const sendChunk = (text: string) => {
          fullText += text;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'ai_chunk', data: text })}\n\n`));
        };
        const sendError = (message: string) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', data: { message } })}\n\n`));
        };
        const sendDone = (assetId: string) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', data: { assetId } })}\n\n`));
        };

        try {
          sendLog('[1/4]', '✅ 开始生成 Proposal，初始化系统参数...');
          
          const { client, config } = await getModelClient();
          const focusString = focusAreas.length > 0 ? focusAreas.join(', ') : 'General International Recruitment';

          // --- BLOCK 1: Knowledge Retrieval & Intro Generation ---
          sendLog('[2/4]', '🔄 正在检索 BEP 核心知识库与自定义文档...');
          let kbContext = '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext += kbFiles.map((f: any) => `【补充资料: ${f.title}】\n${f.content}`).join('\n\n') + '\n\n';
          }
          const coreKbFiles = await prisma.knowledgeItem.findMany({ where: { title: { startsWith: 'BEP Introduction' } }, take: 2 });
          kbContext += coreKbFiles.map((f: any) => `【BEP核心资料: ${f.title}】\n${f.content}`).join('\n\n');
          sendLog('[2/4]', '✅ 知识组装完毕。开始生成 Initial Conversation...');

          const header = `# British Enrolment Partners x ${targetSchool}\n\n*Private & Confidential*\n*Date: ${new Date().toLocaleDateString()}*\n\n## International Enrolment Strategy, Recruitment Coordination and Growth Partnership\n\n### 1. Initial Conversation\n\n`;
          sendChunk(header);

          const introPrompt = `You are an expert business proposal writer for "British Enrolment Partners (BEP)".
Draft the "Initial Conversation" section (3-4 paragraphs) of a partnership proposal for ${targetSchool}.
School Profile & Needs: ${schoolProfile || 'General growth'}
Focus Areas: ${focusString}
Knowledge Base: ${kbContext}
Requirement: Explain why BEP is exceptionally well placed to support the school based on BEP's core intro. State that the school retains full control over admissions and pastoral care. Output ONLY the paragraphs, no headers.`;

          const introRes = await client.chat.completions.create({
            ...buildCompletionParams(config, [{ role: 'system', content: introPrompt }]),
            stream: true,
          });

          for await (const chunk of introRes) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendChunk(text);
          }

          // --- BLOCK 2: Commercial Model (Hardcoded) ---
          sendLog('[3/4]', '✅ Initial Conversation 生成完成。正在硬编码商业条款 (Commercial Model)...');
          const modelDescription = COMMERCIAL_MODELS[businessModel] || COMMERCIAL_MODELS['Fixed Retainer'];
          const modelBlock = `\n\n### 2. Commercial Model: ${businessModel}\n\n${modelDescription}\n\n### 3. What ${targetSchool} Gains\n\n`;
          sendChunk(modelBlock);

          // --- BLOCK 3: What School Gains Generation ---
          sendLog('[4/4]', '🔄 商业条款已拼装。开始生成定制化收益 (What School Gains)...');
          
          const benefitsPrompt = `You are an expert business proposal writer for BEP.
Draft the "What School Gains" section of a partnership proposal for ${targetSchool}.
School Profile & Needs: ${schoolProfile || 'General growth'}
Focus Areas: ${focusString}
Commercial Model: ${businessModel}
Requirement: Provide a bulleted list of 5-7 highly compelling benefits tailored to the school profile. Leverage BEP's global network and expertise. Output ONLY the bullet points, no headers.`;

          const benefitsRes = await client.chat.completions.create({
            ...buildCompletionParams(config, [{ role: 'system', content: benefitsPrompt }]),
            stream: true,
          });

          for await (const chunk of benefitsRes) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendChunk(text);
          }

          // --- BLOCK 4: Next Steps (Hardcoded) ---
          sendLog('[4/4]', '✅ 定制收益生成完毕。拼接推进步骤...');
          const nextStepsBlock = `\n\n### 4. Recommendation and Next Steps\n\nShould ${targetSchool} wish to proceed, we suggest the following next steps:\n- Confirm the preferred partnership model.\n- Jointly agree recruitment targets, implementation roadmap and reporting framework.\n- Deliver comprehensive training for the BEP recruitment team to understand the ${targetSchool} offering.\n- Work closely with your marketing team to develop a coordinated recruitment plan for the agreed markets.\n\nWe are genuinely excited by the opportunity to work with you.`;
          sendChunk(nextStepsBlock);

          sendLog('[完毕]', '✅ Proposal 全部生成完毕！');

          // Save to GeneratedAsset for history
          const asset = await prisma.generatedAsset.create({
            data: {
              type: 'PROPOSAL',
              title: `${targetSchool} — Proposal`,
              payload: JSON.stringify({ content: fullText, targetSchool, businessModel }),
            }
          });
          sendDone(asset.id);
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
    console.error('Proposal API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT — Copilot Refinement: modify existing proposal based on instruction
 */
export async function PUT(req: Request) {
  try {
    const { currentDocument, instruction, targetSchool, businessModel } = await req.json();
    if (!currentDocument || !instruction) {
      return new Response(JSON.stringify({ error: 'Missing currentDocument or instruction' }), { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type, data })}\n\n`
          ));
        };

        try {
          const { client, config } = await getModelClient();

          const systemPrompt = `You are an expert business proposal editor at British Enrolment Partners (BEP).
The user has a draft proposal for ${targetSchool || 'a school'} (${businessModel || 'Fixed Retainer'} model) and wants to make specific modifications.

Current Proposal:
${currentDocument}

Your task:
1. Understand the user's modification instruction.
2. Apply ONLY the requested changes. Keep everything else identical.
3. Reply with a very brief confirmation message (1 sentence) followed by "---DOCUMENT---" then the COMPLETE updated proposal in Markdown.

IMPORTANT:
- Keep ALL hardcoded commercial terms (£4,800/month, 15% fee) exactly as-is.
- Keep the 4-section structure (Initial Conversation / Commercial Model / What School Gains / Next Steps).
- Output format MUST be: "Brief reply\n---DOCUMENT---\n[full updated markdown]"`;

          const response = await client.chat.completions.create(
            buildCompletionParams(config, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: instruction }
            ])
          );

          const text = response.choices[0].message.content || '';
          const parts = text.split('---DOCUMENT---');
          const reply = parts[0].trim();
          const updatedDoc = parts[1]?.trim() || currentDocument;

          send('reply', reply || '✅ Proposal 已根据指令更新。');
          send('document', updatedDoc);
          controller.close();
        } catch (err: any) {
          console.error(err);
          send('error', { message: err.message });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

