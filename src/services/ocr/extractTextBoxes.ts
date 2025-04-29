import { Jimp } from 'jimp';
import * as Tesseract from 'tesseract.js';

export interface OCRBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TesseractWord {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export async function extractTextBoxes(image: InstanceType<typeof Jimp>): Promise<OCRBox[]> {
  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      image.getBuffer('image/png', (err: Error | null, buffer: Buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });

    const { data } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {}
    });

    // Tesseract.js'den gelen veriyi doğrudan kullan
    const words = (data as any).words || [];

    const boxes: OCRBox[] = words.map((word: TesseractWord) => ({
      text: word.text,
      x: word.bbox.x0,
      y: word.bbox.y0,
      width: word.bbox.x1 - word.bbox.x0,
      height: word.bbox.y1 - word.bbox.y0
    }));

    return boxes;
  } catch (error) {
    console.error('OCR text extraction error:', error);
    return [];
  }
}
