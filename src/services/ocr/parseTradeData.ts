import { Jimp } from 'jimp';
import { OCRBox } from './extractTextBoxes';
import { detectPriceColor } from './detectPriceColors';
import { TradeData } from '../../domain/models/tradeData';
import path from 'path';

export async function parseTradeData(boxes: OCRBox[], image: typeof Jimp.prototype, imagePath: string): Promise<TradeData | null> {
  let entryPrice: number | null = null;
  let takeProfitPrice: number | null = null;
  let stopLossPrice: number | null = null;
  let symbol: string = 'UNKNOWN';

  for (const box of boxes) {
    const priceType = await detectPriceColor(image, box);
    const cleanedText = box.text.replace(',', '').trim();
    const numericValue = parseFloat(cleanedText);

    if (isNaN(numericValue)) continue;

    if (priceType === 'entry' && entryPrice === null) {
      entryPrice = numericValue;
    } else if (priceType === 'tp' && takeProfitPrice === null) {
      takeProfitPrice = numericValue;
    } else if (priceType === 'stop' && stopLossPrice === null) {
      stopLossPrice = numericValue;
    }
  }

  if (!entryPrice || !takeProfitPrice || !stopLossPrice) {
    console.warn('❗ Tüm gerekli fiyatlar bulunamadı.');
    return null;
  }

  // Sembolü üst taraftan OCR çıktısından yakalamaya çalışıyoruz
  const firstLine = boxes
    .filter(b => b.y < 100) // İlk 100px içinde olan kutular (üst metin)
    .map(b => b.text)
    .join(' ');

  const symbolMatch = firstLine.match(/([A-Z]{3,6})/);
  if (symbolMatch) {
    symbol = symbolMatch[1];
  }

  const timestamp = extractTimestampFromFilename(imagePath);

  return {
    symbol,
    entry: entryPrice,
    stop: stopLossPrice,
    takeProfit: takeProfitPrice,
    timestamp
  };
}

function extractTimestampFromFilename(filePath: string): string {
  const base = path.basename(filePath);
  const match = base.match(/(\d{4}-\d{2}-\d{2}[_\-]\d{2}-\d{2})/);
  return match ? match[1].replace('_', ' ') : new Date().toISOString();
}
