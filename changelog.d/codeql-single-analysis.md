### Changed

- CodeQL runs one analysis instead of two. Its `javascript` extractor already covers TypeScript,
  so the separate `typescript` job repeated the same 201 rules with the same results.
