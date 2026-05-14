import crypto from 'crypto';
import { MailerAdapter } from '../../../mailer.adapter.js';
import { userPersistence } from '../user.persistence.js';
import { renderEmailTemplate } from './emailTemplates.service.js';
import { createSmtpProviderConfigFromEnv, SmtpMailerAdapter } from './smtp.client.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;

const DEFAULT_FROM_EMAIL = 'noreply@scholomance.ai';
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 60_000;
const DEFAULT_WORKER_INTERVAL_MS = 15_000;
const DEFAULT_STALE_LOCK_MS = 5 * 60_000;

function safeLogger(logger) {
  return logger || console;
}

function normalizeProviderName(value) {
  return String(value || '').trim().toLowerCase();
}

function isRetryableError(error) {
  const status = Number(error?.status) || 0;
  if (status >= 500) return true;
  return error?.retryable === true;
}

function computeBackoffMs(attemptNumber) {
  const exponent = Math.max(0, Number(attemptNumber) - 1);
  return Math.min(DEFAULT_RETRY_BASE_MS * (2 ** exponent), 30 * 60_000);
}

export class ConsoleMailerAdapter extends MailerAdapter {
  constructor(logger) {
    super();
    this.logger = safeLogger(logger);
  }

  async send({ to, subject, text }) {
    this.logger.info('--- MAIL QUEUE DELIVERY START ---');
    this.logger.info(`To: ${to}`);
    this.logger.info(`Subject: ${subject}`);
    this.logger.info(`Text: ${text}`);
    this.logger.info('--- MAIL QUEUE DELIVERY END ---');
    return { providerMessageId: null };
  }
}

export class SendGridMailerAdapter extends MailerAdapter {
  constructor(apiKey, fromEmail = DEFAULT_FROM_EMAIL) {
    super();
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send({ to, subject, text, html }) {
    if (!this.apiKey) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.MISSING_REQUIRED,
        { parameter: 'SENDGRID_API_KEY', operation: 'SendGridMailerAdapter.send' },
      );
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromEmail },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html || text },
        ],
      }),
    });

    if (!response.ok) {
      const error = new Error(`SendGrid API error (${response.status})`);
      error.status = response.status;
      error.retryable = response.status >= 500;
      error.responseText = await response.text();
      throw error;
    }

    return {
      providerMessageId: response.headers.get('x-message-id') || null,
    };
  }
}

export class ResendMailerAdapter extends MailerAdapter {
  constructor(apiKey, fromEmail = DEFAULT_FROM_EMAIL) {
    super();
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send({ to, subject, text, html }) {
    if (!this.apiKey) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.MISSING_REQUIRED,
        { parameter: 'RESEND_API_KEY', operation: 'ResendMailerAdapter.send' },
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [to],
        subject,
        text,
        html: html || text,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(`Resend API error (${response.status})`);
      error.status = response.status;
      error.retryable = response.status >= 500;
      error.responsePayload = payload;
      throw error;
    }

    return {
      providerMessageId: payload?.id || null,
    };
  }
}

function createProviderAdapter(logger) {
  const provider = normalizeProviderName(
    (process.env.MAIL_PROVIDER ||
    (process.env.SMTP_HOST ? 'smtp' : '') ||
    (process.env.RESEND_API_KEY ? 'resend' : '') ||
    (process.env.SENDGRID_API_KEY ? 'sendgrid' : '') ||
    'console').toLowerCase().trim()
  );
  const fromEmail = process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;

  switch (provider) {
    case 'postfix':
    case 'smtp': {
      const smtpConfig = createSmtpProviderConfigFromEnv();
      return {
        provider,
        adapter: new SmtpMailerAdapter({
          ...smtpConfig,
          fromEmail: smtpConfig.fromEmail || fromEmail,
        }),
      };
    }
    case 'resend':
      return { provider, adapter: new ResendMailerAdapter(process.env.RESEND_API_KEY, fromEmail) };
    case 'sendgrid':
      return { provider, adapter: new SendGridMailerAdapter(process.env.SENDGRID_API_KEY, fromEmail) };
    case 'console':
      return { provider, adapter: new ConsoleMailerAdapter(logger) };
    default:
      safeLogger(logger).warn(`[MAILER] Unknown provider "${provider}", falling back to console.`);
      return { provider: 'console', adapter: new ConsoleMailerAdapter(logger) };
  }
}

export class MailerService {
  constructor(options = {}) {
    this.logger = safeLogger(options.logger);
    const providerConfig = options.providerConfig || createProviderAdapter(this.logger);
    this.provider = providerConfig.provider;
    this.adapter = providerConfig.adapter;
    this.appBaseUrl = String(options.appBaseUrl || process.env.APP_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:8080').trim();
    this.appName = String(options.appName || process.env.APP_NAME || 'Scholomance').trim();
  }

  queueTemplate(templateKey, { to, data = {}, metadata = {}, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
    const normalizedRecipient = String(to || '').trim().toLowerCase();
    if (!normalizedRecipient) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
        ERROR_CODES.MISSING_REQUIRED,
        { parameter: 'to', operation: 'MailerService.queueTemplate' },
      );
    }

    const rendered = renderEmailTemplate(templateKey, {
      ...data,
      appName: this.appName,
      baseUrl: data.baseUrl || this.appBaseUrl,
    });

    return userPersistence.mail.queue({
      id: crypto.randomUUID(),
      templateKey,
      recipient: normalizedRecipient,
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      provider: this.provider,
      metadata: {
        ...metadata,
        templateKey,
      },
      maxAttempts,
    });
  }

  async deliverQueuedBatch(limit = 10) {
    const claimed = await userPersistence.mail.claimDue(limit);
    const results = [];

    for (const email of claimed) {
      try {
        const providerResult = await this.adapter.send({
          to: email.recipient,
          subject: email.subject,
          text: email.textBody,
          html: email.htmlBody,
        });
        const sentEmail = userPersistence.mail.markSent(email.id, providerResult?.providerMessageId || null);
        results.push({ status: 'sent', email: sentEmail });
      } catch (error) {
        const terminal = !isRetryableError(error) || email.attempts >= email.maxAttempts;
        const nextAttemptAt = terminal
          ? new Date().toISOString()
          : new Date(Date.now() + computeBackoffMs(email.attempts)).toISOString();
        const lastError = [
          error?.message || 'Unknown mail delivery failure',
          error?.responseText || '',
          error?.responsePayload ? JSON.stringify(error.responsePayload) : '',
        ].filter(Boolean).join(' :: ');

        const failedEmail = userPersistence.mail.markFailed(email.id, {
          lastError,
          nextAttemptAt,
          terminal,
        });
        this.logger.warn({ err: error, emailId: email.id, recipient: email.recipient }, '[MAILER] Delivery failed');
        results.push({ status: terminal ? 'failed' : 'retry', email: failedEmail, error });
      }
    }

    return results;
  }

  requeueStaleProcessingLocks(staleLockMs = DEFAULT_STALE_LOCK_MS) {
    const staleBeforeIso = new Date(Date.now() - staleLockMs).toISOString();
    return userPersistence.mail.requeueStaleProcessing(staleBeforeIso);
  }
}

export function createMailerService(logger, options = {}) {
  return new MailerService({ logger, ...options });
}

export function createMailQueueWorker(mailer, options = {}) {
  const service = mailer instanceof MailerService ? mailer : new MailerService({ logger: options.logger });
  const logger = safeLogger(options.logger || service.logger);
  const intervalMs = Number(options.intervalMs) || DEFAULT_WORKER_INTERVAL_MS;
  const batchSize = Number(options.batchSize) || 10;
  let timer = null;
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      service.requeueStaleProcessingLocks();
      await service.deliverQueuedBatch(batchSize);
    } catch (error) {
      logger.error({ err: error }, '[MAILER] Queue worker tick failed');
    } finally {
      isRunning = false;
    }
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      void tick();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
