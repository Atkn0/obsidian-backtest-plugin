import { Jimp, intToRGBA } from 'jimp';
import { OCRBox } from './extractTextBoxes';

export type PriceType = 'entry' | 'tp' | 'stop' | 'other';

export async function detectPriceColor(image: typeof Jimp.prototype, box: OCRBox): Promise<PriceType> {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  const pixelColor = intToRGBA(image.getPixelColor(centerX, centerY));

  if (isGray(pixelColor)) {
    return 'entry';
  } else if (isGreen(pixelColor)) {
    return 'tp';
  } else if (isRed(pixelColor)) {
    return 'stop';
  } else {
    return 'other';
  }
}

function isGray(color: { r: number; g: number; b: number }): boolean {
  return Math.abs(color.r - color.g) < 15 && Math.abs(color.r - color.b) < 15;
}

function isGreen(color: { r: number; g: number; b: number }): boolean {
  return color.g > color.r + 30 && color.g > color.b + 30;
}

function isRed(color: { r: number; g: number; b: number }): boolean {
  return color.r > color.g + 30 && color.r > color.b + 30;
}
