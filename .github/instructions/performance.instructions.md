---
description: "Use when optimizing performance, profiling, caching, reducing latency, improving throughput, or addressing performance bottlenecks."
---
# Performance Guidelines

## General Principles

- Measure before optimizing — use profiling tools to identify actual bottlenecks
- Optimize the hot path; don't prematurely optimize cold code
- Set performance budgets and monitor them in CI
- Cache expensive computations and I/O at appropriate levels

## Backend Performance

- Use connection pooling for database connections
- Implement caching layers: in-memory → distributed (Redis) → CDN
- Use pagination for large data sets; stream for very large responses
- Run expensive operations asynchronously (job queues, background workers)
- Profile database queries: indexes, query plans, N+1 detection

## Frontend Performance

- Code-split by route and lazy-load non-critical components
- Optimize critical rendering path: minimize blocking resources
- Use `requestAnimationFrame` for visual updates; `requestIdleCallback` for low-priority work
- Implement virtual scrolling for lists over 100 items
- Preload critical assets; prefetch likely next navigations

## Caching Strategy

- Cache at the right level: browser → CDN → application → database
- Use cache invalidation strategies: TTL, event-based, version-based
- Set appropriate `Cache-Control` headers for static assets
- Use ETags for conditional requests on API endpoints
- Be explicit about cache keys; include relevant parameters

## Monitoring

- Track key metrics: response time (p50, p95, p99), throughput, error rate
- Set up alerting for performance degradation
- Log slow operations with context for debugging
- Use distributed tracing for microservice architectures
