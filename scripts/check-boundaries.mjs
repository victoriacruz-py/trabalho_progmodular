import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const normalized = (value) => value.replaceAll("\\", "/");
const moduleAt = (relative) =>
  /^apps\/api\/src\/modules\/([^/]+)(?:\/(.*))?$/.exec(relative);
const publicEntry = (suffix) =>
  !suffix || /^index(?:\.d)?(?:\.[cm]?[tj]s)?$/.test(suffix);
const optionsByRoot = new Map();
function compilerOptions(root) {
  if (!optionsByRoot.has(root)) {
    const config = path.join(root, "tsconfig.api.json");
    const options = existsSync(config)
      ? ts.readConfigFile(config, ts.sys.readFile).config?.compilerOptions || {}
      : {};
    optionsByRoot.set(root, {
      ...ts.convertCompilerOptionsFromJson(options, root).options,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    });
  }
  return optionsByRoot.get(root);
}

export function inspectSource(
  filename,
  source,
  root = process.cwd(),
  names = ["catalogo", "precos", "clientes", "estoque"],
) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const relative = normalized(path.relative(root, filename));
  const owner = moduleAt(relative)?.[1];
  const findings = [];
  const declarations = new Map();
  const collect = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(file);
  function staticText(node, depth = 0) {
    if (!node || depth > 12) return "";
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node))
      return staticText(declarations.get(node.text), depth + 1);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
      return staticText(node.expression, depth + 1);
    if (ts.isTemplateExpression(node))
      return (
        node.head.text +
        node.templateSpans
          .map((s) => staticText(s.expression, depth + 1) + s.literal.text)
          .join("")
      );
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    )
      return (
        staticText(node.left, depth + 1) + staticText(node.right, depth + 1)
      );
    return "";
  }
  function fail(node, code, message) {
    const { line, character } = file.getLineAndCharacterOfPosition(
      node.getStart(file),
    );
    findings.push({
      file: normalized(path.relative(root, filename)),
      line: line + 1,
      column: character + 1,
      code,
      message,
    });
  }
  function inspectImport(node) {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const specifier = node.text;
    const resolved = ts.resolveModuleName(
      specifier,
      filename,
      compilerOptions(root),
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    const target =
      resolved ||
      (specifier.startsWith(".")
        ? path.resolve(path.dirname(filename), specifier)
        : null);
    if (!target) return;
    const destinationPath = normalized(path.relative(root, target));
    if (
      relative.startsWith("apps/web/") &&
      /^apps\/api(?:\/|$)/.test(destinationPath)
    ) {
      fail(
        node,
        "WEB_BACKEND_IMPORT",
        "A interface web consome HTTP; não importe implementação do backend.",
      );
      return;
    }
    const destination = moduleAt(destinationPath);
    if (destination && destination[1] !== owner && !publicEntry(destination[2]))
      fail(
        node,
        "PRIVATE_MODULE_IMPORT",
        `Consuma ${destination[1]} pelo index público, sem acessar ${destination[2]}.`,
      );
  }
  function inspectSql(node) {
    if (!owner) return;
    const sql = staticText(node)
      .replace(/'(?:''|[^'])*'/g, " ")
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    if (
      !/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REFERENCES)\b/i.test(
        sql,
      )
    )
      return;
    for (const schema of names) {
      if (schema === owner) continue;
      if (
        new RegExp(
          `(?:^|[^a-zA-Z0-9_])(?:"${schema}"|${schema})\\s*\\.`,
          "i",
        ).test(sql)
      )
        fail(
          node,
          "FOREIGN_SCHEMA_SQL",
          `SQL de ${owner} acessa schema ${schema}; use o contrato público do módulo proprietário.`,
        );
    }
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      inspectImport(node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      inspectImport(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      inspectImport(node.argument.literal);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      inspectImport(node.arguments[0]);
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node))
      inspectSql(node);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["query", "execute", "raw"].includes(node.expression.name.text)
    ) {
      const argument = node.arguments[0];
      if (
        argument &&
        !ts.isStringLiteralLike(argument) &&
        !ts.isTemplateExpression(argument)
      )
        inspectSql(argument);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return findings;
}

function selfTest() {
  const root = path.resolve("/virtual");
  const source = path.join(
    root,
    "apps/api/src/modules/precos/implementation.ts",
  );
  assert.equal(
    inspectSource(source, "import {ICatalogo} from '../catalogo'", root).length,
    0,
  );
  assert.equal(
    inspectSource(
      source,
      "import {repository} from '../catalogo/implementation'",
      root,
    ).length,
    1,
  );
  for (const snippet of [
    "export {repository} from '../catalogo/implementation'",
    "const p = import('../catalogo/implementation')",
    "const p = require('../catalogo/implementation')",
    "type P = import('../catalogo/implementation').P",
  ]) {
    assert.equal(
      inspectSource(source, snippet, root).some(
        (f) => f.code === "PRIVATE_MODULE_IMPORT",
      ),
      true,
      snippet,
    );
  }
  assert.equal(
    inspectSource(
      source,
      "import {helper} from './implementation'; // import '../catalogo/implementation'",
      root,
    ).length,
    0,
  );
  assert.equal(
    inspectSource(
      path.join(root, "apps/web/src/ui.ts"),
      "import {createCatalogo} from '../../api/src/modules/catalogo'",
      root,
    ).some((f) => f.code === "WEB_BACKEND_IMPORT"),
    true,
  );
  assert.equal(
    inspectSource(source, "db.query('SELECT * FROM precos.prices')", root)
      .length,
    0,
  );
  assert.equal(
    inspectSource(
      source,
      "db.query('SELECT * FROM catalogo.products')",
      root,
    ).some((f) => f.code === "FOREIGN_SCHEMA_SQL"),
    true,
  );
  assert.equal(
    inspectSource(
      source,
      'const schema = "clientes"; db.query(`SELECT * FROM ${schema}.accounts`)',
      root,
    ).some((f) => f.code === "FOREIGN_SCHEMA_SQL"),
    true,
  );
  assert.equal(
    inspectSource(
      source,
      'db.query(\'SELECT * FROM "estoque"."saldos"\')',
      root,
    ).some((f) => f.code === "FOREIGN_SCHEMA_SQL"),
    true,
  );
  assert.equal(
    inspectSource(source, 'const label = "catalogo.products";', root).length,
    0,
  );
  assert.equal(
    inspectSource(
      source,
      "db.query(\"INSERT INTO precos.log VALUES ('catalogo.products')\")",
      root,
    ).length,
    0,
  );
  assert.equal(
    inspectSource(
      source,
      'db.query("SELECT * FROM precos.prices -- catalogo.products")',
      root,
    ).length,
    0,
  );
  assert.equal(
    inspectSource(
      source,
      'const sql = "SELECT * FROM " + "clientes.accounts"; db.query(sql)',
      root,
    ).some((f) => f.code === "FOREIGN_SCHEMA_SQL"),
    true,
  );
  console.log(
    "Boundary self-test: imports, SQL ownership and browser separation passed.",
  );
}

function sourceFiles(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.[cm]?tsx?$/.test(entry.name)
        ? [file]
        : [];
  });
}

function checkProject(root) {
  const modules = path.join(root, "apps/api/src/modules");
  const names = existsSync(modules)
    ? readdirSync(modules, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  const files = ["apps/api/src", "apps/web/src", "packages", "tests"].flatMap(
    (folder) => sourceFiles(path.join(root, folder)),
  );
  const findings = files.flatMap((file) =>
    inspectSource(file, readFileSync(file, "utf8"), root, names),
  );
  for (const finding of findings)
    console.error(
      `${finding.file}:${finding.line}:${finding.column} [${finding.code}] ${finding.message}`,
    );
  if (findings.length) {
    console.error(`${findings.length} violação(ões) de fronteira.`);
    process.exitCode = 1;
  } else
    console.log(
      `Fronteiras: ${files.length} arquivos TypeScript verificados; nenhum acesso privado detectado.`,
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--self-test")) selfTest();
  else checkProject(process.cwd());
}
