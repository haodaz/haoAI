import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const DOCS_DIR = path.join(process.cwd(), 'AI Assistant Docs');
const PUBLIC_KB_DIR = path.join(process.cwd(), 'public', 'kb-files');

async function scanFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log('Starting KB file linkage...');
  await fs.mkdir(PUBLIC_KB_DIR, { recursive: true });

  const allFiles = await scanFiles(DOCS_DIR);
  let matchedCount = 0;

  for (const filePath of allFiles) {
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.')) continue; // skip hidden files like .DS_Store
    
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    
    // Find matching KnowledgeItem
    const item = await prisma.knowledgeItem.findFirst({
      where: {
        title: baseName,
        type: 'FILE'
      }
    });

    if (item) {
      // Copy file to public dir
      const safeName = `${item.id}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destPath = path.join(PUBLIC_KB_DIR, safeName);
      
      const stats = await fs.stat(filePath);
      await fs.copyFile(filePath, destPath);
      
      const fileUrl = `/kb-files/${safeName}`;
      
      await prisma.knowledgeItem.update({
        where: { id: item.id },
        data: {
          fileUrl,
          fileName,
          fileSize: stats.size,
          fileType: ext.replace('.', '').toUpperCase()
        }
      });
      
      console.log(`✅ Linked: "${baseName}" -> ${fileUrl}`);
      matchedCount++;
    } else {
      console.log(`⚠️ No DB match found for file: "${fileName}" (Search key: "${baseName}")`);
    }
  }

  console.log(`\n🎉 Done! Successfully matched and linked ${matchedCount} files.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
