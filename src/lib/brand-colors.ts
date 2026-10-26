import tokens from "../../docs/design-system/tokens.json";

function lightColor(name: string): string {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`Missing colour token "${name}"`);
  return token.value.light;
}

/**
 * Colours needed outside CSS (manifest, browser theme colour), read from the
 * same tokens.json as tokens.css so they cannot drift.
 */
export const brandColors = {
  primary: lightColor("primary"),
  background: lightColor("background"),
} as const;
