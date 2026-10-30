/**
 * generate-mobile-icons.mjs
 * Run this from the CivicFix/client directory (where sharp is installed):
 *   node generate-mobile-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const MOBILE_ROOT = 'C:\\Users\\HomePC\\Documents\\SQI\\Web Dev - Level 3(July 2026)\\civicfix-mobile';
const BRAIN       = 'C:\\Users\\HomePC\\.gemini\\antigravity-ide\\brain\\66e04e80-c61e-4826-95ba-d61ce8db0f01';

const FULL_SRC = join(BRAIN, 'mobile_icon_1024_1793318424789.png');   // full icon (teal bg)
const FG_SRC   = join(BRAIN, 'mobile_icon_foreground_1793318445431.png'); // foreground only

const OUT = join(MOBILE_ROOT, 'assets', 'images');
mkdirSync(OUT, { recursive: true });

const TEAL = { r: 11, g: 79, b: 108, alpha: 1 };

async function resize(src, size, dest) {
  await sharp(src).resize(size, size).png().toFile(dest);
  console.log(`✅  ${size}×${size}  →  assets/images/${dest.split('\\').pop()}`);
}

async function solidBackground(size, dest) {
  await sharp({ create: { width: size, height: size, channels: 4, background: TEAL } })
    .png().toFile(dest);
  console.log(`✅  ${size}×${size} solid teal bg  →  assets/images/${dest.split('\\').pop()}`);
}

async function makeMonochrome(size, dest) {
  const buf = await sharp(FG_SRC).resize(size, size).greyscale().toBuffer();
  await sharp(buf).tint({ r: 255, g: 255, b: 255 }).png().toFile(dest);
  console.log(`✅  ${size}×${size} monochrome  →  assets/images/${dest.split('\\').pop()}`);
}

(async () => {
  try {
    await resize(FULL_SRC, 1024, join(OUT, 'icon.png'));
    await resize(FG_SRC,   1024, join(OUT, 'android-icon-foreground.png'));
    await makeMonochrome(  1024, join(OUT, 'android-icon-monochrome.png'));
    await solidBackground( 1024, join(OUT, 'android-icon-background.png'));
    await resize(FULL_SRC,  512, join(OUT, 'splash-icon.png'));
    await resize(FULL_SRC,   64, join(OUT, 'favicon.png'));
    console.log('\n🎉  All mobile icons generated successfully.');
  } catch (err) {
    console.error('\n❌  Failed:', err.message);
    process.exit(1);
  }
})();
