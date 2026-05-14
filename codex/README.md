# CODEx - The Brain of Scholomance

This directory contains the JavaScript implementation of CODEx, the central logic and backend service for the Scholomance project.

## Architecture

This project follows the layered architecture defined in the `AI_ARCHITECTURE_V2.md` document:

-   **/core**: `Codex Core (Domain)` - Contains the pure logic, schemas, and algorithms for scoring, analysis, and combat.
-   **/services**: `Codex Services (Adapters)` - Implements adapters to external data sources like dictionaries and databases.
-   **/runtime**: `Codex Runtime (Orchestrator)` - Manages execution pipelines, caching, and event emission.
-   **/server**: `Codex Server (Authority)` - The web server (API) layer that handles requests, auth, and is the ultimate source of truth.
-   **/tests**: Contains all JavaScript tests for the CODEx module.

---

## Word Lookup Pipeline

The word lookup pipeline provides dictionary lookups through a layered adapter system.

### Event Flow

```
UI emits 'ui:word_lookup_requested'
  → Runtime checks cache
  → Runtime calls DictionaryAdapter chain (fallback)
  → Adapter normalizes response to LexicalEntry schema
  → Runtime caches result (5min TTL)
  → Runtime emits 'runtime:word_lookup_result'
  → UI hook receives data
```

### Usage (React)

```jsx
import { useWordLookup } from '../hooks/useWordLookup.jsx';

function MyComponent() {
  const { lookup, data, isLoading, error } = useWordLookup();

  const handleClick = async () => {
    const result = await lookup('hello');
    console.log(result); // LexicalEntry
  };

  return (
    <div>
      {isLoading && <span>Loading...</span>}
      {error && <span>Error: {error}</span>}
      {data && <span>Definition: {data.definition?.text}</span>}
    </div>
  );
}
```

### Usage (Direct Event Bus)

```javascript
import { emit, on } from './runtime/eventBus.js';
import { EVENTS } from './runtime/wordLookupPipeline.js';

// Listen for results
on(EVENTS.RESPONSE, (payload) => {
  console.log(payload.data); // LexicalEntry
  console.log(payload.source); // 'cache' or adapter name
});

// Request lookup
emit(EVENTS.REQUEST, {
  word: 'hello',
  requestId: 'my-request-1',
  responseEvent: EVENTS.RESPONSE,
});
```

### Adapter Chain (Fallback Order)

1. **LocalDictionaryAdapter** - Uses ScholomanceDictionaryAPI (local SQLite)
2. **DatamuseAdapter** - Free external API (no auth required)

If the local dictionary is not configured (VITE_SCHOLOMANCE_DICT_API_URL not set), only Datamuse is used.

### LexicalEntry Schema

```typescript
interface LexicalEntry {
  word: string;              // The word (uppercase)
  definition: Definition | null;
  definitions: string[];     // All definition texts
  pos: string[];             // Parts of speech
  synonyms: string[];
  antonyms: string[];
  rhymes: string[];
  etymology?: string;
  pronunciation?: string;
  lore?: object;             // MUD-specific data
  raw?: object;              // Original API response
}

interface Definition {
  text: string;
  partOfSpeech: string;
  source: string;            // 'Scholomance', 'Datamuse', etc.
}
```

### Configuration

Set `VITE_USE_CODEX_PIPELINE` to control pipeline enablement.  
Truthy: `true`, `1`, `on`, `yes`  
Falsy: `false`, `0`, `off`, `no`

Set a falsy value (for example `VITE_USE_CODEX_PIPELINE=false`) to disable CODEx pipeline initialization.

### Testing

```bash
npm run test -- tests/lib/adapters/
npm run test -- tests/runtime/wordLookupPipeline.test.js
```
