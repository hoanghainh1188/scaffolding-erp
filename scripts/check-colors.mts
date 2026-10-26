// Fails when code under src/ uses a raw Tailwind palette colour (bg-blue-600,
// text-white...) or a hex colour instead of a Bright Blue Base token.
// Runs as part of `npm run lint`.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const UTILITY =
  "bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow|inset-shadow";

const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`,
  "g",
);
const HEX_COLOR =
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

/** Generated from tokens.json: the one place hex values are allowed. */
const ALLOWED_FILES = new Set(["src/styles/tokens.css"]);
const CHECKED_EXTENSIONS = /\.(tsx?|css)$/;
const TEST_FILE = /\.test\.tsx?$/;

export interface ColorViolation {
  file: string;
  line: number;
  match: string;
}

export function findColorViolations(
  file: string,
  source: string,
): ColorViolation[] {
  if (ALLOWED_FILES.has(file)) return [];
  return source.split("\n").flatMap((text, index) =>
    [...text.matchAll(PALETTE_CLASS), ...text.matchAll(HEX_COLOR)].map((m) => ({
      file,
      line: index + 1,
      match: m[0],
    })),
  );
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

export function checkColors(root: string = "src"): ColorViolation[] {
  return listFiles(root)
    .map((path) => relative(process.cwd(), path))
    .filter((file) => CHECKED_EXTENSIONS.test(file) && !TEST_FILE.test(file))
    .flatMap((file) => findColorViolations(file, readFileSync(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkColors();
  for (const v of violations) {
    process.stderr.write(
      `${v.file}:${v.line}  "${v.match}" — dùng token Bright Blue Base (bg-primary, text-muted-foreground...) thay cho màu cứng\n`,
    );
  }
  if (violations.length > 0) {
    process.stderr.write(`\n✖ ${violations.length} màu cứng\n`);
    process.exit(1);
  }
}
