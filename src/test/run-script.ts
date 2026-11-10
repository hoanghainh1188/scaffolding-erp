// Runs one of the scripts/*.mts commands against the test database, so a
// test can read exactly what an operator would see.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ScriptOutput {
  code: number;
  output: string;
}

export async function runScript(
  script: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<ScriptOutput> {
  try {
    const { stdout, stderr } = await run(
      "node",
      ["--import", "./scripts/register-aliases.mjs", script, ...args],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
          ...env,
        },
      },
    );
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error: unknown) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failed.code ?? -1,
      output: `${failed.stdout ?? ""}${failed.stderr ?? ""}`,
    };
  }
}
