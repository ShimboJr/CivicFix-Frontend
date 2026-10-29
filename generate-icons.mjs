/**
 * generate-icons.mjs
 * Converts favicon.svg → all required raster icon sizes using sharp.
 *
 * Run from client/ directory:
 *   node generate-icons.mjs
 *
 * Outputs:
 *   public/icons/favicon-32.png          (32×32)
 *   public/icons/apple-touch-icon.png    (180×180)
 *   public/icons/icon-192.png            (192×192)
 *   public/icons/icon-512.png            (512×512)
 *   public/icons/maskable-512.png        (512×512 with safe-zone padding)
 *   public/icons/pwa-192x192.png         (replaces old file for vite-plugin-pwa)
 *   public/icons/pwa-512x512.png         (replaces old file for vite-plugin-pwa)
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_SVG   = join(__dirname, 'public/favicon.svg');

// Ensure output directory exists
mkdirSync(join(__dirname, 'public/icons'), { recursive: true });

async function makeIcon(size, outputPath, opts = {}) {
  const svgBuf = readFileSync(SRC_SVG);

  // For maskable icons, add safe-zone padding (inner 80% contains the mark)
  // Safe-zone = 10% padding on each side
  const padding = opts.maskable ? Math.round(size * 0.1) : 0;
  const innerSize = size - padding * 2;

  // Render SVG at inner size
  const rendered = await sharp(svgBuf)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  if (opts.maskable) {
    // Composite the inner icon centred on a full-bleed teal background
    await sharp({
      create: {
        width:      size,
        height:     size,
        channels:   4,
        background: { r: 11, g: 79, b: 108, alpha: 1 }, // #0B4F6C
      },
    })
      .composite([{ input: rendered, top: padding, left: padding }])
      .png()
      .toFile(outputPath);
  } else {
    await sharp(svgBuf)
      .resize(size, size)
      .png()
      .toFile(outputPath);
  }

  console.log(`✅  ${size}×${size}  →  ${outputPath}`);
}

(async () => {
  try {
    await makeIcon(32,  join(__dirname, 'public/icons/favicon-32.png'));
    await makeIcon(180, join(__dirname, 'public/icons/apple-touch-icon.png'));
    await makeIcon(192, join(__dirname, 'public/icons/icon-192.png'));
    await makeIcon(512, join(__dirname, 'public/icons/icon-512.png'));
    await makeIcon(512, join(__dirname, 'public/icons/maskable-512.png'), { maskable: true });
    // Aliases expected by vite-plugin-pwa config
    await makeIcon(192, join(__dirname, 'public/icons/pwa-192x192.png'));
    await makeIcon(512, join(__dirname, 'public/icons/pwa-512x512.png'));
    console.log('\n🎉  All icons generated successfully.');
  } catch (err) {
    console.error('Icon generation failed:', err);
    process.exit(1);
  }
})();
