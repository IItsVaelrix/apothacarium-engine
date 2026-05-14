import { createClient } from 'redis';
import 'dotenv/config';

async function verifyUpstash() {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
        console.error('❌ Error: REDIS_URL environment variable is not set.');
        process.exit(1);
    }

    console.log(`Attempting to connect to: ${redisUrl.split('@')[1] || 'localhost'}`);
    
    const client = createClient({
        url: redisUrl,
        socket: {
            connectTimeout: 10000
        }
    });

    client.on('error', (err) => console.error('❌ Redis Client Error:', err));

    try {
        await client.connect();
        console.log('✅ Successfully connected to Redis.');

        // Performance test: SET
        const startSet = Date.now();
        await client.set('upstash_test_key', 'scholomance_test_value_' + Date.now());
        const endSet = Date.now();
        console.log(`⏱️  SET operation took ${endSet - startSet}ms`);

        // Performance test: GET
        const startGet = Date.now();
        const val = await client.get('upstash_test_key');
        const endGet = Date.now();
        console.log(`⏱️  GET operation took ${endGet - startGet}ms`);
        console.log(`📝 Retrieved value: ${val}`);

        // Cleanup
        await client.del('upstash_test_key');
        console.log('🧹 Cleaned up test key.');

        await client.disconnect();
        console.log('🏁 Verification complete.');
    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    }
}

verifyUpstash();
