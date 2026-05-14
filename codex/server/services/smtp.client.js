import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { MailerAdapter } from '../../../mailer.adapter.js';

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_TIMEOUT_MS = 10_000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function sanitizeHeaderValue(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function wrapBase64(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim();
}

function buildAddress(email, name = '') {
  const safeEmail = sanitizeHeaderValue(email);
  const safeName = sanitizeHeaderValue(name);
  if (!safeName) return safeEmail;
  const escapedName = safeName.replace(/["\\]/g, '\\$&');
  return `"${escapedName}" <${safeEmail}>`;
}

function normalizeMessageBody(body) {
  return String(body ?? '').replace(/\r?\n/g, '\r\n');
}

function buildMimeMessage({ fromEmail, fromName, to, subject, text, html }) {
  const boundary = `scholomance-${crypto.randomUUID()}`;
  const messageIdDomain = String(fromEmail || 'localhost').split('@')[1] || 'localhost';
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${messageIdDomain}>`,
    `From: ${buildAddress(fromEmail, fromName)}`,
    `To: ${buildAddress(to)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (html) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(normalizeMessageBody(text)),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(normalizeMessageBody(html)),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');
  }

  return [
    ...headers,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(normalizeMessageBody(text)),
    '',
  ].join('\r\n');
}

function dotStuffMessage(message) {
  return normalizeMessageBody(message).replace(/(^|\r\n)\./g, '$1..');
}

function createSmtpError(message, {
  code = null,
  retryable = false,
  responseText = null,
  cause = null,
} = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.status = code;
  error.retryable = retryable;
  error.responseText = responseText;
  return error;
}

function normalizeSocketError(error) {
  if (!error) {
    return createSmtpError('SMTP connection failed');
  }
  if (typeof error.retryable === 'boolean') return error;
  const retryableCodes = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
  ]);
  const normalized = createSmtpError(error.message || 'SMTP transport failure', {
    retryable: retryableCodes.has(error.code),
    cause: error,
  });
  normalized.code = error.code;
  return normalized;
}

function parseEhloCapabilities(lines) {
  const capabilities = new Map();
  for (const rawLine of lines) {
    const match = String(rawLine).match(/^\d{3}[ -](.*)$/);
    if (!match) continue;
    const body = match[1].trim();
    if (!body) continue;
    const [name, ...rest] = body.split(/\s+/);
    capabilities.set(name.toUpperCase(), rest.join(' '));
  }
  return capabilities;
}

function supportsAuthMechanism(capabilities, mechanism) {
  const authLine = capabilities.get('AUTH') || '';
  return authLine.toUpperCase().split(/\s+/).includes(mechanism.toUpperCase());
}

class SmtpResponseReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.pending = [];
    this.currentLines = [];
    this.ended = false;
    this.onData = (chunk) => this.consumeChunk(chunk);
    this.onError = (error) => this.flushError(normalizeSocketError(error));
    this.onClose = () => {
      if (!this.ended) {
        this.flushError(createSmtpError('SMTP connection closed unexpectedly', { retryable: true }));
      }
    };
    this.socket.setEncoding('utf8');
    this.socket.on('data', this.onData);
    this.socket.on('error', this.onError);
    this.socket.on('close', this.onClose);
  }

  detach() {
    this.ended = true;
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
    this.pending = [];
  }

  readResponse() {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  consumeChunk(chunk) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      this.consumeLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  consumeLine(line) {
    const match = String(line).match(/^(\d{3})([ -])(.*)$/);
    if (!match) {
      if (this.currentLines.length > 0) {
        this.currentLines.push(String(line));
      }
      return;
    }

    const code = Number(match[1]);
    const separator = match[2];
    this.currentLines.push(String(line));

    if (separator === ' ') {
      const message = this.currentLines
        .map((entry) => entry.replace(/^\d{3}[ -]?/, '').trim())
        .filter(Boolean)
        .join(' ');
      const response = {
        code,
        lines: [...this.currentLines],
        message,
      };
      this.currentLines = [];
      const waiter = this.pending.shift();
      if (waiter) {
        waiter.resolve(response);
      }
    }
  }

  flushError(error) {
    const pending = [...this.pending];
    this.pending = [];
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }
}

async function openSocket(config) {
  const timeoutMs = toPositiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error) => {
      if (settled) return;
      settled = true;
      reject(normalizeSocketError(error));
    };

    const handleConnect = (socket) => {
      if (settled) return;
      settled = true;
      socket.setTimeout(timeoutMs, () => {
        socket.destroy(createSmtpError('SMTP connection timed out', {
          retryable: true,
        }));
      });
      resolve(socket);
    };

    const socket = config.secure
      ? tls.connect({
          host: config.host,
          port: config.port,
          servername: config.host,
          rejectUnauthorized: config.tlsRejectUnauthorized,
        }, () => handleConnect(socket))
      : net.createConnection({
          host: config.host,
          port: config.port,
        }, () => handleConnect(socket));

    socket.once('error', onError);
  });
}

async function upgradeSocketToTls(socket, config) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const secureSocket = tls.connect({
      socket,
      servername: config.host,
      rejectUnauthorized: config.tlsRejectUnauthorized,
    }, () => {
      if (settled) return;
      settled = true;
      resolve(secureSocket);
    });
    secureSocket.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(normalizeSocketError(error));
    });
  });
}

function extractProviderMessageId(responseText) {
  const match = String(responseText || '').match(/(?:id[ =:<"]+)([A-Za-z0-9._-]+)/i);
  return match ? match[1] : null;
}

export function createSmtpProviderConfigFromEnv() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = toPositiveInteger(process.env.SMTP_PORT, DEFAULT_SMTP_PORT);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const requireTls = parseBoolean(process.env.SMTP_REQUIRE_TLS, false);
  const tlsRejectUnauthorized = parseBoolean(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true);
  const timeoutMs = toPositiveInteger(process.env.SMTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const username = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASS || '').trim();
  const fromEmail = String(process.env.EMAIL_FROM || '').trim();
  const fromName = String(process.env.EMAIL_FROM_NAME || process.env.APP_NAME || 'Scholomance').trim();
  const greetingName = sanitizeHeaderValue(process.env.SMTP_GREETING_NAME || 'localhost');

  return {
    host,
    port,
    secure,
    requireTls,
    tlsRejectUnauthorized,
    timeoutMs,
    username,
    password,
    fromEmail,
    fromName,
    greetingName,
  };
}

export class SmtpMailerAdapter extends MailerAdapter {
  constructor(config = {}) {
    super();
    const socketFactory = typeof config.socketFactory === 'function' ? config.socketFactory : openSocket;
    const tlsUpgradeFactory = typeof config.tlsUpgradeFactory === 'function' ? config.tlsUpgradeFactory : upgradeSocketToTls;
    this.config = {
      ...config,
      host: String(config.host || '').trim(),
      port: toPositiveInteger(config.port, DEFAULT_SMTP_PORT),
      secure: Boolean(config.secure),
      requireTls: Boolean(config.requireTls),
      tlsRejectUnauthorized: config.tlsRejectUnauthorized !== false,
      timeoutMs: toPositiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS),
      username: String(config.username || '').trim(),
      password: String(config.password || '').trim(),
      fromEmail: String(config.fromEmail || '').trim(),
      fromName: String(config.fromName || 'Scholomance').trim(),
      greetingName: sanitizeHeaderValue(config.greetingName || 'localhost'),
      socketFactory,
      tlsUpgradeFactory,
    };
  }

  assertConfigured() {
    if (!this.config.host) {
      throw createSmtpError('SMTP_HOST is missing');
    }
    if (!this.config.fromEmail) {
      throw createSmtpError('EMAIL_FROM is required for SMTP delivery');
    }
    if (this.config.username && !this.config.password) {
      throw createSmtpError('SMTP_PASS is required when SMTP_USER is set');
    }
  }

  async send({ to, subject, text, html }) {
    this.assertConfigured();

    let socket = null;
    let reader = null;
    let isEncrypted = this.config.secure;

    const sendCommand = async (command, expectedCodes) => {
      socket.write(`${command}\r\n`);
      const response = await reader.readResponse();
      if (!expectedCodes.includes(response.code)) {
        throw createSmtpError(`SMTP command failed: ${command}`, {
          code: response.code,
          retryable: String(response.code).startsWith('4'),
          responseText: response.lines.join(' | '),
        });
      }
      return response;
    };

    const sendEhlo = async () => {
      const response = await sendCommand(`EHLO ${this.config.greetingName}`, [250]);
      return parseEhloCapabilities(response.lines);
    };

    try {
      socket = await this.config.socketFactory(this.config);
      reader = new SmtpResponseReader(socket);

      const banner = await reader.readResponse();
      if (banner.code !== 220) {
        throw createSmtpError('SMTP server rejected the initial connection', {
          code: banner.code,
          retryable: String(banner.code).startsWith('4'),
          responseText: banner.lines.join(' | '),
        });
      }

      let capabilities = await sendEhlo();
      const supportsStartTls = capabilities.has('STARTTLS');

      if (!isEncrypted && supportsStartTls) {
        await sendCommand('STARTTLS', [220]);
        reader.detach();
        socket = await this.config.tlsUpgradeFactory(socket, this.config);
        reader = new SmtpResponseReader(socket);
        capabilities = await sendEhlo();
        isEncrypted = true;
      } else if (this.config.requireTls && !isEncrypted) {
        throw createSmtpError('SMTP server does not support the required TLS mode');
      }

      if (this.config.username) {
        if (supportsAuthMechanism(capabilities, 'PLAIN')) {
          const plainToken = Buffer.from(`\0${this.config.username}\0${this.config.password}`, 'utf8').toString('base64');
          await sendCommand(`AUTH PLAIN ${plainToken}`, [235]);
        } else if (supportsAuthMechanism(capabilities, 'LOGIN')) {
          await sendCommand('AUTH LOGIN', [334]);
          await sendCommand(Buffer.from(this.config.username, 'utf8').toString('base64'), [334]);
          await sendCommand(Buffer.from(this.config.password, 'utf8').toString('base64'), [235]);
        } else {
          throw createSmtpError('SMTP server does not advertise AUTH PLAIN or AUTH LOGIN');
        }
      }

      await sendCommand(`MAIL FROM:<${sanitizeHeaderValue(this.config.fromEmail)}>`, [250]);
      await sendCommand(`RCPT TO:<${sanitizeHeaderValue(to)}>`, [250, 251]);
      await sendCommand('DATA', [354]);

      const mimeMessage = buildMimeMessage({
        fromEmail: this.config.fromEmail,
        fromName: this.config.fromName,
        to,
        subject,
        text,
        html,
      });
      socket.write(`${dotStuffMessage(mimeMessage)}\r\n.\r\n`);
      const dataResponse = await reader.readResponse();
      if (dataResponse.code !== 250) {
        throw createSmtpError('SMTP server rejected the message body', {
          code: dataResponse.code,
          retryable: String(dataResponse.code).startsWith('4'),
          responseText: dataResponse.lines.join(' | '),
        });
      }

      try {
        await sendCommand('QUIT', [221]);
      } catch {
        // Best-effort session closure after successful delivery.
      }

      return {
        providerMessageId: extractProviderMessageId(dataResponse.message),
      };
    } catch (error) {
      throw normalizeSocketError(error);
    } finally {
      reader?.detach();
      if (socket && !socket.destroyed) {
        socket.end();
      }
    }
  }
}
