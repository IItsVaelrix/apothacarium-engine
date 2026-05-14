import { BytecodeError, parseErrorForAI, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES } from '../codex/core/pixelbrain/bytecode-error.js';

function reproduce() {
    console.log('--- REPRODUCTION: parseErrorForAI Contract Check ---');
    
    const error = new BytecodeError(
        ERROR_CATEGORIES.UI_STASIS,
        ERROR_SEVERITY.CRIT,
        MODULE_IDS.UI_STASIS,
        ERROR_CODES.CLICK_HANDLER_STALL,
        { elementId: 'test-btn' }
    );

    console.log('1. Created BytecodeError instance.');
    console.log('   Instance bytecode:', error.bytecode);
    
    const errorData = parseErrorForAI(error);
    console.log('2. Parsed via parseErrorForAI.');
    console.log('   Parsed bytecode:', errorData.bytecode);
    
    if (errorData.bytecode) {
        console.log('✅ SUCCESS: Bytecode is present in parsed data.');
    } else {
        console.log('❌ FAILURE: Bytecode is MISSING in parsed data.');
    }

    console.log('\n--- Checking Bytecode String Parsing ---');
    const bytecodeStr = error.bytecode;
    const parsedFromStr = parseErrorForAI(bytecodeStr);
    console.log('3. Parsed from bytecode string.');
    console.log('   Parsed from str bytecode:', parsedFromStr.bytecode);

    if (parsedFromStr.bytecode) {
        console.log('✅ SUCCESS: Bytecode is present when parsing from string.');
    } else {
        // decodeBytecodeError doesn't return bytecode property, it returns decoded fields
        console.log('ℹ️  INFO: decodeBytecodeError does not return .bytecode by design (it is the input).');
    }
}

reproduce();
