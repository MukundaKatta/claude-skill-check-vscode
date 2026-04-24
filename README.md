# Claude Skill Check for VS Code

Lint Claude Code `SKILL.md` files directly inside VS Code. This extension is the editor companion to the [claude-skill-check](https://pypi.org/project/claude-skill-check/) Python linter and [@mukundakatta/skillint](https://www.npmjs.com/package/@mukundakatta/skillint) npm linter.

## What it checks

- YAML frontmatter is present and parses cleanly
- `name` and `description` are present
- `name` is lowercase kebab-case, 1-64 chars, starts with a letter
- `description` length is reasonable (20-1024 chars)
- Common secret patterns (Anthropic / OpenAI / AWS / GitHub keys, PEM blocks) are flagged
- Unknown frontmatter fields get a warning
- Empty body gets a warning

Diagnostics appear in the **Problems** panel and inline squiggles on save.

## How it works

The extension runs a self-contained TypeScript port of the validator — **no Python or external process required**. It activates on markdown files and by default only lints files named `SKILL.md`. You can change the file pattern in settings.

## Settings

| Setting | Default | Description |
|---|---|---|
| `claudeSkillCheck.enable` | `true` | Turn diagnostics on or off. |
| `claudeSkillCheck.fileGlob` | `**/SKILL.md` | Glob pattern for files to lint. |

## Commands

- **Claude Skill Check: Lint Active File** — re-runs the linter on the current editor.

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```

## License

MIT
