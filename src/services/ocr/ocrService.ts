import sharp from 'sharp';
import { preprocessImage } from './preprocessImage';
import { extractTextBoxes } from './extractTextBoxes';
import { parseTradeData } from './parseTradeData';
import { cropTopPanel } from './cropTopPanel';
import { extractSymbol } from './extractSymbol';
import { TradeData } from '../../domain/models/tradeData';

export class OCRService {
  async extractTradeData(imagePath: string): Promise<TradeData | null> {
    try {
      console.log('📥 Loading image:', imagePath);
      const image = sharp(imagePath);
      
      console.log('🎨 Preprocessing image...');
      const preprocessed = await preprocessImage(image);

      console.log('📦 Extracting text boxes...');
      const boxes = await extractTextBoxes(preprocessed);
      console.log('Found boxes:', boxes.length);
      boxes.forEach(box => console.log('Box text:', box.text));

      console.log('🎯 Cropping top panel...');
      const topPanel = await cropTopPanel(image);
      
      console.log('🔤 Extracting symbol...');
      const symbol = await extractSymbol(topPanel);
      console.log('Symbol detected:', symbol);

      console.log('💹 Parsing trade data...');
      const tradeData = await parseTradeData(boxes, preprocessed, imagePath, symbol);
      console.log('Trade data result:', tradeData);
      
      return tradeData;
    } catch (error) {
      console.error('❌ Error in OCR process:', error);
      return null;
    }
  }
}
