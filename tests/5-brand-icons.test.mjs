import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Brand icon files served by the Next.js App Router conventions:
// src/app/favicon.ico -> /favicon.ico, src/app/icon.png, src/app/apple-icon.png.
// They must stay the handshake logo at the expected sizes.

function pngSize(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, "not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("app icon.png exists and is a 512x512 PNG", async () => {
  const buf = await readFile(new URL("../src/app/icon.png", import.meta.url));
  assert.deepEqual(pngSize(buf), { width: 512, height: 512 });
});

test("app apple-icon.png exists and is a 180x180 PNG", async () => {
  const buf = await readFile(new URL("../src/app/apple-icon.png", import.meta.url));
  assert.deepEqual(pngSize(buf), { width: 180, height: 180 });
});

test("app favicon.ico exists and embeds 16, 32 and 48 px icons", async () => {
  const buf = await readFile(new URL("../src/app/favicon.ico", import.meta.url));
  assert.equal(buf.readUInt16LE(0), 0, "bad ICO reserved field");
  assert.equal(buf.readUInt16LE(2), 1, "not an ICO file");
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const w = buf.readUInt8(6 + i * 16) || 256;
    const h = buf.readUInt8(7 + i * 16) || 256;
    sizes.push(`${w}x${h}`);
  }
  for (const expected of ["16x16", "32x32", "48x48"]) {
    assert.ok(sizes.includes(expected), `favicon.ico missing ${expected}, has ${sizes.join(", ")}`);
  }
});
