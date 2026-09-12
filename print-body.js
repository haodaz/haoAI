require('dotenv').config({ path: '.env.local' });
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

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
  const results = await connection.search(['ALL'], { bodies: ['HEADER', 'TEXT', ''] });
  for (const res of results) {
    const all = res.parts.find(p => p.which === '');
    if (all) {
      const idHeader = "Imap-Id: " + res.attributes.uid + "\r\n";
      const parsedMail = await simpleParser(idHeader + all.body);
      if (parsedMail.subject === 'Hi') {
         console.log('Subject:', parsedMail.subject);
         console.log('Text:', parsedMail.text);
      }
    }
  }
  connection.end();
}
test().catch(console.error);
