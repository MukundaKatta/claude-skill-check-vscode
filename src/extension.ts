import * as path from "path";
import * as vscode from "vscode";
import { validate, Issue } from "./validator";

const DIAGNOSTIC_SOURCE = "claude-skill-check";

function severityToVSCode(s: Issue["severity"]): vscode.DiagnosticSeverity {
  return s === "error"
    ? vscode.DiagnosticSeverity.Error
    : vscode.DiagnosticSeverity.Warning;
}

function shouldLint(document: vscode.TextDocument): boolean {
  const cfg = vscode.workspace.getConfiguration("claudeSkillCheck");
  if (!cfg.get<boolean>("enable", true)) return false;
  if (document.languageId !== "markdown") return false;

  const glob = cfg.get<string>("fileGlob", "**/SKILL.md");
  // Quick filename check; VS Code doesn't expose a built-in glob matcher on
  // a single document, so we compare on basename for the common default.
  const basename = path.basename(document.uri.fsPath);
  if (glob === "**/SKILL.md") {
    return basename === "SKILL.md";
  }
  // For custom globs, always lint markdown and let users disable per-file.
  return true;
}

function lintDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
): void {
  if (!shouldLint(document)) {
    collection.delete(document.uri);
    return;
  }

  const issues = validate(document.getText());
  const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
    const line = Math.min(
      Math.max(0, issue.line),
      Math.max(0, document.lineCount - 1),
    );
    const textLine = document.lineAt(line);
    const range = new vscode.Range(line, 0, line, textLine.text.length);
    const d = new vscode.Diagnostic(
      range,
      `${issue.code}: ${issue.message}`,
      severityToVSCode(issue.severity),
    );
    d.source = DIAGNOSTIC_SOURCE;
    d.code = issue.code;
    return d;
  });

  collection.set(document.uri, diagnostics);
}

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(collection);

  if (vscode.window.activeTextEditor) {
    lintDocument(vscode.window.activeTextEditor.document, collection);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => lintDocument(doc, collection)),
    vscode.workspace.onDidChangeTextDocument((e) =>
      lintDocument(e.document, collection),
    ),
    vscode.workspace.onDidSaveTextDocument((doc) => lintDocument(doc, collection)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    vscode.commands.registerCommand("claudeSkillCheck.runOnActiveFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) lintDocument(editor.document, collection);
    }),
  );
}

export function deactivate(): void {
  // nothing to clean up; DiagnosticCollection is disposed via subscriptions.
}
