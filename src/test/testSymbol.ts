import sharp from 'sharp';
import { cropTopPanel } from '../services/ocr/cropTopPanel';
import { extractSymbol } from '../services/ocr/extractSymbol';
import * as fs from 'fs';
import * as path from 'path';

async function getRecentScreenshots(directoryPath: string): Promise<string[]> {
  try {
    const files = fs.readdirSync(directoryPath)
      .map(file => ({
        name: file,
        path: path.join(directoryPath, file),
        stat: fs.statSync(path.join(directoryPath, file))
      }))
      .filter(file => /\.(png|jpg|jpeg)$/i.test(file.name))
      .sort((a, b) => b.stat.birthtimeMs - a.stat.birthtimeMs)
      .slice(0, 5) // Son 5 ekran görüntüsü
      .map(file => file.path);

    return files;
  } catch (error) {
    console.error('Screenshot klasörü okunamadı:', error);
    return [];
  }
}

async function testSymbolExtraction() {
  try {
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    console.log('📂 Klasör taranıyor:', screenshotFolder);
    
    const screenshots = await getRecentScreenshots(screenshotFolder);
    if (screenshots.length === 0) {
      console.log('❌ Screenshot bulunamadı!');
      return;
    }
    
    console.log(`🖼️ ${screenshots.length} screenshot bulundu.`);
    
    // İlk ekran görüntüsünü kullan
    const imagePath = screenshots[0];
    console.log(`📄 Test ediliyor: ${path.basename(imagePath)}`);
    
    const image = sharp(imagePath);
    
    console.log('✂️ Üst panel kesiliyor...');
    const topPanel = await cropTopPanel(image);
    
    console.log('🔤 Symbol çıkarılıyor...');
    const symbol = await extractSymbol(topPanel);
    
    if (symbol && symbol !== 'UNKNOWN') {
      console.log('✅ Sembol bulundu:', symbol);
    } else {
      console.log('❌ Sembol bulunamadı.');
      
      // Direk görüntüden sembol çıkarmayı dene
      console.log('🔍 Alternatif yöntem deneniyor...');
      const altSymbol = await extractSymbol(imagePath);
      
      if (altSymbol && altSymbol !== 'UNKNOWN') {
        console.log('✅ Alternatif yöntemle sembol bulundu:', altSymbol);
      } else {
        console.log('❌ Sembol kesinlikle bulunamadı.');
      }
    }
  } catch (error) {
    console.error('❌ Test sırasında hata oluştu:', error);
  }
}

// Ana test fonksiyonunu güncelle
async function runTests() {
    console.log('=== Symbol Test ===');
    await testSymbolExtraction();
}

runTests();