require('dotenv').config({ path: '.env.local' });
const imaps = require('imap-simple');

const IMAP_CONFIG = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 30000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

async function test() {
  const connection = await imaps.connect(IMAP_CONFIG);
  await connection.openBox('INBOX');
  const results = await connection.search(['ALL'], { bodies: ['HEADER'], markSeen: false });
  console.log(`Found ${results.length} emails in INBOX`);
  results.forEach(res => {
    const header = res.parts.find(p => p.which === 'HEADER');
    console.log(`- Subject: ${header.body.subject[0]}, From: ${header.body.from[0]}`);
  });
  connection.end();
}
test().catch(console.error);
