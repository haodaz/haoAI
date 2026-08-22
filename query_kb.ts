import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.knowledgeItem.findMany({ select: { id: true, title: true, type: true, content: true }, take: 5 });
  for (const item of items) {
    console.log(`Title: ${item.title}`);
    console.log(`Type: ${item.type}`);
    console.log(`Content snippet: ${item.content?.substring(0, 100)}...`);
    console.log('---');
  }
}
main().then(() => prisma.$disconnect());
