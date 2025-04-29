import { Jimp } from 'jimp';
import { OCRBox } from './extractTextBoxes';

export type PriceType = 'entry' | 'tp' | 'stop' | 'other';

export async function detectPriceColor(image: InstanceType<typeof Jimp>, box: OCRBox): Promise<PriceType> {
  try {
    const centerX = Math.floor(box.x + box.width / 2);
    const centerY = Math.floor(box.y + box.height / 2);

    const color = intToRGBA(image.getPixelColor(centerX, centerY));

    if (isGray(color)) {
      return 'entry';
    } else if (isGreen(color)) {
      return 'tp';
    } else if (isRed(color)) {
      return 'stop';
    } else {
      return 'other';
    }
  } catch (error) {
    console.error('Color detection error:', error);
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
function intToRGBA(color: number): { r: number; g: number; b: number; a: number } {
  return {
    r: (color >> 24) & 0xff,
    g: (color >> 16) & 0xff,
    b: (color >> 8) & 0xff,
    a: color & 0xff,
  };
}

