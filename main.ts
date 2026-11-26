// the-day-in-one-picture-26 — entry program for make.fun news-image-20261126.
//
// The artwork (entry.png) is a one-page newspaper front page summing up the
// world news of Thursday 26 November 2026: 36 dated stories across 9 regions,
// a UTC timeline, a world map, an ALSO ON briefs band and a DATE CHECK footer.
// It is committed next to this file. This program does one strict job: prove
// the image is really what the competition allows — a whole PNG or JPEG, at
// most 1 MiB, at most 1024x1024 — and only then copy it to the output
// directory. Anything off, and it fails loudly with exit code 1 instead of
// handing in a broken entry.
//
// Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Node 22, standard library only, no network.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1_048_576; // 1 MiB, the competition's size cap
const MAX_SIDE = 1024; // neither width nor height may exceed this

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "entry.png");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const target = join(outDir, "entry.png");

function fail(message: string): never {
  console.error(`the-day-in-one-picture-26: ${message}`);
  process.exit(1);
}

const bytes = readFileSync(source);

// --- how big is the file? -------------------------------------------------
if (bytes.length === 0) fail("entry.png is empty");
if (bytes.length > MAX_BYTES) {
  fail(`entry.png is ${bytes.length} bytes, over the ${MAX_BYTES}-byte cap`);
}

// --- what format is it, really? (trust the magic bytes, not the name) -----
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng =
  bytes.length >= 8 && PNG_MAGIC.every((b, i) => bytes[i] === b);
const isJpeg =
  bytes.length >= 3 &&
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

if (!isPng && !isJpeg) {
  fail("entry.png starts with neither the PNG nor the JPEG signature");
}

// --- dimensions ------------------------------------------------------------
// PNG: width/height are big-endian uint32s in IHDR, at offsets 16 and 20.
// JPEG: walk the marker segments to the first Start Of Frame (SOF0/1/2),
// which holds precision(1), height(2), width(2); stand-alone markers
// (TEM, RSTn, SOI, EOI) carry no length field, the rest do.
function jpegDimensions(data: Buffer): { width: number; height: number } | null {
  let at = 2; // past the SOI marker the signature check already confirmed
  while (at + 3 < data.length) {
    if (data[at] !== 0xff) return null;
    const marker = data[at + 1]!;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2; // stand-alone marker, no length
      continue;
    }
    const length = data.readUInt16BE(at + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      if (at + 9 > data.length) return null;
      return { height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

// --- PNG chunk integrity: a whole image, every chunk with its checksum ---
// CRC-32 (IEEE) over each chunk's type + data must equal the stored CRC,
// the chunk chain must end at IEND, and nothing may trail after it. This
// is the competition's own "whole image" rule, checked before I ship it.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function checkPngChunks(data: Buffer): void {
  let at = 8; // past the 8-byte signature
  let sawIend = false;
  while (at + 12 <= data.length) {
    const length = data.readUInt32BE(at);
    const type = data.toString("ascii", at + 4, at + 8);
    if (at + 12 + length > data.length) fail(`PNG chunk ${type} overruns the file`);
    const stored = data.readUInt32BE(at + 8 + length);
    const computed = crc32(data, at + 4, at + 8 + length);
    if (stored !== computed) fail(`PNG chunk ${type} fails its checksum`);
    at += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) fail("PNG has no IEND chunk");
  if (at !== data.length) fail("PNG has trailing bytes after IEND");
}

let dimensions = "unknown";
if (isPng) {
  if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    fail("entry.png has a PNG signature but no readable IHDR chunk");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) fail(`PNG dimensions are ${width}x${height}`);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    fail(`PNG is ${width}x${height}, over the ${MAX_SIDE}x${MAX_SIDE} limit`);
  }
  checkPngChunks(bytes);
  dimensions = `${width}x${height}`;
} else {
  const found = jpegDimensions(bytes);
  if (found === null) fail("entry.png has a JPEG signature but no readable frame segment");
  if (found.width > MAX_SIDE || found.height > MAX_SIDE) {
    fail(`JPEG is ${found.width}x${found.height}, over the ${MAX_SIDE}x${MAX_SIDE} limit`);
  }
  dimensions = `${found.width}x${found.height}`;
}

// --- ship it ---------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
copyFileSync(source, target);
const fingerprint = createHash("sha256").update(bytes).digest("hex").slice(0, 16);

console.log(
  `the-day-in-one-picture-26: ${isPng ? "PNG" : "JPEG"}, ${bytes.length} bytes, ` +
    `${dimensions}, sha256 ${fingerprint}… -> ${target}`,
);
