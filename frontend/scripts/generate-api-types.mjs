import { readFileSync, writeFileSync } from "node:fs";
const document = JSON.parse(readFileSync("../docs/backend/openapi.json", "utf8"));
function type(schema) {
  if (!schema || Object.keys(schema).length === 0) return "unknown";
  if (schema.$ref) return `components["schemas"][${JSON.stringify(schema.$ref.split("/").at(-1))}]`;
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(" | ");
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf).map(type).join(" | ");
  if (schema.allOf) return schema.allOf.map(type).join(" & ");
  if (Array.isArray(schema.type)) return schema.type.map(value => type({ ...schema, type: value })).join(" | ");
  if (schema.type === "array") return `Array<${type(schema.items)}>`;
  if (schema.type === "object" || schema.properties) {
    const properties = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      `${JSON.stringify(key)}${schema.required?.includes(key) ? "" : "?"}: ${type(value)};`).join(" ");
    const extra = schema.additionalProperties && typeof schema.additionalProperties === "object"
      ? ` & Record<string, ${type(schema.additionalProperties)}>` : "";
    return properties ? `{ ${properties} }${extra}` : `Record<string, ${type(schema.additionalProperties)}>`;
  }
  return ({ integer: "number", number: "number", string: "string", boolean: "boolean", null: "null" })[schema.type] ?? "unknown";
}
const output = "// Generated from docs/backend/openapi.json. Run npm run api:generate.\nexport interface components {\n  schemas: {\n" +
  Object.entries(document.components.schemas).map(([key, schema]) => `    ${JSON.stringify(key)}: ${type(schema)};`).join("\n") + "\n  };\n}\n";
if (process.argv.includes("--check")) {
  if (readFileSync("src/lib/api/generated.ts", "utf8") !== output) throw new Error("API type drift: run npm run api:generate");
} else { writeFileSync("src/lib/api/generated.ts", output); console.log("Generated API types"); }
