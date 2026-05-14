const DEFAULT_APP_NAME = 'Scholomance';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeBaseUrl(baseUrl) {
  const fallback = 'http://localhost:8080';
  const resolved = String(baseUrl || '').trim() || fallback;
  return resolved.replace(/\/+$/, '');
}

function buildUrl(baseUrl, pathname, params = {}) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function renderFrame({ preheader, title, intro, actionLabel, actionUrl, detailLines = [], appName = DEFAULT_APP_NAME }) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeAppName = escapeHtml(appName);
  const renderedDetails = detailLines
    .map((line) => `<li style="margin:0 0 8px;">${escapeHtml(line)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#080b16;color:#e9edf8;font-family:Georgia,serif;">
    <div style="max-width:640px;margin:0 auto;border:1px solid rgba(197,160,89,0.28);background:#101526;">
      <div style="padding:12px 18px;border-bottom:1px solid rgba(126,231,255,0.14);font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#87f0ff;">
        ${escapeHtml(preheader)}
      </div>
      <div style="padding:28px 22px 32px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c5a059;margin-bottom:14px;">
          ${safeAppName} Mail Service
        </div>
        <h1 style="margin:0 0 14px;font-size:30px;line-height:1.2;color:#f5f0e4;">${safeTitle}</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#d8e1f4;">${safeIntro}</p>
        <p style="margin:0 0 24px;">
          <a href="${safeActionUrl}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(126,231,255,0.32);background:#151d34;color:#f4fbff;text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">
            ${safeActionLabel}
          </a>
        </p>
        ${renderedDetails ? `<ul style="margin:0 0 22px 18px;padding:0;color:#d8e1f4;line-height:1.7;">${renderedDetails}</ul>` : ''}
        <p style="margin:0;font-size:13px;line-height:1.7;color:#8fa0c1;">
          If the button fails, copy this URL into your browser:<br />
          <span style="word-break:break-all;color:#bfeaff;">${safeActionUrl}</span>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export function renderEmailTemplate(templateKey, data = {}) {
  const appName = String(data.appName || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;
  const username = String(data.username || 'scribe').trim() || 'scribe';
  const baseUrl = normalizeBaseUrl(data.baseUrl);

  switch (templateKey) {
    case 'verify-email': {
      const actionUrl = buildUrl(baseUrl, '/auth/verify-email', { token: data.token });
      return {
        templateKey,
        subject: `${appName}: verify your account`,
        text: [
          `Welcome to ${appName}, ${username}.`,
          '',
          'Verify your email to activate your account:',
          actionUrl,
          '',
          'If you did not create this account, you can ignore this message.',
        ].join('\n'),
        html: renderFrame({
          preheader: 'verification transmission',
          title: 'Verify your account',
          intro: `Welcome to ${appName}, ${username}. Confirm this email address to activate your account.`,
          actionLabel: 'Verify Email',
          actionUrl,
          detailLines: [
            'This verification link activates your account.',
            'If you did not create this account, no further action is required.',
          ],
          appName,
        }),
      };
    }
    case 'password-reset': {
      const actionUrl = buildUrl(baseUrl, '/auth/reset-password', { token: data.token });
      const expiresInMinutes = Number(data.expiresInMinutes) || 60;
      return {
        templateKey,
        subject: `${appName}: reset your password`,
        text: [
          `${username}, a password reset was requested for your ${appName} account.`,
          '',
          'Use this link to set a new password:',
          actionUrl,
          '',
          `This link expires in ${expiresInMinutes} minutes.`,
          'If you did not request this reset, ignore this message.',
        ].join('\n'),
        html: renderFrame({
          preheader: 'recovery transmission',
          title: 'Reset your password',
          intro: `${username}, a password reset was requested for your ${appName} account.`,
          actionLabel: 'Reset Password',
          actionUrl,
          detailLines: [
            `This reset link expires in ${expiresInMinutes} minutes.`,
            'If you did not request this reset, ignore this message and your password will remain unchanged.',
          ],
          appName,
        }),
      };
    }
    default:
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.WARN, MOD,
        ERROR_CODES.INVALID_ENUM,
        { parameter: 'templateKey', value: templateKey },
      );
  }
}
