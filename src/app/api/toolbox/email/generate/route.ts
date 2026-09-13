import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import prisma from '@/lib/prisma';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { prompt, to, replyToBody, kbFileIds } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const tracker = new TokenTracker();
    const { client, config } = await getModelClient();

    // ── Gather KB context ──
    let kbContext = '';

    // User-selected KB files
    if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
      const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
      kbContext += kbFiles.map((f: any) => `【Reference: ${f.title}】\n${f.content}`).join('\n\n') + '\n\n';
    }

    // Always inject BEP core intro
    const coreFiles = await prisma.knowledgeItem.findMany({
      where: { title: { startsWith: 'BEP Introduction' } },
      take: 2,
    });
    kbContext += coreFiles.map((f: any) => `【BEP Core: ${f.title}】\n${f.content}`).join('\n\n');

    // If no specific files selected, also pull relevant outreach templates
    if (!kbFileIds || kbFileIds.length === 0) {
      const templates = await prisma.knowledgeItem.findMany({
        where: {
          OR: [
            { title: { contains: 'Outreach' } },
            { title: { contains: 'Template' } },
            { title: { contains: 'Email' } },
          ]
        },
        take: 5,
      });
      if (templates.length > 0) {
        kbContext += '\n\n' + templates.map((f: any) => `【Template: ${f.title}】\n${f.content}`).join('\n\n');
      }
    }

    const systemPrompt = `You are a professional email composer for Bristh Enrollment Partners (BEP), a UK-based international student recruitment company.

Your task: Write a professional, polished email based on the user's instructions.

Guidelines:
- Use a warm but professional tone appropriate for business correspondence in the education sector
- Be concise and well-structured with clear paragraphs
- Include appropriate greeting and sign-off
- If replying to an email, reference the original context naturally
- Use the knowledge base context to ensure accuracy about BEP's services, partnerships, and capabilities
- Output ONLY valid JSON: { "subject": "...", "htmlBody": "<html formatted email body>" }

The htmlBody should be clean HTML with inline styles for email compatibility. Use <p>, <ul>, <li>, <strong>, <br> tags. Keep it professional.

${kbContext ? `\n── Knowledge Base Context ──\n${kbContext}` : ''}
${replyToBody ? `\n── Original Email Being Replied To ──\n${replyToBody}` : ''}`;

    const userMessage = to
      ? `Compose an email to ${to}. Instructions: ${prompt}`
      : `Compose an email. Instructions: ${prompt}`;

    const response = await trackableCompletion(
      tracker, 'email_generate', client, config,
      buildCompletionParams(config, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ], { requireJson: true })
    );

    let rawJson = response.choices[0].message.content || '{}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();

    let result;
    try {
      result = JSON.parse(rawJson);
    } catch {
      result = { subject: 'Draft Email', htmlBody: `<p>${rawJson}</p>` };
    }

    // Track token usage
    await tracker.persist('toolbox_email_generate');

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Email Generate] Error:', error);
    return NextResponse.json({ error: 'Failed to generate email', details: error.message }, { status: 500 });
  }
}
