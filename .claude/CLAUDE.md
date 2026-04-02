Bun + TypeScript (strict). Runtime deps: giget, eta. Lint: oxlint. Format: oxfmt.

Commands: `bun test` | `bun run build` | `bun run lint` | `bun run format`

Provider interface: `src/providers/types.ts`. Each provider: own file, own test.
Resolver: `src/resolve.ts`. Replace: `src/replace.ts`. Extract: `src/utils/extract.ts`.
Entry: `src/index.ts`. Tests: `test/providers/<name>.test.ts`, `test/e2e/cli.test.ts`.

Agents: `git-ops` — commits, push, PRs, tags, gitignore, branches. Uses `github` skill. `git-actions` — workflow YAML, CI/CD, caching, matrix builds, semantic-release. Uses `github` skill. `readme-manager` — generates, audits, updates README.md. Uses `readme` skill.

Rules:

- New provider = new file in `src/providers/` + new test in `test/providers/` + register in `src/resolve.ts`
- `shwoop.json` in template root = structured config (`vars`, `exclude`, `postShwoop`). Config: `src/config.ts`
- Variable types: string default, `""` required, array choices, `{default, pattern}` validated
- `exclude` map: keys are var names, values are file patterns — removed when var not provided
- `postShwoop`: shell command run after replacement
- `{{KEY}}` plain replacement in file/dir names + file contents
- Eta template engine auto-detected for advanced syntax (`{{= expr }}`, `{{ if/for }}`)
- Interactive prompts for missing required vars (TTY only, silent in CI)
- Skip binary files during replacement
- `http` provider must be last in resolve order (catches any URL)
