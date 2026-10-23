import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// A real, decodable, solid-color PNG at the given size — unlike a plain-text fake buffer, the
// browser can actually render this as an <img> (a browser-undecodable blob renders at zero
// dimensions, which Playwright reports as "hidden" even though the element/attributes exist).
// Needs real dimensions, not just a 1x1 pixel: compressImage()'s crop-to-ratio guarantee
// (branding 1:1, seo-og-image 1200/630 — M18-S03) now rejects sources too small to represent the
// required ratio, and a 1x1 source can't represent 1200/630 in whole pixels.
export function makeSolidPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor
  const ihdr = pngChunk('IHDR', ihdrData);

  const row = Buffer.alloc(1 + width * 3); // leading filter-type byte (0) + RGB triplets
  for (let x = 0; x < width; x++) row.fill(200, 1 + x * 3, 1 + x * 3 + 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = pngChunk('IDAT', deflateSync(raw));

  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}
