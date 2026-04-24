// TypeScript port of the core validator from the Python claude-skill-check package.
// Kept minimal and free of dependencies so the VS Code extension stays lightweight.

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  line: number;
}

const REQUIRED_FIELDS = ["name", "description"] as const;
const OPTIONAL_FIELDS = new Set(["allowed-tools", "model", "argument-hint"]);
const KNOWN_FIELDS = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

const NAME_RE = /^[a-z][a-z0-9\-]{0,62}[a-z0-9]$/;
const MIN_DESCRIPTION_LEN = 20;
const MAX_DESCRIPTION_LEN = 1024;

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /sk-[A-Za-z0-9]{20,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["generic PEM block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function findLine(source: string, needle: string): number {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return 0;
}

/** Very small YAML subset parser: `key: value` and `key:\n  - item` lists only. */
function parseSimpleYaml(src: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const lines = src.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const raw of lines) {
    const line = raw;
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const listMatch = /^\s*-\s*(.*)$/.exec(line);
    if (listMatch && currentList) {
      currentList.push(listMatch[1].trim());
      continue;
    }
    const kvMatch = /^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(line);
    if (!kvMatch) {
      return null;
    }
    const [, key, rest] = kvMatch;
    currentKey = key;
    if (rest.trim() === "") {
      // start of list or nested map; we only support lists here
      currentList = [];
      out[key] = currentList;
    } else {
      currentList = null;
      let value: unknown = rest.trim();
      if (value === "true" || value === "false") {
        value = value === "true";
      } else if (/^-?\d+$/.test(value as string)) {
        value = Number(value);
      } else if (
        typeof value === "string" &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = (value as string).slice(1, -1);
      }
      out[key] = value;
    }
  }
  return out;
}

export function validate(source: string): Issue[] {
  const issues: Issue[] = [];

  if (!source.trim()) {
    issues.push({ severity: "error", code: "E001", message: "file is empty", line: 0 });
    return issues;
  }

  const m = FRONTMATTER_RE.exec(source);
  if (!m) {
    issues.push({
      severity: "error",
      code: "E002",
      message: "missing YAML frontmatter ('---' fence required on first line)",
      line: 0,
    });
    return issues;
  }

  const fm = m[1];
  const data = parseSimpleYaml(fm);
  if (!data) {
    issues.push({
      severity: "error",
      code: "E003",
      message: "frontmatter is not valid YAML (or uses unsupported nesting)",
      line: 0,
    });
    return issues;
  }

  for (const req of REQUIRED_FIELDS) {
    if (!(req in data)) {
      issues.push({
        severity: "error",
        code: "E100",
        message: `missing required field '${req}'`,
        line: 0,
      });
    }
  }

  if ("name" in data) {
    const name = data["name"];
    if (typeof name !== "string") {
      issues.push({
        severity: "error",
        code: "E101",
        message: "'name' must be a string",
        line: findLine(source, "name:"),
      });
    } else if (!NAME_RE.test(name)) {
      issues.push({
        severity: "error",
        code: "E102",
        message:
          "'name' must be lowercase kebab-case (e.g. 'my-skill'), 1-64 chars, starting with a letter",
        line: findLine(source, "name:"),
      });
    }
  }

  if ("description" in data) {
    const desc = data["description"];
    if (typeof desc !== "string") {
      issues.push({
        severity: "error",
        code: "E110",
        message: "'description' must be a string",
        line: findLine(source, "description:"),
      });
    } else {
      const n = desc.trim().length;
      if (n < MIN_DESCRIPTION_LEN) {
        issues.push({
          severity: "warning",
          code: "W111",
          message: `'description' is too short (${n} chars); aim for at least ${MIN_DESCRIPTION_LEN}`,
          line: findLine(source, "description:"),
        });
      }
      if (n > MAX_DESCRIPTION_LEN) {
        issues.push({
          severity: "error",
          code: "E112",
          message: `'description' is too long (${n} chars); keep under ${MAX_DESCRIPTION_LEN}`,
          line: findLine(source, "description:"),
        });
      }
    }
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) {
      issues.push({
        severity: "warning",
        code: "W900",
        message: `unknown field '${key}' in frontmatter`,
        line: findLine(source, `${key}:`),
      });
    }
  }

  for (const [label, pat] of SECRET_PATTERNS) {
    if (pat.test(source)) {
      issues.push({
        severity: "error",
        code: "E200",
        message: `possible ${label} leaked in skill file`,
        line: 0,
      });
    }
  }

  const body = source.slice(m[0].length).trim();
  if (!body) {
    issues.push({
      severity: "warning",
      code: "W300",
      message: "skill body is empty after frontmatter",
      line: 0,
    });
  }

  return issues;
}
