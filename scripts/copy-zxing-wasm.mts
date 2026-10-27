// Copies the ZXing reader WebAssembly next to the app (goods-receipt design
// D2): the QR scanner loads it from /vendor, never from a CDN. Runs after
// every install; the file follows the installed zxing-wasm version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const target = join(root, "public/vendor/zxing_reader.wasm");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
