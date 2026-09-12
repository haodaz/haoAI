import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import prisma from '@/lib/prisma';
import { buildAgentPrompt } from '@/lib/bristh-config';

export const maxDuration = 300;

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

// ── Document Type Configurations ──
const DOC_CONFIGS: Record<string, { label: string; systemPrompt: string; outputSchema: string }> = {
  invoice: {
    label: 'Invoice',
    systemPrompt: `You are a professional financial document generator for British Enrolment Partners (BEP).
Generate a detailed, professional invoice based on the provided information.
Use real BEP company details:
- Company: British Enrolment Partners Ltd
- Address: 106 Great Charles Street, Birmingham, B3 3HN, United Kingdom
- Phone: +44 7921 879 389
- Email: partners@bristhenrolmentpartners.com
- Bank: Barclays Bank, Sort Code: 20-07-06, Account: 13726895
- IBAN: GB82 BARC 2007 0613 7268 95
- VAT Registration: GB 123 4567 89`,
    outputSchema: `{
  "invoiceNumber": "INV-2026-XXX",
  "date": "2026-09-12",
  "dueDate": "2026-10-12",
  "billTo": { "name": "", "address": "", "email": "" },
  "items": [{ "description": "", "quantity": 1, "unitPrice": 0, "total": 0 }],
  "subtotal": 0,
  "vatRate": 20,
  "vatAmount": 0,
  "grandTotal": 0,
  "currency": "GBP",
  "notes": "",
  "paymentTerms": "Net 30"
}`
  },
  report: {
    label: 'Financial Report',
    systemPrompt: `You are a financial analyst at British Enrolment Partners (BEP).
Generate a comprehensive financial report with data analysis, charts data, and actionable insights.
Include revenue/expense breakdowns, trend analysis, and KPI metrics.
All monetary values should be in GBP unless otherwise specified.`,
    outputSchema: `{
  "title": "Report Title",
  "period": "Q3 2026",
  "executiveSummary": "Brief overview...",
  "kpis": [{ "label": "Total Revenue", "value": "£120,000", "change": "+12%", "trend": "up" }],
  "revenueBreakdown": [{ "category": "", "amount": 0, "percentage": 0 }],
  "expenseBreakdown": [{ "category": "", "amount": 0, "percentage": 0 }],
  "chartData": {
    "monthly": [{ "month": "Jan", "revenue": 0, "expenses": 0 }]
  },
  "insights": ["Key finding 1", "Key finding 2"],
  "recommendations": ["Action item 1"]
}`
  },
  budget: {
    label: 'Budget Planner',
    systemPrompt: `You are a strategic financial planner at British Enrolment Partners (BEP).
Generate a detailed budget plan with allocation breakdowns, forecasts, and scenario analysis.
Include quarterly projections and department/project allocations.
All monetary values should be in GBP unless otherwise specified.`,
    outputSchema: `{
  "title": "Budget Plan Title",
  "fiscalYear": "2026-2027",
  "totalBudget": 0,
  "currency": "GBP",
  "allocations": [{ "department": "", "allocated": 0, "percentage": 0, "notes": "" }],
  "quarterlyForecast": [{ "quarter": "Q1", "projected": 0, "notes": "" }],
  "scenarios": {
    "optimistic": { "revenue": 0, "notes": "" },
    "baseline": { "revenue": 0, "notes": "" },
    "conservative": { "revenue": 0, "notes": "" }
  },
  "assumptions": ["Assumption 1"],
  "risks": [{ "risk": "", "impact": "high", "mitigation": "" }]
}`
  },
  commission: {
    label: 'Commission Calculator',
    systemPrompt: `You are a commission and partnership finance specialist at British Enrolment Partners (BEP).
Calculate agent/partner commissions based on the provided deal information.
BEP standard commission structures:
- Fixed Retainer: £4,800/month + VAT (no commission)
- Performance Partnership: 15% operational service fee per enrolled student year
- Agent commission: Typically 10-15% of tuition, paid to recruitment agents (separate from BEP fee)
All monetary values should be in GBP unless otherwise specified.`,
    outputSchema: `{
  "title": "Commission Report",
  "partnershipModel": "Performance Partnership",
  "deals": [{
    "school": "",
    "students": 0,
    "annualFeePerStudent": 0,
    "bepFeeRate": 0.15,
    "bepFee": 0,
    "agentCommissionRate": 0.10,
    "agentCommission": 0,
    "netToSchool": 0
  }],
  "summary": {
    "totalStudents": 0,
    "totalRevenue": 0,
    "totalBepFees": 0,
    "totalAgentCommissions": 0,
    "netSchoolRevenue": 0
  },
  "notes": ""
}`
  }
};

export async function POST(req: Request) {
  try {
    const { docType, topic, background, kbFileIds } = await req.json();

    if (!docType || !DOC_CONFIGS[docType]) {
      return new Response(JSON.stringify({ error: `Invalid docType. Must be one of: ${Object.keys(DOC_CONFIGS).join(', ')}` }), { status: 400 });
    }
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
    }

    const config = DOC_CONFIGS[docType];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type, data })}\n\n`
          ));
        };

        try {
          const tracker = new TokenTracker();
          send('log', { step: '[1/3]', message: `📊 Preparing ${config.label}...` });

          // ── Phase 1: KB Loading ──
          let kbContext = '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext = kbFiles.map((f: any) => `[Reference: ${f.title}]\n${f.content || ''}`).join('\n\n');
            send('log', { step: '[1/3]', message: `✅ Loaded ${kbFiles.length} KB file(s)` });
          }

          if (background) {
            kbContext += (kbContext ? '\n\n' : '') + '[Additional Context]\n' + background;
          }

          // Auto-load BEP financial data from KB
          try {
            const financialKb = await prisma.knowledgeItem.findMany({
              where: {
                OR: [
                  { title: { contains: 'financial' } },
                  { title: { contains: 'invoice' } },
                  { title: { contains: 'commission' } },
                  { title: { contains: 'budget' } },
                  { title: { contains: 'revenue' } },
                  { title: { contains: 'BEP Introduction' } },
                ]
              },
              take: 5
            });
            if (financialKb.length > 0) {
              kbContext += (kbContext ? '\n\n' : '') + '[BEP Financial Reference]\n' +
                financialKb.map((f: any) => `${f.title}: ${(f.content || '').substring(0, 2000)}`).join('\n\n');
              send('log', { step: '[1/3]', message: `✅ Auto-loaded ${financialKb.length} financial reference(s)` });
            }
          } catch { /* ignore */ }

          send('log', { step: '[2/3]', message: `🤖 AI is generating your ${config.label}...` });

          // ── Phase 2: AI Generation ──
          const { client, config: modelConfig } = await getModelClient();

          let personaPrefix = '';
          try {
            personaPrefix = await buildAgentPrompt(
              'hugo',
              `Generate a ${config.label}: ${topic}`,
              kbContext,
              config.systemPrompt
            );
          } catch {
            personaPrefix = config.systemPrompt;
          }

          const fullPrompt = `${personaPrefix}

## TASK
Generate a professional ${config.label} based on the following request:
"${topic}"

## BUSINESS CONTEXT
${kbContext || 'No specific context provided. Use BEP standard templates and reasonable estimates.'}

## OUTPUT FORMAT
Return ONLY a valid JSON object matching this schema:
${config.outputSchema}

Be thorough, professional, and use realistic numbers. Output ONLY valid JSON.`;

          const response = await trackableCompletion(
            tracker, `finance_${docType}`, client, modelConfig,
            buildCompletionParams(modelConfig, [
              { role: 'system', content: fullPrompt },
              { role: 'user', content: `Generate the ${config.label} now. Output ONLY valid JSON.` }
            ], { requireJson: true, maxTokens: 8192 })
          );

          const rawContent = response.choices?.[0]?.message?.content || '';
          const result = extractJSON(rawContent);

          if (!result) {
            send('error', { message: `Failed to generate ${config.label} — AI output was not valid JSON` });
            controller.close();
            return;
          }

          // ── Phase 3: Save Asset ──
          send('log', { step: '[3/3]', message: `💾 Saving ${config.label}...` });

          const asset = await prisma.generatedAsset.create({
            data: {
              type: 'FINANCE',
              title: result.title || `${config.label}: ${topic}`,
              payload: JSON.stringify({ docType, result, topic }),
            }
          });

          send('log', { step: '[3/3]', message: `✅ ${config.label} generated successfully!` });
          send('result', { docType, result, assetId: asset.id });
          await tracker.persist('toolbox', 'finance').catch(() => {});
          controller.close();
        } catch (err: any) {
          console.error('Finance Toolbox error:', err);
          send('error', { message: err.message || 'Server error' });
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
    console.error('Finance Toolbox error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
