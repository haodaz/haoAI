const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src/app/(dashboard)/AIkb/page.tsx');
const content = fs.readFileSync(srcFile, 'utf8');

const businessDir = path.join(__dirname, 'src/app/(dashboard)/AIkb/business');
const tasksDir = path.join(__dirname, 'src/app/(dashboard)/AIkb/tasks');
const memoryDir = path.join(__dirname, 'src/app/(dashboard)/AIkb/memory');

fs.mkdirSync(businessDir, { recursive: true });
fs.mkdirSync(tasksDir, { recursive: true });
fs.mkdirSync(memoryDir, { recursive: true });

function createPage(title, subtitle, componentName, dir) {
  const pageContent = content.replace(
    /export default function AIKbPage\(\) \{[\s\S]*$/,
    `export default function Page() {
  return (
    <div className="w-full h-full bg-[#f8f9fc] flex flex-col overflow-hidden">
      <div className="px-8 pt-7 pb-2 shrink-0">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">${title}</h1>
        <p className="text-xs text-gray-400 mt-1">${subtitle}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-5">
        <${componentName} />
      </div>
    </div>
  );
}`
  );
  fs.writeFileSync(path.join(dir, 'page.tsx'), pageContent, 'utf8');
}

// 1. Create Tasks and Memory pages (Unmodified)
createPage('任务记忆', '从任务执行中积累的记录', 'TaskMemoryTab', tasksDir);
createPage('AI 私人记忆', '每个 AI 的经验、教训和灵魂文件', 'AIMemoryTab', memoryDir);

// 2. Create Business page (We will refactor this next)
createPage('业务知识', '公司、客户、行业的知识文档', 'BusinessTab', businessDir);

console.log("Successfully split AIkb pages.");
