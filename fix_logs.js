const fs = require('fs');

const path = 'src/app/(dashboard)/office/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = [
  {
    search: "addLog('System', `⏩ Phase ${phase} (${label}): ${group.map((t: any) => t.agent).join(', ')} — 前序阶段产出已注入`);",
    replace: "addLog('System', `⏩ Phase ${phase} (${label}): ${group.map((t: any) => t.agent).join(', ')} — ${i18n.language === 'en' ? 'Previous phase outputs injected' : '前序阶段产出已注入'}`);"
  },
  {
    search: "addLog(agentName, `🟡 需要人工审批确认才能继续。`);",
    replace: "addLog(agentName, `🟡 ${i18n.language === 'en' ? 'Requires manual approval to continue.' : '需要人工审批确认才能继续。'}`);"
  },
  {
    search: "addLog('System', `⏸️ Phase ${phase} (${PHASE_LABELS2[phase] || \\`Phase ${phase}\\`}): ${group.map((t: any) => t.agent).join(', ')} 等待审批完成后执行...`);",
    replace: "addLog('System', `⏸️ Phase ${phase} (${PHASE_LABELS2[phase] || \\`Phase ${phase}\\`}): ${group.map((t: any) => t.agent).join(', ')} ${i18n.language === 'en' ? 'waiting for approval to execute...' : '等待审批完成后执行...'}`);"
  },
  {
    search: "addLog('System', `⏩ Phase ${phase} (${PHASE_LABELS2[phase] || \\`Phase ${phase}\\`}): ${group.map((t: any) => t.agent).join(', ')} — 前序阶段产出已注入`);",
    replace: "addLog('System', `⏩ Phase ${phase} (${PHASE_LABELS2[phase] || \\`Phase ${phase}\\`}): ${group.map((t: any) => t.agent).join(', ')} — ${i18n.language === 'en' ? 'Previous phase outputs injected' : '前序阶段产出已注入'}`);"
  },
  {
    search: "addLog('System', '📧 正在发送审批通知邮件...');",
    replace: "addLog('System', `📧 ${i18n.language === 'en' ? 'Sending approval notification email...' : '正在发送审批通知邮件...'}`);"
  },
  {
    search: "addLog('System', `✅ 审批通知已发送至 ${notifyData.emailSentTo}（${notifyData.tasksNotified} 项待审批）`);",
    replace: "addLog('System', `✅ ${i18n.language === 'en' ? \\`Approval notification sent to ${notifyData.emailSentTo} (${notifyData.tasksNotified} pending tasks)\\` : \\`审批通知已发送至 ${notifyData.emailSentTo}（${notifyData.tasksNotified} 项待审批）\\`}`);"
  },
  {
    search: "addLog('System', `⚠️ 通知邮件发送失败: ${notifyData.error || notifyData.message || 'Unknown'}`);",
    replace: "addLog('System', `⚠️ ${i18n.language === 'en' ? 'Failed to send notification email:' : '通知邮件发送失败:'} ${notifyData.error || notifyData.message || 'Unknown'}`);"
  },
  {
    search: "addLog('System', `⚠️ 通知邮件发送失败: ${err.message}`);",
    replace: "addLog('System', `⚠️ ${i18n.language === 'en' ? 'Failed to send notification email:' : '通知邮件发送失败:'} ${err.message}`);"
  },
  {
    search: "addLog(agentName, '🔄 用户手动重试执行...');",
    replace: "addLog(agentName, `🔄 ${i18n.language === 'en' ? 'User manually retrying execution...' : '用户手动重试执行...'}`);"
  },
  {
    search: "addLog(agentName, '✅ 用户批准通过');",
    replace: "addLog(agentName, `✅ ${i18n.language === 'en' ? 'User approved' : '用户批准通过'}`);"
  },
  {
    search: "addLog('System', `⚠️ 审批失败: ${data.error}`);",
    replace: "addLog('System', `⚠️ ${i18n.language === 'en' ? 'Approval failed:' : '审批失败:'} ${data.error}`);"
  },
  {
    search: "addLog('System', `✅ ${agentName} 已批准 (剩余 ${data.remainingApprovals} 项待审批)`);",
    replace: "addLog('System', `✅ ${agentName} ${i18n.language === 'en' ? \\`approved (${data.remainingApprovals} pending approvals remaining)\\` : \\`已批准 (剩余 ${data.remainingApprovals} 项待审批)\\`}`);"
  },
  {
    search: "addLog('System', '🎉 所有审批已通过！正在恢复管线执行...');",
    replace: "addLog('System', `🎉 ${i18n.language === 'en' ? 'All approvals passed! Resuming pipeline execution...' : '所有审批已通过！正在恢复管线执行...'}`);"
  },
  {
    search: "addLog('System', `⚠️ 审批请求失败: ${err.message}`);",
    replace: "addLog('System', `⚠️ ${i18n.language === 'en' ? 'Approval request failed:' : '审批请求失败:'} ${err.message}`);"
  }
];

let replaced = 0;
for (const { search, replace } of replacements) {
  if (code.includes(search)) {
    code = code.replace(search, replace);
    replaced++;
  } else {
    console.log("NOT FOUND:", search);
  }
}

fs.writeFileSync(path, code);
console.log(`Replaced ${replaced} strings.`);
