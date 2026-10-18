// Next.js 16 static export writes segment-prefetch payloads for nested
// routes as "tasks/__next.tasks/__PAGE__.txt", but the client requests
// "tasks/__next.tasks.__PAGE__.txt" (404 → slower navigation, no offline
// prefetch). Write the flat names the client asks for next to the originals.
import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("out");
let copied = 0;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("__next.")) await flatten(full, dir, e.name);
    else await walk(full);
  }
}
async function flatten(segDir, parent, prefix) {
  for (const e of await readdir(segDir, { withFileTypes: true })) {
    const full = path.join(segDir, e.name);
    if (e.isDirectory()) await flatten(full, parent, `${prefix}.${e.name}`);
    else { await copyFile(full, path.join(parent, `${prefix}.${e.name}`)); copied++; }
  }
}
await walk(OUT);
console.log(`segment prefetch: wrote ${copied} flat payload names`);
