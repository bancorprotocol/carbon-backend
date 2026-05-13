CREATE EXTENSION IF NOT EXISTS pg_prewarm;

-- Prewarm hot-path tables and all their indexes (public schema)
SELECT pg_prewarm(c.oid, 'buffer')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    (c.relkind = 'r' AND c.relname IN (
      'strategy-realtime', 'strategies', 'blocks', 'tokens', 'pairs', 'quotes',
      'activities', 'activities-v2'
    ))
    OR
    (c.relkind = 'i' AND c.oid IN (
      SELECT indexrelid FROM pg_index
      WHERE indrelid IN (
        SELECT oid FROM pg_class
        WHERE relname IN (
          'strategy-realtime', 'strategies', 'blocks', 'tokens', 'pairs', 'quotes',
          'activities', 'activities-v2'
        )
      )
    ))
  );

-- Prewarm TimescaleDB hypertable chunks + their indexes (historic-quotes)
SELECT pg_prewarm(c.oid, 'buffer')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '_timescaledb_internal'
  AND c.relkind IN ('r', 'i')
  AND c.relname LIKE '_hyper_%';
