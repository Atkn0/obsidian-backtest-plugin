import Tesseract from 'tesseract.js';
import { Jimp } from 'jimp';

export interface OCRBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function extractTextBoxes(image: typeof Jimp.prototype): Promise<OCRBox[]> {
  const buffer = await image.getBufferAsync('image/png');

  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {}
  });

  const words = (data as any).words;

  if (!words) {
    return [];
  }

  const boxes: OCRBox[] = words.map((word: any) => ({
    text: word.text,
    x: word.bbox.x0,
    y: word.bbox.y0,
    width: word.bbox.x1 - word.bbox.x0,
    height: word.bbox.y1 - word.bbox.y0
  }));

  return boxes;
}
