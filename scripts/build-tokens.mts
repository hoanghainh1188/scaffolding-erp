// Generates src/styles/tokens.css from docs/design-system/tokens.json, the
// single source of Bright Blue Base. Run `npm run tokens` after editing it.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Themed = { light: string; dark: string };

interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
}

export interface DesignTokens {
  color: { tokens: { name: string; value: Themed }[] };
  type: {
    families: Record<string, string>;
    groups: { family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: { name: string; value: string }[] };
  radius: { tokens: { name: string; value: string }[] };
  shadow: { tokens: { name: string; value: Themed }[] };
}

export const TOKENS_PATH = "docs/design-system/tokens.json";
export const OUTPUT_PATH = "src/styles/tokens.css";

const REFERENCE = /^\{([a-z0-9-]+)\}$/;

/** Light-mode colour values, with "{primary}" references resolved. */
function lightColors(tokens: DesignTokens): [string, string][] {
  const raw = new Map(tokens.color.tokens.map((t) => [t.name, t.value.light]));
  const resolve = (name: string, seen: Set<string>): string => {
    const value = raw.get(name);
    if (value === undefined) throw new Error(`Unknown colour token "${name}"`);
    const ref = REFERENCE.exec(value)?.[1];
    if (!ref) return value;
    if (seen.has(ref))
      throw new Error(`Circular colour reference at "${name}"`);
    return resolve(ref, new Set([...seen, name]));
  };
  return [...raw.keys()].map((name) => [name, resolve(name, new Set())]);
}

const decl = (name: string, value: string | number) => `  --${name}: ${value};`;

export function buildTokensCss(tokens: DesignTokens): string {
  const colors = lightColors(tokens);
  const radius = tokens.radius.tokens;
  const radiusMd = radius.find((t) => t.name === "radius-md");
  if (!radiusMd) throw new Error('Missing "radius-md" token');

  const root = [
    ...colors.map(([name, value]) => decl(name, value)),
    // shadcn components size their corners from --radius.
    decl("radius", radiusMd.value),
    ...tokens.spacing.tokens.map((t) => decl(t.name, t.value)),
  ];

  const themeInline = colors.map(([name]) =>
    decl(`color-${name}`, `var(--${name})`),
  );

  // next/font exposes each loaded family as --next-font-<role> (see layout.tsx).
  const fonts = Object.entries(tokens.type.families).map(([role, stack]) =>
    decl(`font-${role}`, `var(--next-font-${role}), ${stack}`),
  );
  const body = tokens.type.families.body;
  if (body) fonts.push(decl("font-sans", `var(--next-font-body), ${body}`));

  const textStyles = tokens.type.groups.flatMap((group) =>
    group.styles.flatMap((style) => [
      decl(`text-${style.name}`, style.fontSize),
      decl(`text-${style.name}--line-height`, style.lineHeight),
      decl(`text-${style.name}--font-weight`, style.fontWeight),
      ...(style.letterSpacing
        ? [decl(`text-${style.name}--letter-spacing`, style.letterSpacing)]
        : []),
    ]),
  );

  const theme = [
    ...fonts,
    ...textStyles,
    ...radius.map((t) => decl(t.name, t.value)),
    ...tokens.shadow.tokens.map((t) => decl(t.name, t.value.light)),
  ];

  return [
    "/*",
    ` * GENERATED from ${TOKENS_PATH} by scripts/build-tokens.mts.`,
    " * Do not edit by hand: change the JSON and run `npm run tokens`.",
    " * Light theme only; dark mode is out of scope for the MVP.",
    " */",
    "",
    ":root {",
    ...root,
    "}",
    "",
    "@theme inline {",
    ...themeInline,
    "}",
    "",
    "@theme {",
    ...theme,
    "}",
    "",
  ].join("\n");
}

export function readTokens(path: string = TOKENS_PATH): DesignTokens {
  return JSON.parse(readFileSync(path, "utf8")) as DesignTokens;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT_PATH, buildTokensCss(readTokens()));
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
}
