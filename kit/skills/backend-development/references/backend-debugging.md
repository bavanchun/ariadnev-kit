# Backend Debugging Strategies

Comprehensive debugging techniques, tools, and best practices for backend systems (2025).

## Debugging Mindset

### The Scientific Method for Debugging

1. **Observe** - Gather symptoms and data
2. **Hypothesize** - Form theories about the cause
3. **Test** - Verify or disprove theories
4. **Iterate** - Refine understanding
5. **Fix** - Apply solution
6. **Verify** - Confirm fix works

### Golden Rules

1. **Reproduce first** - Debugging without reproduction is guessing
2. **Simplify the problem** - Isolate variables
3. **Read the logs** - Error messages contain clues
4. **Check assumptions** - "It should work" isn't debugging
5. **Use scientific method** - Avoid random changes
6. **Document findings** - Future you will thank you

## Logging Best Practices

### Structured Logging

**Node.js (Pino - Fastest)**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Structured logging with context
logger.info({ userId: '123', action: 'login' }, 'User logged in');

// Error logging with stack trace
try {
  await riskyOperation();
} catch (error) {
  logger.error({ err: error, userId: '123' }, 'Operation failed');
}
```

**Python (Structlog)**
```python
import structlog

logger = structlog.get_logger()

# Structured context
logger.info("user_login", user_id="123", ip="192.168.1.1")

# Error with exception
try:
    risky_operation()
except Exception as e:
    logger.error("operation_failed", user_id="123", exc_info=True)
```

**Go (Zap - High Performance)**
```go
import "go.uber.org/zap"

logger, _ := zap.NewProduction()
defer logger.Sync()

// Structured fields
logger.Info("user logged in",
    zap.String("user_id", "123"),
    zap.String("ip", "192.168.1.1"),
)

// Error logging
if err := riskyOperation(); err != nil {
    logger.Error("operation failed",
        zap.Error(err),
        zap.String("user_id", "123"),
    )
}
```

### Log Levels

| Level | Purpose | Example |
|-------|---------|---------|
| **TRACE** | Very detailed, dev only | Request/response bodies |
| **DEBUG** | Detailed info for debugging | SQL queries, cache hits |
| **INFO** | General informational | User login, API calls |
| **WARN** | Potential issues | Deprecated API usage |
| **ERROR** | Error conditions | Failed API calls, exceptions |
| **FATAL** | Critical failures | Database connection lost |

### What to Log

**✅ DO LOG:**
- Request/response metadata (not bodies in prod)
- Error messages with context
- Performance metrics (duration, size)
- Security events (login, permission changes)
- Business events (orders, payments)

**❌ DON'T LOG:**
- Passwords or secrets
- Credit card numbers
- Personal identifiable information (PII)
- Session tokens
- Full request bodies in production

## Debugging Tools by Language

### Node.js / TypeScript

**1. Chrome DevTools (Built-in)**
```bash
# Run with inspect flag
node --inspect-brk app.js

# Open chrome://inspect in Chrome
# Set breakpoints, step through code
```

**2. VS Code Debugger**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

**3. Debug Module**
```typescript
import debug from 'debug';

const log = debug('app:server');
const error = debug('app:error');

log('Starting server on port %d', 3000);
error('Failed to connect to database');

// Run with: DEBUG=app:* node app.js
```

### Python

**1. PDB (Built-in Debugger)**
```python
import pdb

def problematic_function(data):
    # Set breakpoint
    pdb.set_trace()

    # Debugger commands:
    # l - list code
    # n - next line
    # s - step into
    # c - continue
    # p variable - print variable
    # q - quit
    result = process(data)
    return result
```

**2. IPython Debugger (Better)**
```python
from IPython import embed

def problematic_function(data):
    # Drop into IPython shell
    embed()

    result = process(data)
    return result
```

**3. VS Code Debugger**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload"],
      "jinja": true
    }
  ]
}
```

### Go

**1. Delve (Standard Debugger)**
```bash
# Install
go install github.com/go-delve/delve/cmd/dlv@latest

# Debug
dlv debug main.go

# Commands:
# b main.main - set breakpoint
# c - continue
# n - next line
# s - step into
# p variable - print variable
# q - quit
```

**2. VS Code Debugger**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Package",
      "type": "go",
      "request": "launch",
      "mode": "debug",
      "program": "${workspaceFolder}"
    }
  ]
}
```

### Rust

**1. LLDB/GDB (Native Debuggers)**
```bash
# Build with debug info
cargo build

# Debug with LLDB
rust-lldb ./target/debug/myapp

# Debug with GDB
rust-gdb ./target/debug/myapp
```

**2. VS Code Debugger (CodeLLDB)**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug",
      "program": "${workspaceFolder}/target/debug/myapp",
      "args": [],
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

## Database Debugging

### SQL Query Debugging (PostgreSQL)

**1. EXPLAIN ANALYZE**
```sql
-- Show query execution plan and actual timings
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 10;

-- Look for:
-- - Seq Scan on large tables (missing indexes)
-- - High execution time
-- - Large row estimates
```

**2. Enable Slow Query Logging**
```sql
-- PostgreSQL configuration
ALTER DATABASE mydb SET log_min_duration_statement = 1000; -- Log queries >1s

-- Check slow queries
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**3. Active Query Monitoring**
```sql
-- See currently running queries
SELECT pid, now() - query_start as duration, query, state
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Kill a long-running query
SELECT pg_terminate_backend(pid);
```

### MongoDB Debugging

**1. Explain Query Performance**
```javascript
db.users.find({ email: 'test@example.com' }).explain('executionStats')

// Look for:
// - totalDocsExamined vs nReturned (should be close)
// - COLLSCAN (collection scan - needs index)
// - executionTimeMillis (should be low)
```

**2. Profile Slow Queries**
```javascript
// Enable profiling for queries >100ms
db.setProfilingLevel(1, { slowms: 100 })

// View slow queries
db.system.profile.find().limit(5).sort({ ts: -1 }).pretty()

// Disable profiling
db.setProfilingLevel(0)
```

### Redis Debugging

**1. Monitor Commands**
```bash
# See all commands in real-time
redis-cli MONITOR

# Check slow log
redis-cli SLOWLOG GET 10

# Set slow log threshold (microseconds)
redis-cli CONFIG SET slowlog-log-slower-than 10000
```

**2. Memory Analysis**
```bash
# Memory usage by key pattern
redis-cli --bigkeys

# Memory usage details
redis-cli INFO memory

# Analyze specific key
redis-cli MEMORY USAGE mykey
```

## API Debugging

### HTTP Request Debugging

**1. cURL Testing**
```bash
# Verbose output with headers
curl -v https://api.example.com/users

# Include response headers
curl -i https://api.example.com/users

# POST with JSON
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}' \
  -v

# Save response to file
curl https://api.example.com/users -o response.json
```

**2. HTTPie (User-Friendly)**
```bash
# Install
pip install httpie

# Simple GET
http GET https://api.example.com/users

# POST with JSON
http POST https://api.example.com/users name=John email=john@example.com

# Custom headers
http GET https://api.example.com/users Authorization:"Bearer token123"
```

**3. Request Logging Middleware**

**Express/Node.js:**
```typescript
import morgan from 'morgan';

// Development
app.use(morgan('dev'));

// Production (JSON format)
app.use(morgan('combined'));

// Custom format
app.use(morgan(':method :url :status :response-time ms - :res[content-length]'));
```

**FastAPI/Python:**
```python
from fastapi import Request
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    logger.info(
        "request_processed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration * 1000
    )
    return response
```
