import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Builds every raster icon from the SyncEstate SVGs in public/brand:
//   app-icon-dark.svg  charcoal tile with the green ribbon (home screens)
//   mark.svg           the ribbon alone (maskable icons, centred on charcoal)
//   favicon.svg        tuned to stay legible at 16-32 px
//   lockup.svg         mark + "SyncEstate" wordmark (wordmark and share image)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const brandDir = path.join(publicDir, 'brand');
const iconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const appIcon = path.join(brandDir, 'app-icon-dark.svg');
const mark = path.join(brandDir, 'mark.svg');
const favicon = path.join(brandDir, 'favicon.svg');
const lockup = path.join(brandDir, 'lockup.svg');

// Charcoal and paper from the SyncEstate palette.
const INK = { r: 15, g: 20, b: 25, alpha: 1 };
const PAPER = { r: 242, g: 244, b: 243, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// SVGs are vector, so render them large and let sharp scale down cleanly.
const svg = (file, size) => sharp(file, { density: Math.max(72, Math.ceil((72 * size) / 48) * 2) });

// Standard PWA icon sizes
const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

/** A full-bleed charcoal square with the mark inside the maskable safe zone. */
async function maskable(size) {
  // Safe zone is the inner 80% circle; the mark's box must fit inside it.
  const markSize = Math.round(size * 0.5);
  const markPng = await svg(mark, markSize).resize(markSize, markSize, { fit: 'contain', background: CLEAR }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: markPng, gravity: 'center' }])
    .png();
}

/** An .ico holding one 32 px PNG (every current browser reads PNG-in-ICO). */
function pngToIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(32, 6); // width
  header.writeUInt8(32, 7); // height
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, png]);
}

async function generateIcons() {
  console.log('Generating icons from the SyncEstate SVGs...');

  for (const size of sizes) {
    await svg(appIcon, size)
      .resize(size, size, { fit: 'contain', background: CLEAR })
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`  icons/icon-${size}x${size}.png`);
  }

  for (const size of [192, 512]) {
    await (await maskable(size)).toFile(path.join(iconsDir, `icon-${size}x${size}-maskable.png`));
    console.log(`  icons/icon-${size}x${size}-maskable.png`);
  }

  // Apple touch icon: iOS rounds the corners itself, so no transparency.
  for (const target of [path.join(iconsDir, 'apple-touch-icon.png'), path.join(brandDir, 'apple-touch-icon.png')]) {
    await (await maskable(180)).toFile(target);
  }
  console.log('  apple-touch-icon.png (icons/ and brand/)');

  // Brand files read by src/config/brand.ts.
  for (const size of [192, 512]) {
    await svg(appIcon, size).resize(size, size).png().toFile(path.join(brandDir, `icon-${size}x${size}.png`));
  }
  const favicon32 = await svg(favicon, 32).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(brandDir, 'favicon-32x32.png'), favicon32);
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), favicon32);
  fs.writeFileSync(path.join(brandDir, 'favicon.ico'), pngToIco(favicon32));
  console.log('  brand/icon-192x192.png, icon-512x512.png, favicon-32x32.png, favicon.ico');

  // Wordmark: the lockup at 96 px tall on a transparent background.
  await sharp(lockup, { density: 288 }).resize({ height: 96 }).png().toFile(path.join(brandDir, 'wordmark.png'));
  console.log('  brand/wordmark.png');

  // Share image: the lockup centred on paper, 1200 x 630.
  const lockupPng = await sharp(lockup, { density: 600 }).resize({ width: 720 }).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: PAPER } })
    .composite([{ input: lockupPng, gravity: 'center' }])
    .png()
    .toFile(path.join(brandDir, 'og.png'));
  console.log('  brand/og.png');

  console.log('\nAll icons generated successfully.');
}

generateIcons().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
