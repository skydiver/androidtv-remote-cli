## Project Guidelines for Codex Agents

- Prioritize non-destructive edits; never remove user-authored changes unless explicitly told.
- Default to concise, teammate-style responses. Surface findings before summaries during reviews.
- Run `pnpm start` or relevant checks when changes affect runtime behaviour, unless the user prefers otherwise.
- Use `apply_patch` for manual edits and keep multiline descriptions short; reference files with `path:line`.
- Maintain the ASCII art UI layout when adjusting the menu; align shortcut markers with the box edge.
- After merged modifications, bump `package.json` using semantic versioning: patch for fixes, minor for new features, major for breaking changes.
