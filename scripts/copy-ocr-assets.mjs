// Copies the offline OCR engine (tesseract.js worker, LSTM WASM cores and the
// compact English model) into public/ocr so schedule-photo scanning never
// touches a CDN. Runs before every build.
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/ocr");
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [`node_modules/tesseract.js-core/${f}`, f]),
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];
await mkdir(path.join(OUT, "lang"), { recursive: true });
let bytes = 0;
for (const [from, to] of files) {
  await copyFile(from, path.join(OUT, to));
  bytes += (await stat(from)).size;
}
console.log(`ocr assets: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB → public/ocr`);
