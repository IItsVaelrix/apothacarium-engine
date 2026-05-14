import { z } from 'zod';

console.log('Testing Zod v4 compatibility...');

try {
    const schema = z.object({
        result: z.any().default({}),
    });
    
    console.log('Schema created.');
    
    const data = { result: { foo: 'bar' } };
    const parsed = schema.safeParse(data);
    
    console.log('Parse result:', parsed.success);
    if (!parsed.success) {
        console.log('Errors:', parsed.error.issues);
    }
    
    // Check for _zod property (what MCP SDK looks for)
    console.log('Schema._zod:', schema._zod);
    console.log('Schema._def:', schema._def);
    
} catch (error) {
    console.error('Caught error:', error);
}
