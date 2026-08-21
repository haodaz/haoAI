import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parseFileContent } from './src/lib/file-parser';

const prisma = new PrismaClient();

async function processDirectory(dirPath: string) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;
    
    // Skip images and unsupported formats
    const ext = path.extname(entry.name).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.zip'].includes(ext)) {
        console.log(`Skipping unsupported file: ${entry.name}`);
        continue;
    }

    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else {
      console.log(`Processing: ${fullPath}`);
      try {
        const buffer = fs.readFileSync(fullPath);
        const fileName = entry.name;
        // Basic MIME type approximation is fine since parser relies mainly on ext
        const mimeType = 'application/octet-stream'; 
        
        const parsed = await parseFileContent(buffer, mimeType, fileName);
        
        if (parsed && parsed.extractedText && parsed.extractedText.length > 0) {
            const title = fileName.replace(/\.[^/.]+$/, "");
            
            // Delete if already exists to ensure we have the latest and avoid duplicates
            await prisma.knowledgeItem.deleteMany({
                where: { title }
            });

            await prisma.knowledgeItem.create({
              data: {
                title: title,
                content: parsed.extractedText,
                category: '业务资料',
                audience: 'BEP Office AI',
              }
            });
            console.log(`✅ Saved ${title} to KnowledgeBase.`);
        } else {
            console.log(`⚠️ No text extracted for ${fileName}`);
        }
      } catch (err: any) {
        console.error(`❌ Failed to process ${fullPath}: ${err.message}`);
      }
    }
  }
}

async function main() {
  const targetDir = path.join(process.cwd(), 'AI Assistant Docs');
  console.log(`Starting document import from ${targetDir}`);
  await processDirectory(targetDir);
  console.log('Import completed!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
