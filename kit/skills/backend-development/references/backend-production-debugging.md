
## Performance Debugging

### CPU Profiling

**Node.js (0x)**
```bash
# Install
npm install -g 0x

# Profile application
0x node app.js

# Open flamegraph in browser
# Identify hot spots (red areas)
```

**Node.js (Clinic.js)**
```bash
# Install
npm install -g clinic

# CPU profiling
clinic doctor -- node app.js

# Heap profiling
clinic heapprofiler -- node app.js

# Event loop analysis
clinic bubbleprof -- node app.js
```

**Python (cProfile)**
```python
import cProfile
import pstats

# Profile function
profiler = cProfile.Profile()
profiler.enable()

# Your code
result = expensive_operation()

profiler.disable()
stats = pstats.Stats(profiler)
stats.sort_stats('cumulative')
stats.print_stats(10)  # Top 10 functions
```

**Go (pprof)**
```go
import (
    "net/http"
    _ "net/http/pprof"
)

func main() {
    // Enable profiling endpoint
    go func() {
        http.ListenAndServe("localhost:6060", nil)
    }()

    // Your application
    startServer()
}

// Profile CPU
// go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

// Profile heap
// go tool pprof http://localhost:6060/debug/pprof/heap
```

### Memory Debugging

**Node.js (Heap Snapshots)**
```typescript
// Take heap snapshot programmatically
import { writeHeapSnapshot } from 'v8';

app.get('/debug/heap', (req, res) => {
    const filename = writeHeapSnapshot();
    res.send(`Heap snapshot written to ${filename}`);
});

// Analyze in Chrome DevTools
// 1. Load heap snapshot
// 2. Compare snapshots to find memory leaks
// 3. Look for detached DOM nodes, large arrays
```

**Python (Memory Profiler)**
```python
from memory_profiler import profile

@profile
def memory_intensive_function():
    large_list = [i for i in range(1000000)]
    return sum(large_list)

# Run with: python -m memory_profiler script.py
# Shows line-by-line memory usage
```

## Production Debugging

### Application Performance Monitoring (APM)

**New Relic**
```typescript
// newrelic.js
export const config = {
  app_name: ['My Backend API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: { level: 'info' },
  distributed_tracing: { enabled: true },
};

// Import at app entry
import 'newrelic';
```

**DataDog**
```typescript
import tracer from 'dd-trace';

tracer.init({
  service: 'backend-api',
  env: process.env.NODE_ENV,
  version: '1.0.0',
  logInjection: true
});
```

**Sentry (Error Tracking)**
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Capture errors
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    user: { id: userId },
    tags: { operation: 'payment' },
  });
}
```

### Distributed Tracing

**OpenTelemetry (Vendor-Agnostic)**
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://localhost:14268/api/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Traces HTTP, database, Redis automatically
```

### Log Aggregation

**ELK Stack (Elasticsearch, Logstash, Kibana)**
```yaml
# docker-compose.yml
version: '3'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
    ports:
      - 9200:9200

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - 5601:5601
```

**Loki + Grafana (Lightweight)**
```yaml
# promtail config for log shipping
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: backend-api
          __path__: /var/log/app/*.log
```

## Common Debugging Scenarios

### 1. High CPU Usage

**Steps:**
1. Profile CPU (flamegraph)
2. Identify hot functions
3. Check for:
   - Infinite loops
   - Heavy regex operations
   - Inefficient algorithms (O(n²))
   - Blocking operations in event loop (Node.js)

**Node.js Example:**
```typescript
// ❌ Bad: Blocking event loop
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2); // Exponential time
}

// ✅ Good: Memoized or iterative
const memo = new Map();
function fibonacciMemo(n) {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n);
  const result = fibonacciMemo(n - 1) + fibonacciMemo(n - 2);
  memo.set(n, result);
  return result;
}
```

### 2. Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Eventually crashes (OOM)
- Performance degradation

**Common Causes:**
```typescript
// ❌ Memory leak: Event listeners not removed
class DataService {
  constructor(eventBus) {
    eventBus.on('data', (data) => this.processData(data));
    // Listener never removed, holds reference to DataService
  }
}

// ✅ Fix: Remove listeners
class DataService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.handler = (data) => this.processData(data);
    eventBus.on('data', this.handler);
  }

  destroy() {
    this.eventBus.off('data', this.handler);
  }
}

// ❌ Memory leak: Global cache without limits
const cache = new Map();
function getCachedData(key) {
  if (!cache.has(key)) {
    cache.set(key, expensiveOperation(key)); // Grows forever
  }
  return cache.get(key);
}

// ✅ Fix: LRU cache with size limit
import LRU from 'lru-cache';
const cache = new LRU({ max: 1000, ttl: 1000 * 60 * 60 });
```

**Detection:**
```bash
# Node.js: Check heap size over time
node --expose-gc --max-old-space-size=4096 app.js

# Take periodic heap snapshots
# Compare snapshots in Chrome DevTools
```

### 3. Slow Database Queries

**Steps:**
1. Enable slow query log
2. Analyze with EXPLAIN
3. Add indexes
4. Optimize query

**PostgreSQL Example:**
```sql
-- Before: Slow full table scan
SELECT * FROM orders
WHERE user_id = 123
ORDER BY created_at DESC
LIMIT 10;

-- EXPLAIN shows: Seq Scan on orders

-- Fix: Add index
CREATE INDEX idx_orders_user_id_created_at
ON orders(user_id, created_at DESC);

-- After: Index Scan using idx_orders_user_id_created_at
-- 100x faster
```

### 4. Connection Pool Exhaustion

**Symptoms:**
- "Connection pool exhausted" errors
- Requests hang indefinitely
- Database connections at max

**Causes & Fixes:**
```typescript
// ❌ Bad: Connection leak
async function getUser(id) {
  const client = await pool.connect();
  const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
  // Connection never released!
}

// ✅ Good: Always release
async function getUser(id) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  } finally {
    client.release(); // Always release
  }
}

// ✅ Better: Use pool directly
async function getUser(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
  // Automatically releases
}
```

### 5. Race Conditions

**Example:**
```typescript
// ❌ Bad: Race condition
let counter = 0;

async function incrementCounter() {
  const current = counter; // Thread 1 reads 0
  await doSomethingAsync(); // Thread 2 reads 0
  counter = current + 1; // Thread 1 writes 1, Thread 2 writes 1
  // Expected: 2, Actual: 1
}

// ✅ Fix: Atomic operations (Redis)
async function incrementCounter() {
  return await redis.incr('counter');
  // Atomic, thread-safe
}

// ✅ Fix: Database transactions
async function incrementCounter(userId) {
  await db.transaction(async (trx) => {
    const user = await trx('users')
      .where({ id: userId })
      .forUpdate() // Row-level lock
      .first();

    await trx('users')
      .where({ id: userId })
      .update({ counter: user.counter + 1 });
  });
}
```

## Debugging Checklist

**Before Diving Into Code:**
- [ ] Read error message completely
- [ ] Check logs for context
- [ ] Reproduce the issue reliably
- [ ] Isolate the problem (binary search)
- [ ] Verify assumptions

**Investigation:**
- [ ] Enable debug logging
- [ ] Add strategic log points
- [ ] Use debugger breakpoints
- [ ] Profile performance if slow
- [ ] Check database queries
- [ ] Monitor system resources

**Production Issues:**
- [ ] Check APM dashboards
- [ ] Review distributed traces
- [ ] Analyze error rates
- [ ] Compare with previous baseline
- [ ] Check for recent deployments
- [ ] Review infrastructure changes

**After Fix:**
- [ ] Verify fix in development
- [ ] Add regression test
- [ ] Document the issue
- [ ] Deploy with monitoring
- [ ] Confirm fix in production

## Debugging Resources

**Tools:**
- Node.js: https://nodejs.org/en/docs/guides/debugging-getting-started/
- Chrome DevTools: https://developer.chrome.com/docs/devtools/
- Clinic.js: https://clinicjs.org/
- Sentry: https://docs.sentry.io/
- DataDog: https://docs.datadoghq.com/
- New Relic: https://docs.newrelic.com/

**Best Practices:**
- 12 Factor App Logs: https://12factor.net/logs
- Google SRE Book: https://sre.google/sre-book/table-of-contents/
- OpenTelemetry: https://opentelemetry.io/docs/

**Database:**
- PostgreSQL EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- MongoDB Performance: https://www.mongodb.com/docs/manual/administration/analyzing-mongodb-performance/
