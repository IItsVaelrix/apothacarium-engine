import { userPersistence } from "./user.persistence.js";

const DEV_GUEST_USERNAME = "test";
const DEV_GUEST_EMAIL = "test@example.com";
export const LEXICON_GUEST_SESSION_KEY = 'lexiconGuest';
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_TEST_RUNTIME =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    typeof process.env.VITEST_WORKER_ID !== "undefined" ||
    typeof process.env.JEST_WORKER_ID !== "undefined";
const ENABLE_DEV_AUTH =
    !IS_PRODUCTION &&
    !IS_TEST_RUNTIME &&
    process.env.ENABLE_DEV_AUTH !== "false";

async function getOrCreateDevUser() {
    let devUser = await userPersistence.users.findByUsername(DEV_GUEST_USERNAME);
    if (!devUser) {
        try {
            const createdUser = await userPersistence.users.createUser(
                DEV_GUEST_USERNAME,
                DEV_GUEST_EMAIL,
                "development-auth-bypass",
                null,
            );
            await userPersistence.users.verifyUser(createdUser.id);
            devUser = (await userPersistence.users.findById(createdUser.id)) ?? createdUser;
        } catch {
            devUser =
                (await userPersistence.users.findByUsername(DEV_GUEST_USERNAME)) ||
                (await userPersistence.users.findByEmail(DEV_GUEST_EMAIL)) ||
                null;
        }
    }

    if (devUser && !devUser.verified) {
        await userPersistence.users.verifyUser(devUser.id);
        return (await userPersistence.users.findById(devUser.id)) ?? devUser;
    }

    return devUser;
}

export function isDevAuthBypassed() {
    return ENABLE_DEV_AUTH;
}

export async function ensureDevSessionUser(request) {
    if (!ENABLE_DEV_AUTH) {
        return null;
    }

    const session = request.session;
    if (!session) {
        return null;
    }

    if (session.user) {
        return session.user;
    }

    const devUser = await getOrCreateDevUser();
    if (!devUser) {
        return null;
    }

    session.user = {
        id: devUser.id,
        username: devUser.username,
        email: devUser.email,
        guest: true,
        isDevelopmentBypass: true,
    };
    session[LEXICON_GUEST_SESSION_KEY] = false;

    if (typeof session.save === "function") {
        await session.save();
    }

    return session.user;
}

export const requireAuth = async (request, reply) => {
    const session = request.session;
    if (session?.user) {
        return;
    }

    if (ENABLE_DEV_AUTH) {
        const devUser = await ensureDevSessionUser(request);
        if (devUser) {
            return;
        }
    }

    request.server?.opsMetrics?.increment?.('authFailures');
    return reply.status(401).send({ message: 'Unauthorized: Please log in.' });
};

export const requireLexiconSession = async (request, reply) => {
    const session = request.session;
    if (session?.user) {
        return;
    }

    if (ENABLE_DEV_AUTH) {
        const devUser = await ensureDevSessionUser(request);
        if (devUser) {
            return;
        }
    }

    if (session?.[LEXICON_GUEST_SESSION_KEY] === true) {
        return;
    }

    request.server?.opsMetrics?.increment?.('authFailures');
    return reply.status(401).send({ message: 'Unauthorized: Session required.' });
};
