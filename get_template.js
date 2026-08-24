const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const item = await prisma.knowledgeItem.findFirst({ where: { title: 'Proposal Template' }});
  if (item) {
    console.log(item.content ? item.content.substring(0, 3000) : 'No content');
  } else {
    console.log('Not found');
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
