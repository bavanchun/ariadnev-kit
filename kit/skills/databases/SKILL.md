---
name: av:databases
description: Design schemas and write queries for MongoDB and PostgreSQL. Use for data modeling, SQL and aggregation pipelines, indexes, migrations, and slow-query work — not for provisioning or hosting.
user-invocable: true
when_to_use: "Invoke when schema, query, migration, or index work is central."
category: database
keywords: [mongodb, postgresql, sql, schemas, queries]
license: MIT
argument-hint: "[query or schema task]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Databases Skill

Unified guide for working with MongoDB (document-oriented) and PostgreSQL (relational) databases. Choose the right database for your use case and master both systems.

## When to Use This Skill

Use when:
- Designing database schemas and data models
- Writing queries (SQL or MongoDB query language)
- Building aggregation pipelines or complex joins
- Optimizing indexes and query performance
- Implementing database migrations
- Analyzing slow queries and performance issues
- Deciding a replication, sharding, or backup *strategy* — which data is
  partitioned on what key, what must survive a restore

Not this skill: standing an instance up, operating it, or wiring it into an
environment — provisioning, managed-service setup, connection routing, backup
schedules, and user/permission administration belong to `av:devops`.

## Reference Navigation

### Database Design
- **[db-design.md](references/db-design.md)** - Activate when user requests: Database/table design for transactional (OLTP), analytics (OLAP), create or extend schema, design fact/dimension tables, analyze/review CSV/JSON/SQL files to create tables, or need advice on data storage structure.

### MongoDB References
- **[mongodb-crud.md](references/mongodb-crud.md)** - CRUD operations, query operators, atomic updates
- **[mongodb-aggregation.md](references/mongodb-aggregation.md)** - Aggregation pipeline, stages, operators, patterns
- **[mongodb-indexing.md](references/mongodb-indexing.md)** - Index types, compound indexes, performance optimization
- **[mongodb-atlas.md](references/mongodb-atlas.md)** - Atlas cloud setup, clusters, monitoring, search

### PostgreSQL References
- **[postgresql-queries.md](references/postgresql-queries.md)** - SELECT, JOINs, subqueries, CTEs, window functions
- **[postgresql-psql-cli.md](references/postgresql-psql-cli.md)** - psql commands, meta-commands, scripting
- **[postgresql-performance.md](references/postgresql-performance.md)** - EXPLAIN, query optimization, vacuum, indexes
- **[postgresql-administration.md](references/postgresql-administration.md)** - User management, backups, replication, maintenance

## Python Utilities

Database utility scripts in `scripts/`:
- **db_migrate.py** - Generate and apply migrations for both databases (MongoDB and PostgreSQL)
- **db_backup.py** - Backup and restore MongoDB and PostgreSQL
- **db_performance_check.py** - Analyze slow queries and recommend indexes

All three take `--db {mongodb,postgres}`, and the first two put the verb in a
positional subcommand rather than a flag.

```bash
# Generate migration — "generate" is a subcommand; there is no --generate flag.
# generate is the only db_migrate.py subcommand that runs without --uri.
python scripts/db_migrate.py --db mongodb generate "add_user_index"
python scripts/db_migrate.py --db mongodb --uri "$MONGO_URI" status
python scripts/db_migrate.py --db postgres --uri "$PG_URI" apply

# Back up — --backup-dir precedes the subcommand; --uri is required on
# backup/restore but not list/cleanup; --database is mandatory for Postgres,
# and optional for MongoDB.
python scripts/db_backup.py --db postgres --backup-dir ./backups backup --uri "$PG_URI" --database orders

# Check performance — --uri is required, --threshold is an integer in
# milliseconds, so "100ms" is rejected
python scripts/db_performance_check.py --db mongodb --uri "$MONGO_URI" --threshold 100
```

`--backup-dir` is created with `mkdir(exist_ok=True)` and no `parents=True`, so
give it a path whose parent already exists and is writable.

`generate`, `apply`, `rollback`, `restore`, and `cleanup` accept `--dry-run`.
Use it first on the destructive ones — `apply`, `rollback`, `restore`,
`cleanup`. `backup` has no `--dry-run`.

**`rollback` does not reverse anything on MongoDB.** It runs `delete_one`
against the tracking collection, so the migration is forgotten and re-applied on
the next `apply` while its effects remain; `generate` emits no down-operations
for MongoDB in the first place. On Postgres it executes `down_sql` only when the
migration file carries one — otherwise it prints `✓ Rolled back` having changed
nothing, including the tracking row. Write and run the inverse yourself. In the
same script, MongoDB `apply` handles only `createIndex` operations and skips any
other operation type while still recording the migration as applied.

## Best Practices

**MongoDB:**
- Use embedded documents for 1-to-few relationships
- Reference documents for 1-to-many or many-to-many
- Index frequently queried fields
- Use aggregation pipeline for complex transformations
- Enable authentication and TLS in production
- Prefer a managed deployment (Atlas) over self-hosting; `av:devops` sets it up

**PostgreSQL:**
- Normalize schema to 3NF, denormalize for performance
- Use foreign keys for referential integrity
- Index foreign keys and frequently filtered columns
- Use EXPLAIN ANALYZE to optimize queries
- Regular VACUUM and ANALYZE maintenance
- Connection pooling (pgBouncer) for web apps

## Output format

Return the artifact, not a description of it:

- **Schema work** — the DDL or collection/validator definition, runnable as
  written, with the engine and version assumption stated. Follow it with a table
  of `Index | Columns/fields | Query it serves`; an index with no named query is
  cost without a reason.
- **Query work** — the query, and when a database is reachable, the
  `EXPLAIN ANALYZE` (Postgres) or `.explain("executionStats")` (MongoDB) output
  before and after, so the improvement is measured rather than asserted. When
  none is reachable — the common case for a from-scratch design — write
  `Not measured: no database reachable` and label the expected plan change a
  prediction. Never write plan output you did not get back from a database.
- **Migration work** — the forward migration and its rollback, and the command
  that applies it. State whether it takes a lock that blocks writes.
- Close with **Trade-offs** naming what the chosen shape costs (write
  amplification, denormalized copies to keep in sync, index maintenance).

## Quality gates

- [ ] A backup exists before any migration, drop, or bulk update is proposed as
      ready to run, and the report says which command takes it
- [ ] Every index is justified by a specific query in the report
- [ ] Performance claims come from a real `EXPLAIN`, or are labelled as
      predictions — never presented as measurements that were not taken
- [ ] Destructive steps are shown with `--dry-run` first where the script
      supports one
- [ ] No connection string, password, or host is written into the report or into
      a committed file — pass them by environment variable

## Workflow position

**Typically follows:** `av:debug` when an investigation has traced a problem to
a query or a missing index.
**Typically precedes:** `av:test` for the migration's regression coverage.
**Interleaves with:** `av:backend-development` — the schema's shape drives the
API's, and the API's access patterns drive which indexes are worth their cost,
so these two usually alternate rather than run once each.
**Related:** `av:devops` provisions and hosts the database — the instance, the
backups schedule, the network path — where this skill designs what runs inside
it; `av:security` reviews the access-control and exposure side of a schema.

## Resources

- MongoDB: https://www.mongodb.com/docs/
- PostgreSQL: https://www.postgresql.org/docs/
- MongoDB University: https://learn.mongodb.com/
- PostgreSQL Tutorial: https://www.postgresqltutorial.com/
