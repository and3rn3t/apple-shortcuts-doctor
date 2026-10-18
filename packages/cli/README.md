# shortcuts-doctor

Static inspector for Apple Shortcuts exports. Never executes anything, never prints parameter
values, no network.

```bash
npx shortcuts-doctor inspect /absolute/path/export.json
npx shortcuts-doctor inspect --format md --fail-on warning export.json
```

See the [project README](https://github.com/and3rn3t/apple-shortcuts-doctor#readme) for options,
exit codes, and the report schema.
