// Lets plain `node` run scripts that import app code from src/: maps "@/x"
// to src/x and resolves extensionless imports to .ts/.tsx/index.ts, the way
// the TypeScript and Next.js setups do. Node strips the types itself.
// Usage: node --import ./scripts/register-aliases.mjs scripts/<name>.mts
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function withExtension(path) {
  if (isFile(path)) return path;
  for (const extension of EXTENSIONS) {
    if (isFile(path + extension)) return path + extension;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromApp =
      context.parentURL?.startsWith("file:") &&
      fileURLToPath(context.parentURL).startsWith(SRC);
    let target = null;
    if (specifier.startsWith("@/")) {
      target = withExtension(SRC + specifier.slice(2));
    } else if (fromApp && specifier.startsWith(".")) {
      target = withExtension(
        fileURLToPath(new URL(specifier, context.parentURL)),
      );
    }
    if (!target) return nextResolve(specifier, context);
    const resolved = nextResolve(pathToFileURL(target).href, context);
    // App code is ES modules; saying so skips Node's CommonJS guess.
    return target.endsWith(".ts")
      ? { ...resolved, format: "module-typescript" }
      : resolved;
  },
});
