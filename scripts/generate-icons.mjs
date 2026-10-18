// Renders every icon from the master logo (resources/brand/flowed-mark.svg):
//  - public/icons/*        web manifest, favicon-size, iOS Home Screen icon
//  - resources/*.png       sources for `npm run assets` (native icons + splash)
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const master = readFileSync("resources/brand/flowed-mark.svg", "utf8").replace(/<!--[\s\S]*?-->/g, "");
const [, defs] = /<defs>([\s\S]*?)<\/defs>/.exec(master);
const body = master.slice(master.indexOf("</defs>") + 7, master.lastIndexOf("</svg>"));
const tile = /<rect id="tile"[^>]*\/>/.exec(body)[0];
const glyphStart = body.indexOf('<g id="glyph">');
const backdrop = body.slice(0, glyphStart).replace(tile, ""); // waves + highlight
const glyph = body.slice(glyphStart);                          // the "F" and droplets

/**
 * @param size   output px
 * @param opts.square   no rounded corners (platform applies its own mask)
 * @param opts.scale    shrink only the glyph into the platform's safe zone
 * @param opts.noTile   glyph only on transparent (Android adaptive foreground)
 */
function svg(size, { square = false, scale = 1, noTile = false } = {}) {
  const sq = (x) => (square ? x.replace(/rx="[^"]+"/g, 'rx="0"') : x);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}"><defs>${defs}</defs>
    ${noTile ? "" : sq(tile) + sq(backdrop)}<g transform="translate(60 60) scale(${scale}) translate(-60 -60)">${glyph}</g></svg>`;
}
const png = async (s, file) => writeFileSync(file, await sharp(Buffer.from(s)).png().toBuffer());
// iOS renders transparency in Home Screen icons as black: ship them fully opaque.
const opaque = async (s, file) => writeFileSync(file, await sharp(Buffer.from(s)).flatten({ background: "#4F46E5" }).png().toBuffer());
const splash = (size, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${bg}"/>
  <image href="data:image/svg+xml;base64,${Buffer.from(svg(560)).toString("base64")}" x="${(size - 560) / 2}" y="${(size - 560) / 2}" width="560" height="560"/></svg>`;

await png(svg(192), "public/icons/icon-192.png");
await png(svg(512), "public/icons/icon-512.png");
await png(svg(512, { square: true, scale: 0.8 }), "public/icons/maskable-512.png");
await opaque(svg(180, { square: true, scale: 0.92 }), "public/icons/apple-touch-icon.png");
// iOS also probes these root paths when adding to the Home Screen.
await opaque(svg(180, { square: true, scale: 0.92 }), "public/apple-touch-icon.png");
await opaque(svg(180, { square: true, scale: 0.92 }), "public/apple-touch-icon-precomposed.png");
// favicon.ico: an ICO container holding a 48px PNG (supported by all browsers).
{
  const img = await sharp(Buffer.from(svg(48))).png().toBuffer();
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); // reserved, type=icon, count
  head.writeUInt8(48, 6); head.writeUInt8(48, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(img.length, 14); head.writeUInt32LE(22, 18);
  writeFileSync("src/app/favicon.ico", Buffer.concat([head, img]));
}
await png(svg(1024, { square: true, scale: 0.92 }), "resources/icon.png");
await png(svg(1024, { noTile: true, scale: 0.62 }), "resources/icon-foreground.png");
await png(svg(1024, { square: true, scale: 0 }), "resources/icon-background.png");
await png(splash(2732, "#F7F7FB"), "resources/splash.png");
await png(splash(2732, "#0E0C1D"), "resources/splash-dark.png");
writeFileSync("public/brand/flowed-mark.svg", master);
console.log("icons generated from resources/brand/flowed-mark.svg");
