import { z } from 'zod';
// ARCHIVED: INFRA-0G01
import { zodToJsonSchema } from 'zod-to-json-schema';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { userPersistence } from '../user.persistence.js';
import { createMailerService } from '../services/mailer.service.js';
import { captchaService } from '../services/captcha.service.js';
import {
    ensureDevSessionUser,
    isDevAuthBypassed,
    LEXICON_GUEST_SESSION_KEY,
} from '../auth-pre-handler.js';

// Password policy: At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const registerBodySchema = z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    email: z.string().email(),
    password: passwordSchema,
    captchaId: z.string(),
    captchaAnswer: z.string()
});

const loginBodySchema = z.object({
    username: z.string(),
    password: z.string(),
});

const verifyEmailSchema = z.object({
    token: z.string()
});

const resendVerificationBodySchema = z.object({
    email: z.string().email(),
});

const forgotPasswordBodySchema = z.object({
    email: z.string().email(),
});

const resetPasswordBodySchema = z.object({
    token: z.string().min(16),
    password: passwordSchema,
});

const PASSWORD_RESET_TTL_MINUTES = 60;

function toFastifySchema(zodSchema) {
    const schema = zodToJsonSchema(zodSchema, { target: 'draft-7' });
    if (schema && typeof schema === 'object' && '$schema' in schema) {
        delete schema.$schema;
    }
    return schema;
}

function createOpaqueToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function getPasswordResetExpiryIso() {
    return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString();
}

function isPasswordResetTokenExpired(user) {
    const expiryMs = Date.parse(String(user?.recoveryTokenExpiry || ''));
    return !Number.isFinite(expiryMs) || expiryMs <= Date.now();
}

async function authRoutesInternal(fastify, opts) {
    const mailer = opts?.mailer || createMailerService(fastify.log, {
        appBaseUrl: opts?.appBaseUrl,
        appName: opts?.appName,
    });
    const publicAppUrl = String(
        opts?.publicAppUrl ||
        process.env.PUBLIC_APP_URL ||
        process.env.VITE_PUBLIC_APP_URL ||
        (process.env.NODE_ENV === 'production' ? 'http://localhost:3000' : 'http://localhost:5173')
    ).replace(/\/+$/, '');
    const shouldBypassAuth = isDevAuthBypassed();

    async function ensureDevelopmentUser(request) {
        if (!shouldBypassAuth) {
            return request.session?.user ?? null;
        }
        return await ensureDevSessionUser(request);
    }
    
    // CAPTCHA Route
    fastify.get('/captcha', {
        handler: async (request, _reply) => {
            const challenge = captchaService.generateChallenge();
            // Store solution in session using primitives
            request.session.captchaId = challenge.id;
            request.session.captchaSolution = challenge.solution;
            await request.session.save();
            return { id: challenge.id, text: challenge.text };
        }
    });

    // Registration
    fastify.post('/register', {
        config: { rateLimit: { max: 5, timeWindow: '1 hour' } }, // Strict rate limiting for signups
        schema: { body: toFastifySchema(registerBodySchema) },
        handler: async (request, reply) => {
            const { username, email, password, captchaId, captchaAnswer } = request.body;

            // 1. Verify CAPTCHA (Bypass in test)
            const isTest = process.env.NODE_ENV === 'test';
            const sessionCaptchaId = request.session.captchaId;
            const sessionCaptchaSolution = request.session.captchaSolution;
            
            if (!isTest && (!sessionCaptchaId || sessionCaptchaId !== captchaId || !captchaService.validate(captchaAnswer, sessionCaptchaSolution))) {
                return reply.status(400).send({ message: 'Invalid CAPTCHA' });
            }
            // Clear CAPTCHA after use
            request.session.captchaId = null;
            request.session.captchaSolution = null;
            await request.session.save();

            // 2. Check existing user
            const existingUser = await userPersistence.users.findByUsername(username);
            if (existingUser) return reply.status(409).send({ message: 'Username already taken' });
            const existingEmail = await userPersistence.users.findByEmail(email);
            if (existingEmail) return reply.status(409).send({ message: 'Email already registered' });

            // 3. Create User with Verification Token
            const hashedPassword = await bcrypt.hash(password, 12);
            const verificationToken = createOpaqueToken();
            
            await userPersistence.users.createUser(username, email, hashedPassword, verificationToken);

            // 4. Send Verification Email
            mailer.queueTemplate('verify-email', {
                to: email,
                data: {
                    username,
                    token: verificationToken,
                },
                metadata: {
                    reason: 'registration_verification',
                    username,
                },
            });

            return reply.status(201).send({ message: 'Registration successful. Please check your email to verify your account.' });
        }
    });

    // Login
    fastify.post('/login', {
        config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
        schema: { body: toFastifySchema(loginBodySchema) },
        handler: async (request, reply) => {
            if (shouldBypassAuth) {
                const devUser = await ensureDevelopmentUser(request);
                return reply.status(200).send({
                    message: 'Development auth bypass active.',
                    user: devUser,
                });
            }

            const { username, password } = request.body;
            const user = await userPersistence.users.findByUsername(username);
            
            if (!user) {
                return reply.status(401).send({ message: 'Invalid credentials' });
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                return reply.status(401).send({ message: 'Invalid credentials' });
            }

            const isTest = process.env.NODE_ENV === 'test';
            if (!isTest && !user.verified) {
                 return reply.status(403).send({ message: 'Email not verified' });
            }

            request.session.user = { id: user.id, username: user.username, email: user.email };
            request.session[LEXICON_GUEST_SESSION_KEY] = false;
            return reply.status(200).send({ message: 'Logged in successfully' });
        },
    });

    // Verify Email
    fastify.get('/verify-email', {
        schema: { querystring: toFastifySchema(verifyEmailSchema) },
        handler: async (request, reply) => {
            const { token } = request.query;
            const user = await userPersistence.users.findByVerificationToken(token);
            
            if (!user) {
                return reply.status(400).send({ message: 'Invalid or expired verification token' });
            }

            await userPersistence.users.verifyUser(user.id);
            
            // Redirect to frontend login page
            return reply.redirect(`${publicAppUrl}/auth?verified=true`);
        }
    });

    fastify.post('/resend-verification', {
        config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
        schema: { body: toFastifySchema(resendVerificationBodySchema) },
        handler: async (request, reply) => {
            const { email } = request.body;
            const user = await userPersistence.users.findByEmail(email);

            if (user && !user.verified) {
                const verificationToken = createOpaqueToken();
                await userPersistence.users.setVerificationToken(user.id, verificationToken);
                mailer.queueTemplate('verify-email', {
                    to: user.email,
                    data: {
                        username: user.username,
                        token: verificationToken,
                    },
                    metadata: {
                        reason: 'resend_verification',
                        userId: user.id,
                    },
                });
            }

            return reply.status(200).send({
                message: 'If an unverified account exists for that email, a new verification message has been queued.',
            });
        },
    });

    fastify.post('/forgot-password', {
        config: { rateLimit: { max: 5, timeWindow: '30 minutes' } },
        schema: { body: toFastifySchema(forgotPasswordBodySchema) },
        handler: async (request, reply) => {
            const { email } = request.body;
            const user = await userPersistence.users.findByEmail(email);

            if (user?.verified) {
                const resetToken = createOpaqueToken();
                const resetTokenHash = hashToken(resetToken);
                const recoveryTokenExpiry = getPasswordResetExpiryIso();
                await userPersistence.users.setRecoveryToken(user.id, resetTokenHash, recoveryTokenExpiry);
                mailer.queueTemplate('password-reset', {
                    to: user.email,
                    data: {
                        username: user.username,
                        token: resetToken,
                        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
                    },
                    metadata: {
                        reason: 'forgot_password',
                        userId: user.id,
                    },
                });
            }

            return reply.status(200).send({
                message: 'If that email belongs to a verified account, a password reset message has been queued.',
            });
        },
    });

    fastify.get('/reset-password', {
        schema: { querystring: toFastifySchema(verifyEmailSchema) },
        handler: async (request, reply) => {
            const { token } = request.query;
            return reply.redirect(`${publicAppUrl}/auth?resetToken=${encodeURIComponent(token)}`);
        },
    });

    fastify.post('/reset-password', {
        config: { rateLimit: { max: 10, timeWindow: '30 minutes' } },
        schema: { body: toFastifySchema(resetPasswordBodySchema) },
        handler: async (request, reply) => {
            const { token, password } = request.body;
            const recoveryTokenHash = hashToken(token);
            const user = await userPersistence.users.findByRecoveryTokenHash(recoveryTokenHash);

            if (!user || isPasswordResetTokenExpired(user)) {
                return reply.status(400).send({ message: 'Invalid or expired reset token' });
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            await userPersistence.users.updatePasswordHash(user.id, hashedPassword);
            return reply.status(200).send({ message: 'Password reset successful. You can now log in.' });
        },
    });

    // Logout
    fastify.post('/logout', {
        handler: async (request, reply) => {
            if (shouldBypassAuth) {
                const devUser = await ensureDevelopmentUser(request);
                return reply.status(200).send({
                    message: 'Development auth bypass active; logout skipped.',
                    user: devUser,
                });
            }

            await request.session.destroy();
            reply.clearCookie('scholomance.sid', { path: '/' });
            return reply.status(200).send({ message: 'Logged out successfully' });
        }
    });

    // Me
    fastify.get('/me', async (request, reply) => {
        if (!request.session.user && shouldBypassAuth) {
            await ensureDevelopmentUser(request);
        }

        if (!request.session.user) {
            reply.status(401).send({ message: 'Not authenticated' });
            return;
        }
        
        // Refresh from DB to get latest status (e.g. if roles changed)
        const user = await userPersistence.users.findById(request.session.user.id);
        if (!user) {
             await request.session.destroy();
             return reply.status(401).send({ message: 'User not found' });
        }

        // Don't send sensitive data
        return { user: { id: user.id, username: user.username, email: user.email } };
    });
    
    // CSRF Token
    // SECURITY: Rate limit to prevent session flooding attacks
    fastify.get('/csrf-token', {
        config: { rateLimit: { max: 15, timeWindow: '1 minute' } }
    }, async (request, reply) => {
        const start = Date.now();
        try {
            if (!request.session) {
                request.log.error({
                    headers: request.headers,
                    url: request.url,
                    method: request.method,
                    cookie: request.headers.cookie,
                    plugins: Object.keys(fastify.initialConfig || {})
                }, '[CSRF] Session not found on request object');
                return reply.status(500).send({ message: 'Session initialization failed' });
            }

            if (shouldBypassAuth) {
                await ensureDevelopmentUser(request);
            } else if (!request.session.user) {
                request.session[LEXICON_GUEST_SESSION_KEY] = true;
            } else {
                request.session[LEXICON_GUEST_SESSION_KEY] = false;
            }
            
            const sessionInitMs = Date.now() - start;
            
            const token = await reply.generateCsrf();
            const csrfGenMs = Date.now() - (start + sessionInitMs);
            
            await request.session.save();
            const sessionSaveMs = Date.now() - (start + sessionInitMs + csrfGenMs);
            
            const totalMs = Date.now() - start;
            if (totalMs > 500) {
                request.log.warn({
                    totalMs,
                    sessionInitMs,
                    csrfGenMs,
                    sessionSaveMs,
                    store: fastify.config?.session?.store?.constructor?.name || 'default'
                }, '[CSRF] Slow token generation detected');
            }

            return { token };
        } catch (error) {
            request.log.error({ err: error, durationMs: Date.now() - start }, '[CSRF] Failed to generate token');
            return reply.status(500).send({ 
                message: 'Internal server error during security token generation',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });
}
export const authRoutes = authRoutesInternal;
