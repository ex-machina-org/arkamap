import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const normalize = path => relative(root, path).replaceAll("\\", "/");
const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const exceptions = new Set([
  "src/components/ui/kpi-card.tsx -> src/components/application/dashboard/stat-cards.tsx",
]);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(tsx?|jsx?)$/.test(path) ? [path] : [];
  });
}
function violation(from, to) {
  if (from.startsWith("src/components/")) {
    if (to.startsWith("src/app/") || to.startsWith("src/features/")) return true;
    if (/^src\/components\/(base|foundations)\//.test(from) && to.startsWith("src/components/application/")) return true;
    if (from.startsWith("src/components/ui/") && to.startsWith("src/components/application/")) return true;
  }
  if (/^src\/(hooks|lib|utils)\//.test(from) && /^src\/(app|features|components)\//.test(to)) return true;
  if (from.startsWith("src/features/")) {
    if (to.startsWith("src/app/")) return true;
    if (to.startsWith("src/features/") && from.split("/")[2] !== to.split("/")[2]) return true;
  }
  return false;
}
const failures = [];
const usedExceptions = new Set();
for (const file of files(resolve("src"))) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const target = ts.resolveModuleName(specifier.text, file, parsed.options, ts.sys).resolvedModule;
      if (target && !target.isExternalLibraryImport) {
        const from = normalize(file);
        const to = normalize(target.resolvedFileName);
        const edge = `${from} -> ${to}`;
        if (violation(from, to)) {
          if (exceptions.has(edge)) usedExceptions.add(edge);
          else failures.push(edge);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const exception of exceptions) if (!usedExceptions.has(exception)) failures.push(`Remove stale exception: ${exception}`);
console.log(failures.length ? failures.join("\n") : `Architecture boundaries passed (${usedExceptions.size} documented legacy exception).`);
if (failures.length) process.exitCode = 1;
