const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.knowledgeItem.findMany({
    select: { id: true, title: true, type: true, fileUrl: true }
  });
  console.log(JSON.stringify(items, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
