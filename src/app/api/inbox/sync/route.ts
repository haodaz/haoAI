import { NextResponse } from 'next/server';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';

export const maxDuration = 300; // 5 minutes max duration

// Initialize DashScope / OpenAI compatible client
const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

const IMAP_CONFIG = {
  imap: {
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 30000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

export async function POST() {
  if (!IMAP_CONFIG.imap.user || !IMAP_CONFIG.imap.password) {
    return NextResponse.json({ error: 'IMAP credentials not configured in .env.local' }, { status: 500 });
  }

  let connection;
  try {
    connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox('INBOX');

    // Fetch unseen emails (last 5 to avoid timeouts)
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: true };
    
    const results = await connection.search(searchCriteria, fetchOptions);
    const emailsToProcess = results.slice(-5); // Process max 5 at a time

    if (emailsToProcess.length === 0) {
      connection.end();
      return NextResponse.json({ message: 'No new emails found.', count: 0 });
    }

    const processedLeads = [];

    for (const item of emailsToProcess) {
      const all = item.parts.find((part) => part.which === '');
      const id = item.attributes.uid;
      const idHeader = "Imap-Id: "+id+"\r\n";
      
      const parsedMail = await simpleParser(idHeader + all.body);
      const from = parsedMail.from?.text || 'Unknown';
      const fromAddress = parsedMail.from?.value[0]?.address || '';
      const subject = parsedMail.subject || 'No Subject';
      const text = parsedMail.text || '';

      // Skip empty emails
      if (!text.trim() && !subject.trim()) continue;
      
      const emailContent = text.trim() ? text : `(No body, subject: ${subject})`;

      // Call AI to analyze email
      const analysisPrompt = `
      Please analyze the following inquiry email received by our school's admissions office.
      
      Sender: ${from}
      Subject: ${subject}
      Body:
      ${emailContent}

      Extract the following information and return ONLY a strict JSON object:
      {
        "type": "STUDENT" or "PARTNER", // Is this a student/parent or an agency/partner?
        "name": "Sender's Name",
        "phone": "Extracted phone number if any, else null",
        "intent": "Core inquiry intent in 3-5 words",
        "background": {
           // Extract any structured background info here, like age, grade, location, budget, etc. If none, empty object.
        },
        "insights": "Write a 3-4 sentence insight summarizing their background, tone, and what they care about most.",
        "nextSteps": "Write actionable next steps for the admissions team (e.g. 1. Send brochure... 2. Call them...)"
      }
      
      Respond strictly with valid JSON.
      `;

      const aiResponse = await openai.chat.completions.create({
        model: "qwen-plus",
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" }
      });

      let aiResult;
      try {
        aiResult = JSON.parse(aiResponse.choices[0].message.content || '{}');
      } catch (e) {
        console.error('Failed to parse AI response for email:', subject);
        continue; // Skip if invalid JSON
      }

      // Save to CRM Database
      const newCustomer = await prisma.customer.create({
        data: {
          name: aiResult.name || from,
          type: aiResult.type || 'STUDENT',
          phone: aiResult.phone || null,
          email: fromAddress,
          intent: aiResult.intent || '咨询',
          source: 'Email Auto-Sync',
          notes: `Subject: ${subject}`,
          background: JSON.stringify(aiResult.background || {}),
          insights: aiResult.insights,
          nextSteps: Array.isArray(aiResult.nextSteps) ? aiResult.nextSteps.join('\n') : (aiResult.nextSteps || ''),
          sourceAI: 'inbox_assistant',
          interactions: {
            create: {
              type: 'EMAIL',
              summary: `收到主题为 "${subject}" 的邮件咨询。`,
              messages: JSON.stringify([
                { role: 'user', content: emailContent, timestamp: parsedMail.date?.toISOString() || new Date().toISOString() }
              ])
            }
          }
        }
      });

      processedLeads.push(newCustomer);
    }

    connection.end();
    return NextResponse.json({ 
      message: `Successfully processed ${processedLeads.length} emails.`,
      count: processedLeads.length,
      leads: processedLeads
    });

  } catch (error) {
    console.error('IMAP Sync Error:', error);
    if (connection) {
      connection.end();
    }
    return NextResponse.json({ error: 'Failed to sync inbox', details: String(error) }, { status: 500 });
  }
}
