import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}
function initializer(source, name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
function properties(object) {
  return object.properties.filter(ts.isPropertyAssignment);
}
const registry = parse("src/app/design-system/registry.ts");
const pages = initializer(registry, "docs").elements.map(entry => Object.fromEntries(
  properties(entry).filter(property => ts.isStringLiteralLike(property.initializer)).map(property => [property.name.text, property.initializer.text]),
));
const content = parse("src/app/design-system/content.tsx");
const custom = new Set(properties(initializer(content, "componentContent")).map(property => property.name.text));
const extensions = parse("src/app/design-system/extension-content.tsx");
const extension = new Set(properties(initializer(extensions, "extensions")).map(property => property.name.text));
const previews = parse("src/components/application/docs/component-previews-free.tsx");
const preview = new Set(properties(initializer(previews, "FREE_COMPONENT_PREVIEWS")).map(property => property.name.text.replace("/components/", "")));
const direct = new Set();
function visit(node) {
  if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression)) {
    const condition = node.expression;
    if (condition.left.getText(content) === "slug" && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isStringLiteralLike(condition.right)) {
      const branch = ts.isBlock(node.thenStatement) ? node.thenStatement.statements : [node.thenStatement];
      if (branch.some(statement => ts.isReturnStatement(statement) && statement.expression && (ts.isJsxElement(statement.expression) || ts.isJsxSelfClosingElement(statement.expression) || ts.isJsxFragment(statement.expression)))) direct.add(condition.right.text);
    }
  }
  ts.forEachChild(node, visit);
}
visit(content);
const failures = [];
const slugs = new Set();
for (const page of pages) {
  if (slugs.has(page.slug)) failures.push(`Duplicate slug: ${page.slug}`);
  slugs.add(page.slug);
  if (!direct.has(page.slug) && !custom.has(page.slug) && !extension.has(page.slug) && !preview.has(page.slug)) failures.push(`Without example: ${page.title}`);
  for (const path of [...(page.source ?? "").split(/\s*\u00b7\s*/).filter(path => path.startsWith("src/")), ...(page.example ? [page.example] : [])]) {
    if (!existsSync(path)) failures.push(`Missing source: ${path}`);
  }
}
console.log(`${pages.length} catalog pages; ${custom.size} custom docs; ${extension.size} extension docs; ${preview.size} BoardUI previews.`);
console.log(failures.length ? failures.join("\n") : "All sources and example render paths found.");
if (failures.length) process.exitCode = 1;
