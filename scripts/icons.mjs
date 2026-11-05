import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
for (const size of [192, 512]) await sharp(fileURLToPath(new URL('../public/icon.svg', import.meta.url))).resize(size).png().toFile(fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url)));