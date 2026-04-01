# shwoop

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![npm](https://img.shields.io/npm/v/shwoop)](https://www.npmjs.com/package/shwoop)

Download templates from anywhere and replace `{{KEY}}` variables in file contents, file names, and directory names. Supports [Eta](https://eta.js.org) for conditionals and loops, and `shwoop.json` for declaring variables, defaults, validation, interactive prompts, exclusion rules, and post-download hooks.

Built on [giget](https://github.com/unjs/giget) for git-hosted templates (GitHub, GitLab, Bitbucket), with additional providers for AWS S3, Cloudflare R2, Google Cloud Storage, Google Drive, npm registry, any HTTP URL, and local files.

## Quick Start

No install required (except for [Bun](https://bun.sh))

```bash
bunx shwoop gh:jeff/cold-soup/template ./my-app FLAVOR=gazpacho SEATS=42
```

or

```bash
npx shwoop gh:jeff/cold-soup/template ./my-app FLAVOR=gazpacho SEATS=42
```

or

```bash
pnpm dlx shwoop gh:jeff/cold-soup/template ./my-app FLAVOR=gazpacho SEATS=42
```

To install globally: `bun add -g shwoop`

## Sources

| Prefix     | Source                |
| ---------- | --------------------- |
| `gh:`      | GitHub                |
| `gl:`      | GitLab                |
| `bb:`      | Bitbucket             |
| `npm:`     | npm registry          |
| `s3:`      | AWS S3                |
| `r2:`      | Cloudflare R2         |
| `gs:`      | Google Cloud Storage  |
| `gdrive:`  | Google Drive (public) |
| `https://` | Any URL (tarball/zip) |
| `file:`    | Local filesystem      |

## Usage

```bash
npx shwoop <source> <dest> [KEY=value ...]
```

### Examples

```bash
# GitHub subdirectory with variables
npx shwoop gh:dept-of-birds/registry/templates/app ./my-app NAME=gerald PORT=1337

# Local template
npx shwoop file:./templates/skill ~/.claude/skills/log VAULT_PATH=/opt/questionable

# S3 tarball
npx shwoop s3:receipts-2019/templates/api.tar.gz ./api ENV=chaos

# Google Cloud Storage tarball
npx shwoop gs:lost-and-found/templates/api.tar.gz ./api ENV=staging

# npm package as template
npx shwoop npm:@disputed/toast ./project AUTHOR=the-temps

# Pin a specific version
npx shwoop npm:@disputed/toast@2.0.0 ./project AUTHOR=the-temps

# Use a dist-tag
npx shwoop npm:left-pad@latest ./project

# Any URL
npx shwoop https://example.com/sourdough-starter.tar.gz ./out KEY=value

# Google Drive (public share file ID)
npx shwoop gdrive:1a2b3c4d5e ./out NAME=gerald
```

## Variables

Use `{{KEY}}` in any file. shwoop replaces all occurrences with the value you pass.

```markdown
host: {{HOST}}
port: {{PORT}}
```

```bash
npx shwoop file:./template ./out HOST=localhost PORT=8080
```

Result:

```markdown
host: localhost
port: 8080
```

Binary files are skipped automatically.

### Advanced templates (Eta)

For templates that need logic, shwoop uses [Eta](https://eta.js.org) — a lightweight, zero-dependency TypeScript template engine. Eta syntax is auto-detected; simple `{{KEY}}` templates work without it.

**Conditionals:**

```
{{ if(it.DOCKER) { }}
FROM node:20
COPY . /app
{{ } }}
```

**Loops:**

```
{{ it.DEPS.split(",").forEach(function(dep) { }}
  - {{= dep }}
{{ }) }}
```

**Interpolation:**

```
name: {{= it.NAME }}
```

Eta uses `{{= expr }}` for interpolation and `{{ code }}` for JS execution. Variables are accessed via `it.KEY`.

You can mix both styles in the same file — `{{KEY}}` placeholders are replaced first, then Eta runs for logic.

## Configuration

Template authors can include a `shwoop.json` at the template root to declare variables, set defaults, validate input, exclude files conditionally, and run a command after everything is done.

```json
{
  "vars": {
    "NAME": "",
    "HOST": "localhost",
    "FONT": ["helvetica", "comic-sans", "papyrus"],
    "SLUG": { "default": "", "pattern": "^[a-z][a-z0-9-]*$" }
  },
  "exclude": {
    "DOCKER": ["Dockerfile", ".dockerignore"],
    "CI": [".github/**"]
  },
  "postShwoop": "bun install"
}
```

| Field | Purpose |
|-------|---------|
| **`vars`** | Declares variables your template expects. Controls prompting, defaults, and validation. |
| `"NAME": ""` | Required — empty string or `null` means it must be provided. |
| `"HOST": "localhost"` | Optional — uses the string as default, CLI overrides. |
| `"FONT": [...]` | Choice — must be one of the listed values, first is default. |
| `"SLUG": {default, pattern}` | Validated — must match the regex pattern. |
| **`exclude`** | Maps a variable name to file patterns (supports globs). Files are deleted when the variable is not provided or empty/`"false"`. |
| **`postShwoop`** | Shell command that runs in the output directory after replacement and exclusion. Runs via `sh -c`. |

### Interactive prompts

When required variables are missing and stdin is a TTY, shwoop prompts interactively instead of erroring:

```
$ npx shwoop gh:dept-of-birds/registry/template ./out
Downloading from giget...
? NAME: gerald
? FONT:
  1) helvetica
  2) comic-sans
  3) papyrus
  Choose (1-3): 1
? SLUG (pattern: ^[a-z][a-z0-9-]*$): gerald
Replacing 3 variable(s)...
Done → ./out
```

In CI or piped input (non-TTY), missing required variables still produce errors. Pass all variables as CLI args to skip prompts entirely.

### Conditional file exclusion

Files listed under `exclude` are removed when their key variable is **not provided** (or empty/`"false"`). Pass the variable to keep them:

```bash
# Keeps Dockerfile and .github/ in output
npx shwoop gh:dept-of-birds/registry/template ./out NAME=gerald DOCKER=true CI=true
```

### Post-download hook

`postShwoop` runs a shell command in the output directory after variable replacement and file exclusion are complete. The command runs via `sh -c`, so pipes and chaining work:

```jsonc
"postShwoop": "bun install && git init"
```

```
$ npx shwoop gh:dept-of-birds/registry/template ./out NAME=gerald
Downloading from giget...
Replacing 3 variable(s)...
Running: bun install && git init
Done → ./out
```

If the command exits non-zero, shwoop fails with an error.

### File and directory name replacement

`{{KEY}}` placeholders in file and directory names are replaced too:

```
template/{{NAME}}/{{NAME}}.config.ts  →  gerald/gerald.config.ts
```

### Behavior overview

| Scenario                                      | Result                         |
| --------------------------------------------- | ------------------------------ |
| No `shwoop.json`, no args                     | Download only                  |
| No `shwoop.json`, with args                   | Replace with CLI args          |
| `shwoop.json` with defaults                   | Merge defaults, CLI overrides  |
| `shwoop.json` with required (`""`) not passed | Error listing missing vars     |
| Choice variable with invalid value            | Error listing valid choices    |
| Pattern variable with invalid value           | Error showing expected pattern |

**Missing required variable:**

```
$ npx shwoop gh:dept-of-birds/registry/template ./out
Downloading from giget...
Error: Missing required variable: NAME
```

The `shwoop.json` file is removed from the output after processing. The legacy flat format (top-level key-value pairs) is still supported for simple cases.

## Cloud Provider Setup

### S3

```bash
# s3:<bucket>/<key> — key must point to an archive (.tar.gz, .tgz, .zip)
bunx shwoop s3:my-bucket/templates/api.tar.gz ./api ENV=prod
```

shwoop tries the `aws` CLI first (inherits all your configured auth). If the CLI isn't installed, it falls back to [aws4fetch](https://github.com/mhart/aws4fetch) using `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables.

For **public S3 buckets**, use the `https://` prefix instead — no credentials needed:

```bash
bunx shwoop https://my-bucket.s3.amazonaws.com/template.tar.gz ./out
```

### R2

Requires `R2_ENDPOINT` pointing to your Cloudflare account's S3-compatible API:

```bash
export R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
bunx shwoop r2:my-bucket/templates/api.tar.gz ./api ENV=prod
```

Same fallback as S3 — `aws` CLI first, then aws4fetch with env var credentials.

### GCS

```bash
bunx shwoop gs:my-bucket/templates/service.tar.gz ./out NAME=auth-service
```

shwoop tries `gcloud` CLI first. If not installed, falls back to aws4fetch using [GCS HMAC keys](https://cloud.google.com/storage/docs/authentication/hmackeys) via the same `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars.

**Public buckets:** If the bucket allows public access, skip `gs:` and use the HTTPS URL directly — no `gcloud` CLI or authentication needed:

```bash
npx shwoop https://storage.googleapis.com/my-bucket/templates/api.tar.gz ./out NAME=auth-service
```

### Google Drive

Download a publicly shared archive from Google Drive by file ID. The file ID is the long string in a Google Drive share link:

```
https://drive.google.com/file/d/1a2b3c4d5e6f7g8h/view
                                 ^^^^^^^^^^^^^^^ this part
```

```bash
npx shwoop gdrive:1a2b3c4d5e6f7g8h ./out NAME=gerald
```

The shared file must be a `.tar.gz`, `.tgz`, or `.zip` archive. shwoop downloads via Google Drive's public export endpoint (`/uc?export=download`), extracts the archive, then applies variable replacement.

**Requirements:**

- The file must be shared as "Anyone with the link" in Google Drive
- No authentication or API key is needed for public files

**Limitations:**

- Large files (>100 MB) may trigger Google Drive's virus-scan interstitial page — shwoop detects this and fails with a clear error rather than silently extracting HTML
- The `/uc?export=download` endpoint is being tightened by Google over time; very large files may require the Drive API v3 with an API key (not currently supported)
- The file must be an archive — plain files (single `.ts`, `.json`, etc.) are not supported as templates

### npm

Uses `npm pack` under the hood — any specifier that `npm pack` accepts works:

```bash
# Unscoped package
npx shwoop npm:left-pad ./out

# Scoped package
npx shwoop npm:@disputed/toast ./out AUTHOR=the-temps

# Pinned version
npx shwoop npm:@disputed/toast@2.0.0 ./out AUTHOR=the-temps

# Dist-tag
npx shwoop npm:left-pad@next ./out
```

The package tarball is downloaded to a temp directory, extracted (stripping the `package/` prefix npm adds), then variable replacement runs as usual. The temp directory is cleaned up regardless of success or failure.

**Requirements:**

- `npm` CLI available on `PATH` (ships with Node.js)
- Registry authentication configured in `.npmrc` if the package is private

## Contributing

Clone the repo and install dependencies with `bun install`.

```bash
bun test          # run tests
bun run build     # compile to dist/
bun run lint      # check with oxlint + oxfmt
bun run format    # auto-fix with oxfmt
```

## License

[MIT](LICENSE)
