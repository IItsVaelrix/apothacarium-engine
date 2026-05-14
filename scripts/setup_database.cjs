const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'scholomance_user.sqlite');

function setup() {
    if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
        console.log(`Existing database at ${DB_PATH} removed.`);
    }

    const db = new Database(DB_PATH, { verbose: console.log });
    console.log(`Database created at ${DB_PATH}`);

    try {
        // User table
        const createUserTable = db.prepare(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                recoveryTokenHash TEXT,
                recoveryTokenExpiry DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        createUserTable.run();

        // Progression table
        const createProgressionTable = db.prepare(`
            CREATE TABLE IF NOT EXISTS user_progression (
                userId INTEGER PRIMARY KEY,
                xp INTEGER NOT NULL DEFAULT 0,
                unlockedSchools TEXT NOT NULL DEFAULT '["SONIC"]', -- Storing as JSON string
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);
        createProgressionTable.run();

        // Scrolls table
        const createScrollsTable = db.prepare(`
            CREATE TABLE IF NOT EXISTS scrolls (
                id TEXT PRIMARY KEY,
                userId INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);
        createScrollsTable.run();

        console.log('Tables created successfully.');

        // For demonstration, add a 'test' user
        const insertUser = db.prepare(`
            INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)
        `);
        const bcrypt = require('bcrypt');
        const SALT_ROUNDS = 12;
        const hashedPassword = bcrypt.hashSync('password', SALT_ROUNDS);
        insertUser.run(1, 'test', 'test@example.com', hashedPassword);
        console.log("Created 'test' user with ID 1.");

    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        db.close();
        console.log('Database connection closed.');
    }
}

if (require.main === module) {
    setup();
}
