import { Jimp } from 'jimp';
import * as Tesseract from 'tesseract.js';

export async function extractSymbol(image: InstanceType<typeof Jimp>): Promise<string> {
  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      image.getBuffer('image/png', (err: Error | null, buf: Buffer) => {
        if (err) reject(err);
        else resolve(buf);
      });
    });

    const { data } = await Tesseract.recognize(buffer, 'eng', { 
      logger: () => {} 
    });

    const ocrText = data.text || '';
    const lines = ocrText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      console.warn('No text found in symbol area');
      return 'UNKNOWN';
    }

    const firstLine = lines[0];
    const firstWord = firstLine.split(' ')[0];

    if (!firstWord) {
      console.warn('No word found in first line');
      return 'UNKNOWN';
    }

    return firstWord.toUpperCase();
  } catch (error) {
    console.error('Symbol extraction error:', error);
    return 'UNKNOWN';
  }
}
