const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const interactions = await prisma.interaction.findMany({
    where: { type: 'EMAIL' },
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log(JSON.stringify(interactions, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
