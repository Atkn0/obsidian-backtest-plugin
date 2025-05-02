import sharp from 'sharp';
import { preprocessImage } from './preprocessImage';
import { extractTextBoxes } from './extractTextBoxes';
import { cropTopPanel } from './cropTopPanel';
import { extractSymbol } from './extractSymbol';
import { analyzePricePanel } from './analyzePricePanel';
import { TradeData } from '../../domain/models/tradeData';

export class OCRService {
  async extractTradeData(imagePath: string): Promise<TradeData | null> {
    try {
      console.log('📥 Loading image:', imagePath);
      const image = sharp(imagePath);
      
      console.log('🎨 Preprocessing image...');
      const preprocessed = await preprocessImage(image);

      console.log('🎯 Cropping top panel...');
      const topPanel = await cropTopPanel(image);
      
      console.log('🔤 Extracting symbol...');
      const symbol = await extractSymbol(topPanel);
      console.log('Symbol detected:', symbol);

      if (!symbol || symbol === 'UNKNOWN') {
        console.error('❌ Symbol detection failed');
        return null;
      }

      console.log('💹 Analyzing price panel...');
      const tradeData = await analyzePricePanel(imagePath, symbol);
      
      if (tradeData) {
        console.log('✅ Trade data extracted successfully:');
        console.log(tradeData);
        return tradeData;
      } else {
        console.error('❌ Price panel analysis failed');
        return null;
      }
    } catch (error) {
      console.error('❌ Error in OCR process:', error);
      return null;
    }
  }
}
