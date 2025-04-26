// src/test/testOCR.ts
import { Jimp } from 'jimp';
import { preprocessImage } from '../services/ocr/preprocessImage';
import { extractTextBoxes } from '../services/ocr/extractTextBoxes';
import { parseTradeData } from '../services/ocr/parseTradeData';

async function runOCRTest(imagePath: string) {
  try {
    console.log('📥 Görsel yükleniyor...');
    const image = await Jimp.read(imagePath);

    console.log('🎛 Görsel işleniyor...');
    const preprocessedImage = await preprocessImage(image);

    console.log('🔍 OCR yapılıyor...');
    const boxes = await extractTextBoxes(preprocessedImage);

    console.log('🧠 TradeData çıkarılıyor...');
    const tradeData = await parseTradeData(boxes, preprocessedImage, imagePath);

    if (tradeData) {
      console.log('✅ TradeData bulundu:');
      console.log(tradeData);
    } else {
      console.log('❗ TradeData çıkarılamadı.');
    }
  } catch (error) {
    console.error('🚨 Hata oluştu:', error);
  }
}

// ÖRNEK: Buraya test etmek istediğin görselin tam yolunu yaz!
const testImagePath = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot/example.png';

runOCRTest(testImagePath);
