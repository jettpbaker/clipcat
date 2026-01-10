# CLAUDE.md

## AI Assistant Instructions

**Before completing any code task, ALWAYS:**

1. **Run TypeScript check:**
```bash
   bunx tsc --noEmit
```
   Fix any type errors before submitting.

2. **Run Biome lint:**
```bash
   bunx biome check --write .
```
   This formats and lints all files.

**Do NOT:**
- Skip type checking "because it's just a quick fix"
- Leave Biome warnings unfixed
- Commit code that doesn't compile
- Use `any` types without explicit justification

**When suggesting code:**
- Provide fully typed code (no `any` unless necessary)
- Follow project conventions (single quotes, no semis)
- Match existing file structure and patterns

## Project Overview

**clipcat** is a browser-based video compression tool for gamers to trim and compress gaming clips to fit Discord's file size limits (10MB free, 500MB Nitro).

**Core Value Proposition:**
- Fast local compression (no upload/download)
- Privacy-first (video never leaves user's machine)
- Frame-accurate trimming

**Target Users:** Gamers who use Discord and want to share clips from Shadowplay, OBS, etc.

## Tech Stack

**Runtime & Build:**
- Bun
- Vite
- React
- TypeScript

**Styling:**
- TailwindCSS

**Core Libraries:**
- **Mediabunny** - Video processing (WebCodecs wrapper)
- Biome - Linting & formatting

**Tooling:**
- jj (version control, colocated with git)
