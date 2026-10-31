import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off stylistic rules that conflict with Prettier.
  prettier,
  // All printing goes through printDocument() in src/lib/print.ts.
  {
    rules: {
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].map((object) => ({
          object,
          property: "print",
          message: "Dùng printDocument() trong src/lib/print.ts.",
        })),
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "print",
          message: "Dùng printDocument() trong src/lib/print.ts.",
        },
      ],
    },
  },
  {
    files: ["src/lib/print.ts", "src/lib/print.test.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-globals": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    ".claude/**",
  ]),
]);

export default eslintConfig;
