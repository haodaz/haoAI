const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.knowledgeItem.findMany({ select: { id: true, title: true, type: true }});
  console.log(items);
}
main().catch(console.error).finally(() => prisma.$disconnect());
