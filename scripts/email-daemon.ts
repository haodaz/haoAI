import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const IMAP_USER = process.env.IMAP_USER;
const IMAP_PASSWORD = process.env.IMAP_PASSWORD;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5859';
const ORCHESTRATE_URL = `${BASE_URL}/api/bristh/orchestrate`;
const APPROVAL_REPLY_URL = `${BASE_URL}/api/bristh/approval-reply`;
const ADVANCE_URL = `${BASE_URL}/api/bristh/pipeline/advance`;

if (!IMAP_USER || !IMAP_PASSWORD || !INTERNAL_API_SECRET) {
  console.error('❌ Error: IMAP_USER, IMAP_PASSWORD and INTERNAL_API_SECRET must be set in .env.local');
  process.exit(1);
}

/** fetch() against the Autoffice API, authenticated as a trusted internal caller. */
function apiFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET!, ...(init.headers || {}) },
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Only trust the From address if the receiving server verified it:
 * DMARC pass, or a DKIM signature from the sender's own domain.
 */
function isSenderAuthenticated(authResults: string, fromAddress: string): boolean {
  const results = authResults.toLowerCase();
  if (/\bdmarc=pass\b/.test(results)) return true;
  const domain = fromAddress.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return new RegExp(`\\bdkim=pass\\b[^;]*header\\.(?:i|d)=@?${domain.replace(/\./g, '\\.')}(?=[\\s;]|$)`).test(results);
}

/** Run a pipeline phase by phase until it completes or pauses for approval. */
async function drivePipeline(contextId: string) {
  for (let step = 0; step < 50; step++) {
    try {
      const res = await apiFetch(ADVANCE_URL, { method: 'POST', body: JSON.stringify({ contextId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `status ${res.status}`);
      console.log(`   ↳ pipeline ${contextId}: ${data.state}${data.phase ? ` (phase ${data.phase})` : ''}`);
      if (data.state === 'completed' || data.state === 'awaiting_approval') return data.state;
      if (data.state === 'busy') await sleep(5000);
    } catch (err: any) {
      // The request may time out while agents keep running; poll again.
      console.error(`   ⚠️ advance failed: ${err.message}. Retrying...`);
      await sleep(5000);
    }
  }
  console.error(`   ❌ pipeline ${contextId} did not settle; resume it from the Office page.`);
}

const config = {
  imap: {
    user: IMAP_USER,
    password: IMAP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 3000,
  }
};

let isProcessing = false;

/**
 * Check if an email is a reply to an approval notification.
 * Matches the In-Reply-To or References header against stored approvalEmailId.
 */
async function findApprovalContext(inReplyTo: string | undefined, references: string | undefined): Promise<string | null> {
  if (!inReplyTo && !references) return null;

  // Collect all message IDs from headers
  const messageIds: string[] = [];
  if (inReplyTo) messageIds.push(inReplyTo.trim());
  if (references) {
    // References can contain multiple message IDs separated by spaces
    references.split(/\s+/).forEach(ref => {
      const cleaned = ref.trim();
      if (cleaned) messageIds.push(cleaned);
    });
  }

  // Search for matching TaskContext
  for (const msgId of messageIds) {
    try {
      const res = await apiFetch(`${BASE_URL}/api/bristh/tasks?approvalEmailId=${encodeURIComponent(msgId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.contextId) return data.contextId;
      }
    } catch {}
    
    // Also try direct DB-style matching via a simple API
    if (msgId.includes('approval-')) {
      // Extract contextId from our message ID format: <approval-{contextId}-{uuid}@bristh.autoffice>
      const match = msgId.match(/approval-([a-z0-9]+)-/);
      if (match) return match[1];
    }
  }

  return null;
}

async function pollEmails(connection: imaps.ImapSimple) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    await connection.openBox('INBOX');
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: ['', 'HEADER'], markSeen: true };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    
    if (messages.length > 0) {
      console.log(`\n📥 Found ${messages.length} new email(s). Processing...`);
    }

    for (const item of messages) {
      const all = item.parts.find(part => part.which === '');
      if (!all) continue;
      
      // Parse with mailparser
      const parsed = await simpleParser(all.body);
      
      const subject = parsed.subject || 'No Subject';
      const from = parsed.from?.text || 'Unknown Sender';
      const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || '';
      const authResults = [parsed.headers.get('authentication-results')].flat().filter(Boolean).join('; ');
      const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, '') : '') || 'No content';
      const inReplyTo = parsed.inReplyTo;
      const references = typeof parsed.references === 'string' ? parsed.references : Array.isArray(parsed.references) ? parsed.references.join(' ') : undefined;
      
      console.log(`\n========================================`);
      console.log(`📬 NEW MAIL: ${subject}`);
      console.log(`👤 FROM: ${from}`);
      if (inReplyTo) console.log(`↩️ IN-REPLY-TO: ${inReplyTo}`);
      console.log(`========================================`);

      if (!fromAddress || !isSenderAuthenticated(String(authResults), fromAddress)) {
        console.warn(`🚫 Ignored: sender ${fromAddress || '(none)'} failed DMARC/DKIM verification.`);
        continue;
      }

      // ====== Check if this is an approval reply ======
      const approvalContextId = await findApprovalContext(inReplyTo, references);

      if (approvalContextId) {
        console.log(`🔍 Detected approval reply for context: ${approvalContextId}`);
        console.log(`📋 Routing to approval-reply handler...`);

        try {
          const response = await apiFetch(APPROVAL_REPLY_URL, {
            method: 'POST',
            body: JSON.stringify({
              contextId: approvalContextId,
              replyContent: body,
              fromEmail: fromAddress,
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`✅ Approval reply processed: ${data.results?.length || 0} action(s)`);
            if (data.allApproved) {
              console.log(`🎉 All tasks approved! Resuming pipeline...`);
              await drivePipeline(approvalContextId);
            } else {
              console.log(`⏳ ${data.remainingApprovals} task(s) still awaiting approval.`);
            }
          } else {
            const errorData = await response.json();
            console.error(`❌ Approval reply handler error:`, errorData);
          }
        } catch (err: any) {
          console.error(`❌ Failed to process approval reply:`, err.message);
        }

        continue; // Skip orchestrate flow for approval replies
      }

      // ====== Normal new task flow ======
      const rawContent = `[邮件指令]\n发件人: ${from}\n主题: ${subject}\n\n正文:\n${body}`;

      console.log(`🚀 Dispatching task to Chief Orchestrator...`);
      
      try {
        const response = await apiFetch(ORCHESTRATE_URL, {
          method: 'POST',
          body: JSON.stringify({
            source: 'EMAIL',
            rawContent,
            senderEmail: fromAddress,
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Task successfully dispatched! Task Context ID: ${data.contextId}`);
          console.log(`🤖 ${data.tasks.length} Agent(s) assigned to the pipeline. Executing...`);
          const finalState = await drivePipeline(data.contextId);
          if (finalState === 'awaiting_approval') {
            console.log(`📧 Paused for approval. A notification was sent to the task owner.`);
          } else if (finalState === 'completed') {
            console.log(`🎉 All background agents have finished processing the email!`);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error(`❌ Orchestrator rejected the email (${response.status}):`, errorData.error || errorData);
        }
      } catch (postError: any) {
        console.error(`❌ Failed to connect to Orchestrator API at ${ORCHESTRATE_URL}. Is Next.js running?`, postError.message);
      }
    }
  } catch (error) {
    console.error('⚠️ Error during IMAP poll:', error);
  } finally {
    isProcessing = false;
  }
}

async function startDaemon() {
  console.log(`\n📧 Starting Bristh Email Daemon...`);
  console.log(`🌐 Connecting to IMAP server as ${IMAP_USER}...`);
  
  try {
    const connection = await imaps.connect(config);
    console.log(`✅ Connected successfully! Listening for new emails...`);
    
    // Poll every 10 seconds
    setInterval(() => {
      pollEmails(connection);
    }, 10000);
    
    // Initial poll
    pollEmails(connection);

    // Handle disconnects
    connection.on('error', (err) => {
      console.error('❌ IMAP Connection Error:', err);
      process.exit(1);
    });

    connection.on('end', () => {
      console.error('❌ IMAP Connection Ended');
      process.exit(1);
    });

  } catch (err: any) {
    console.error('❌ Failed to start IMAP Daemon:', err.message);
    process.exit(1);
  }
}

startDaemon();
