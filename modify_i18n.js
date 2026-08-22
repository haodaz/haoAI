const fs = require('fs');

function update(file, keyPairs) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(keyPairs)) {
    data.bristh.nav[k] = v;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

update('src/lib/i18n/locales/en.json', {
  'kb_business': 'Business KB',
  'kb_tasks': 'Task Memory',
  'kb_memory': 'AI Personal Memory'
});

update('src/lib/i18n/locales/zh.json', {
  'kb_business': '业务知识',
  'kb_tasks': '任务记忆',
  'kb_memory': 'AI 私人记忆'
});
