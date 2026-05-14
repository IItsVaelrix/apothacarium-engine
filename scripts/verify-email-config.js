import { createMailerService } from '../codex/server/services/mailer.service.js';
import pkg from 'fastify';
const { fastify } = pkg;

async function test() {
  console.log('Testing Mailer Configuration...');
  console.log('MAIL_PROVIDER:', process.env.MAIL_PROVIDER);
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);

  const logger = {
    info: (msg) => console.log('[INFO]', msg),
    warn: (msg) => console.warn('[WARN]', msg),
    error: (msg) => console.error('[ERROR]', msg),
  };

  const mailer = createMailerService(logger);
  
  try {
    console.log('\nAttempting to queue a test email...');
    // This will persist to abyss.sqlite outbox
    const queued = mailer.queueTemplate('verify-email', {
      to: 'test@example.com',
      data: { username: 'Admin', token: 'test-token' }
    });
    console.log('Email successfully queued in outbox. ID:', queued.id);
    
    console.log('\nTo actually send this to your Postfix server, ensure the mail worker is running (npm run dev).');
    console.log('Check the "email_outbox" table in abyss.sqlite to see the status.');
  } catch (err) {
    console.error('Configuration check failed:', err.message);
  }
}

test();
