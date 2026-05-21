import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sourceImage = path.join(publicDir, 'SyncRM logo.png');

// Standard PWA icon sizes
const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

// Brand background color from globals.css
const BG = { r: 241, g: 245, b: 255, alpha: 1 };

async function generateIcons() {
  console.log('Generating PWA icons from SyncRM logo...');

  for (const size of sizes) {
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`  icon-${size}x${size}.png`);
  }

  // Maskable icon: logo must fit inside the W3C safe zone (inner 80% circle).
  // The safe-zone circle has radius = 512 * 0.4 = 204.8 px.
  // For a square logo, the corner-to-center diagonal is (side/2) * √2.
  // Solving (side/2) * √2 ≤ 204.8 gives side ≤ ~290 px (≈ 56% of 512).
  // We use 60% to give a small visual margin while staying safely inside the circle.
  const maskableSize = 512;
  const logoSize = Math.round(maskableSize * 0.60); // 60% keeps all corners inside the safe zone
  const padding = Math.round((maskableSize - logoSize) / 2);

  await sharp(sourceImage)
    .resize(logoSize, logoSize, { fit: 'contain', background: BG })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: BG })
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512-maskable.png'));
  console.log('  icon-512x512-maskable.png');

  // 192x192 maskable (same 60% safe-zone ratio) - preferred by Chrome for launcher icons
  const m192Logo = Math.round(192 * 0.60);
  const m192Padding = Math.round((192 - m192Logo) / 2);
  await sharp(sourceImage)
    .resize(m192Logo, m192Logo, { fit: 'contain', background: BG })
    .extend({ top: m192Padding, bottom: m192Padding, left: m192Padding, right: m192Padding, background: BG })
    .png()
    .toFile(path.join(iconsDir, 'icon-192x192-maskable.png'));
  console.log('  icon-192x192-maskable.png');

  // Apple touch icon (180x180, no transparency, white bg is fine)
  await sharp(sourceImage)
    .resize(160, 160, { fit: 'contain', background: BG })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: BG })
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('  apple-touch-icon.png');

  // Favicon-sized
  await sharp(sourceImage)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('  favicon-32x32.png (public root)');

  console.log('\nAll icons generated successfully.');
}

generateIcons().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
