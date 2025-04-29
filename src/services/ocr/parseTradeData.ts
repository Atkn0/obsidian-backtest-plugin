import { Jimp } from 'jimp';
import { OCRBox } from './extractTextBoxes';
import { detectPriceColor } from './detectPriceColors';
import { TradeData } from '../../domain/models/tradeData';
import path from 'path';

export async function parseTradeData(
  boxes: OCRBox[],
  image: InstanceType<typeof Jimp>,
  imagePath: string,
  symbol: string
): Promise<TradeData | null> {
  let entryPrice: number | null = null;
  let takeProfitPrice: number | null = null;
  let stopLossPrice: number | null = null;

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

  if (entryPrice === null || takeProfitPrice === null || stopLossPrice === null) {
    console.warn('❗ Tüm gerekli fiyatlar bulunamadı.');
    return null;
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
