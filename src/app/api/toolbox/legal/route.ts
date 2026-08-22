import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';

/**
 * Legal Document Generator Toolbox API
 * Input: docType, partyA, partyB, keyTerms, background, templateStyle
 * Output: Markdown legal document
 * 
 * Same interface that AI agent Eric uses.
 */

const DOC_TYPE_PROMPTS: Record<string, string> = {
  NDA: 'Non-Disclosure Agreement (保密协议). Include definitions, scope of confidential information, obligations, term, remedies, and governing law.',
  MOU: 'Memorandum of Understanding (谅解备忘录). Include purpose, scope of cooperation, responsibilities of each party, timeline, and non-binding nature.',
  '服务协议': 'Service Agreement (服务协议). Include scope of services, fees, payment terms, deliverables, SLA, liability, termination, and dispute resolution.',
  '合作合同': 'Partnership Agreement (合作合同). Include purpose, capital contribution, profit sharing, management, decision making, exit mechanism, and dispute resolution.',
  '劳动合同': 'Employment Contract (劳动合同). Include position, duties, compensation, benefits, working hours, probation, termination, and non-compete.',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  '标准英式': 'Use formal British legal English. Include "WHEREAS" recitals, numbered clauses, and "IN WITNESS WHEREOF" execution block.',
  '中英双语': 'Write each clause in Chinese first, then English translation below. Use formal legal language in both languages.',
  '简约版': 'Use plain, modern language. Keep clauses short and clear. Avoid excessive legal jargon. Focus on clarity.',
};

export async function POST(req: Request) {
  try {
    const { docType, partyA, partyB, keyTerms, background, templateStyle, kbFileIds } = await req.json();

    let finalBackground = background || '';
    if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
      const kbFiles = await prisma.knowledgeItem.findMany({
        where: { id: { in: kbFileIds } }
      });
      const kbTexts = kbFiles.map((f: any) => `【参考资料: ${f.title}】\n${f.content || '无正文内容'}`).join('\n\n');
      finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
    }

    if (!docType || !partyA) {
      return NextResponse.json({ error: 'Missing required fields (docType, partyA)' }, { status: 400 });
    }

    const { client, config } = await getModelClient();

    const docTypeInstruction = DOC_TYPE_PROMPTS[docType] || docType;
    const styleInstruction = STYLE_INSTRUCTIONS[templateStyle] || STYLE_INSTRUCTIONS['标准英式'];

    const systemPrompt = `You are an expert legal document drafter. Generate a professional legal document in Markdown format.

Document Type: ${docTypeInstruction}

Style: ${styleInstruction}

**Parties:**
- Party A: ${partyA || 'TBD'}
- Party B: ${partyB || 'TBD'}

**Key Terms to Include:**
${keyTerms || 'Standard terms'}

**Background Context / Additional Instructions:**
${finalBackground || 'None'}

Output a complete, professional legal document in Markdown format. Include:
1. Document title and reference number
2. Date and parties identification
3. Recitals / Background
4. All relevant clauses with proper numbering
5. Use [INSERT ...] placeholders for any missing specific values (amounts, dates, etc.)
6. Signature blocks for both parties

Make it comprehensive and legally sound.`;

    const response = await client.chat.completions.create(
      buildCompletionParams(config, [
        { role: 'system', content: systemPrompt }
      ])
    );

    const document = response.choices[0].message.content || 'Failed to generate document.';

    return NextResponse.json({
      success: true,
      document,
      docType,
      partyA,
      partyB: partyB || '[未指定]',
    });
  } catch (error: any) {
    console.error('Legal Toolbox error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
