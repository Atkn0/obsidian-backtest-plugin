import { Jimp } from 'jimp';
import { cropTopPanel } from '../services/ocr/cropTopPanel';
import { extractSymbol } from '../services/ocr/extractSymbol';
import * as fs from 'fs';
import * as path from 'path';

function getLatestScreenshot(directoryPath: string): string {
  try {
    // Klasördeki tüm dosyaları al
    const files = fs.readdirSync(directoryPath)
      .map(file => ({
        name: file,
        path: path.join(directoryPath, file),
        stat: fs.statSync(path.join(directoryPath, file))
      }))
      // Sadece png, jpg ve jpeg dosyalarını filtrele
      .filter(file => /\.(png|jpg|jpeg)$/i.test(file.name))
      // Oluşturulma zamanına göre sırala (en yeni en üstte)
      .sort((a, b) => b.stat.birthtimeMs - a.stat.birthtimeMs);

    if (files.length === 0) {
      throw new Error('Screenshot klasöründe görüntü dosyası bulunamadı!');
    }

    return files[0].path;
  } catch (error) {
    console.error('Screenshot klasörü okunamadı:', error);
    throw error;
  }
}

async function testSymbolExtraction() {
  try {
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    const imagePath = getLatestScreenshot(screenshotFolder);
    
    console.log(`📥 En son eklenen görsel yükleniyor: ${path.basename(imagePath)}`);
    const originalImage = await Jimp.read(imagePath);
    const image = originalImage as InstanceType<typeof Jimp>;

    console.log('✂️ Üst panel kesiliyor...');
    const topPanel = await cropTopPanel(image);
    
    console.log('🔤 Sembol çıkarılıyor...');
    const symbol = await extractSymbol(topPanel);
    
    console.log('✅ Bulunan sembol:', symbol);
    return symbol;
  } catch (error) {
    console.error('🚨 Hata oluştu:', error);
    return null;
  }
}

// Testi çalıştır
testSymbolExtraction();