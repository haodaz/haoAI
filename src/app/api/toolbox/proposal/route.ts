import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

export const maxDuration = 300; // Allow long execution

// ── Reuse the same template constants from toolbox-generators.ts ──
// Commercial model descriptions extracted verbatim from the official BEP Proposal Template
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

const STANDARD_BENEFITS = [
  'A stronger and more consistent international recruitment pipeline.',
  'An extensive and robust international partner network.',
  "An 'always on' international recruitment function and greater in-country exposure in select markets.",
  'Better conversion from enquiry to application and from offer to enrolment.',
  'More strategic market development, with clearer control over geography, profile and nationality balance.',
  "Better use of the school's internal team by removing the in-market grind and follow-up burden.",
  'Greater visibility and control over international performance.',
];

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
          // ── BLOCK 1: KB Retrieval ──
          sendLog('[1/5]', '🔄 正在检索 BEP 核心知识库与自定义文档...');
          
          const { client, config } = await getModelClient();
          const focusString = (focusAreas || []).length > 0 ? focusAreas.join(', ') : 'General International Recruitment';

          let kbContext = '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext += kbFiles.map((f: any) => `【补充资料: ${f.title}】\n${f.content}`).join('\n\n') + '\n\n';
          }
          const coreKbFiles = await prisma.knowledgeItem.findMany({ where: { title: { startsWith: 'BEP Introduction' } }, take: 2 });
          kbContext += coreKbFiles.map((f: any) => `【BEP核心资料: ${f.title}】\n${f.content}`).join('\n\n');
          sendLog('[1/5]', '✅ 知识库检索完毕');

          // ── BLOCK 2: Document Header (hardcoded from template) ──
          sendLog('[2/5]', '🔄 正在组装文档头 (Proposal Template)...');
          const today = new Date();
          const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          const header = `# British Enrolment Partners x ${targetSchool}\n\n**Prepared by** British Enrolment Partners\n**Prepared for** ${targetSchool}\n\n*Private & Confidential*\n*${dateStr}*\n\n## International Enrolment Strategy, Recruitment Coordination and Growth Partnership\n\n### 1. Initial Conversation\n\n`;
          sendChunk(header);

          // ── BLOCK 3: Initial Conversation (AI-generated, style-guided) ──
          sendLog('[3/5]', '🔄 正在生成 Initial Conversation (模板风格引导)...');

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
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendChunk(text);
          }
          sendLog('[3/5]', '✅ Initial Conversation 生成完成');

          // ── BLOCK 4: Commercial Model (hardcoded from template) ──
          sendLog('[4/5]', '🔄 拼接官方商业条款 (Commercial Model)...');
          const modelFn = COMMERCIAL_MODELS[businessModel] || COMMERCIAL_MODELS['Fixed Retainer'];
          const modelDescription = modelFn(targetSchool);

          let modelSection = `\n\n### 2. The Models: Fixed Retainer v Performance Partnership\n\n`;
          if (businessModel === 'Fixed Retainer') {
            modelSection += modelDescription;
            modelSection += `\n\n${COMMERCIAL_MODELS['Performance Partnership'](targetSchool)}`;
          } else if (businessModel === 'Performance Partnership') {
            modelSection += COMMERCIAL_MODELS['Fixed Retainer'](targetSchool);
            modelSection += `\n\n${modelDescription}`;
          } else {
            modelSection += COMMERCIAL_MODELS['Fixed Retainer'](targetSchool);
            modelSection += `\n\n${COMMERCIAL_MODELS['Performance Partnership'](targetSchool)}`;
            modelSection += `\n\n${modelDescription}`;
          }
          sendChunk(modelSection);
          sendLog('[4/5]', '✅ 商业条款拼装完毕');

          // ── BLOCK 5: What School Gains (AI-personalised from template baseline) ──
          sendChunk(`\n\n### 3. What ${targetSchool} Gains\n\n`);
          sendLog('[5/5]', '🔄 正在生成定制化收益 (What School Gains)...');
          
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
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendChunk(text);
          }

          // ── BLOCK 6: Next Steps (hardcoded from template) ──
          sendLog('[完毕]', '🔄 拼接推进步骤 (Next Steps)...');
          const nextStepsBlock = `\n\n### 4. Recommendation and Next Steps\n\nShould ${targetSchool} wish to proceed, we suggest the following next steps:\n\n• Confirm the preferred partnership model.\n\n• Jointly agree recruitment/revenue targets & markets, implementation roadmap and reporting framework.\n\n• Deliver comprehensive training for the BEP recruitment team, including in-person sessions for our UK staff and online training for our overseas teams, ensuring everyone has a thorough understanding of the ${targetSchool} offering, culture and admissions process.\n\n• Work closely with your marketing team to obtain the necessary marketing materials and develop a coordinated recruitment and marketing plan for the agreed markets.\n\n• We are genuinely excited by the opportunity to work together and believe BEP can make a meaningful contribution to expanding ${targetSchool}'s international presence.`;
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

