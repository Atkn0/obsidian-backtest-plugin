import { preprocessImage } from './preprocessImage';
import { extractTextBoxes } from './extractTextBoxes';
import { parseTradeData } from './parseTradeData';
import { Jimp } from 'jimp';
import { TradeData } from '../../domain/models/tradeData';

export class OCRService {
  async extractTradeData(imagePath: string): Promise<TradeData | null> {
    const image = await Jimp.read(imagePath);
    const preprocessed = await preprocessImage(image);
    const boxes = await extractTextBoxes(preprocessed);
    const tradeData = await parseTradeData(boxes, preprocessed, imagePath);
    return tradeData;
  }
}
