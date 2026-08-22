const fs = require('fs');
const path = 'src/app/(dashboard)/office/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Fix line 413
code = code.replace(
  "addLog('System', `✅ ${i18n.language === 'en' ? \\`Approval notification sent to ${notifyData.emailSentTo} (${notifyData.tasksNotified} pending tasks)\\` : \\`审批通知已发送至 ${notifyData.emailSentTo}（${notifyData.tasksNotified} 项待审批）\\`}`);",
  "addLog('System', i18n.language === 'en' ? `✅ Approval notification sent to ${notifyData.emailSentTo} (${notifyData.tasksNotified} pending tasks)` : `✅ 审批通知已发送至 ${notifyData.emailSentTo}（${notifyData.tasksNotified} 项待审批）`);"
);

// Fix line 483
code = code.replace(
  "addLog('System', `✅ ${agentName} ${i18n.language === 'en' ? \\`approved (${data.remainingApprovals} pending approvals remaining)\\` : \\`已批准 (剩余 ${data.remainingApprovals} 项待审批)\\`}`);",
  "addLog('System', i18n.language === 'en' ? `✅ ${agentName} approved (${data.remainingApprovals} pending approvals remaining)` : `✅ ${agentName} 已批准 (剩余 ${data.remainingApprovals} 项待审批)`);"
);

fs.writeFileSync(path, code);
console.log("Fixed escaping.");
