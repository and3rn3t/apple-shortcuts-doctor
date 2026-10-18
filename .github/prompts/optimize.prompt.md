---
description: "Optimize code for better performance — reduce latency, memory usage, or compute cost"
agent: "agent"
argument-hint: "Describe the performance issue or code to optimize"
---
Optimize the provided code for better performance.

## Approach
1. **Profile** first — identify the actual bottleneck, don't guess
2. **Measure** current performance with benchmarks if possible
3. **Optimize** using the appropriate strategy:
   - **Algorithmic**: Better data structures or algorithms (O(n) vs O(n²))
   - **I/O**: Batch operations, connection pooling, streaming
   - **Caching**: Memoize expensive computations, cache API responses
   - **Concurrency**: Parallelize independent operations
   - **Memory**: Reduce allocations, use streaming for large data
   - **Database**: Add indexes, optimize queries, reduce round trips
4. **Verify** the optimization actually improves performance
5. **Document** the optimization with before/after metrics

## Constraints
- Don't sacrifice readability for marginal gains
- Maintain correctness — optimized code must produce identical results
- Consider maintainability trade-offs
- Profile in production-like conditions, not just dev
