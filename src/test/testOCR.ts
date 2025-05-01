// src/test/testOCR.ts
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { extractSymbol } from '../services/ocr/extractSymbol';

async function getLatestScreenshot(directoryPath: string): Promise<string> {
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

async function runOCRTest() {
  try {
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    const imagePath = await getLatestScreenshot(screenshotFolder);
    
    console.log(`📥 En son eklenen görsel yükleniyor: ${path.basename(imagePath)}`);
    
    // Görüntüyü Sharp ile yükle
    const image = sharp(imagePath);

    console.log('🔤 Symbol çıkarılıyor...');
    const symbol = await extractSymbol(image);

    if (symbol && symbol !== 'UNKNOWN') {
      console.log('✅ Symbol başarıyla çıkarıldı:', symbol);
    } else {
      console.log('❗ Symbol çıkarılamadı.');
    }
  } catch (error) {
    console.error('🚨 Hata oluştu:', error);
    if (error instanceof Error) {
      console.error('Hata detayı:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

// Testi çalıştır
runOCRTest();
