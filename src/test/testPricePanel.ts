import * as fs from 'fs';
import * as path from 'path';
import { extractPriceValues } from '../services/ocr/detectPriceColors';
import { extractPriceTexts } from '../services/ocr/extractPricePanelText';
import { analyzePricePanel } from '../services/ocr/analyzePricePanel';
import { extractSymbol } from '../services/ocr/extractSymbol';
import sharp from 'sharp';

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

async function testPriceExtraction() {
  try {
    console.log('\n🔍 FİYAT PANELİ TEST BAŞLADI 🔍\n');
    
    // Önceki test sonuçlarını temizle
    if (fs.existsSync('original_price_panel.png')) {
      fs.unlinkSync('original_price_panel.png');
      console.log('💥 Önceki original_price_panel.png silindi');
    }
    if (fs.existsSync('optimized_price_panel.png')) {
      fs.unlinkSync('optimized_price_panel.png');
      console.log('💥 Önceki optimized_price_panel.png silindi');
    }
    if (fs.existsSync('price_panel_debug.png')) {
      fs.unlinkSync('price_panel_debug.png');
      console.log('💥 Önceki price_panel_debug.png silindi');
    }
    
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    const imagePath = await getLatestScreenshot(screenshotFolder);
    
    console.log(`📄 Test ediliyor: ${path.basename(imagePath)}`);
    console.log(`📂 Tam dosya yolu: ${imagePath}`);
    
    // Sembol tespiti yap
    const image = sharp(imagePath);
    console.log('\n🔍 SEMBOL TESPİTİ BAŞLADI');
    const symbol = await extractSymbol(image);
    console.log(`✅ Tespit edilen sembol: ${symbol}\n`);
    
    console.log('=== İYİLEŞTİRİLMİŞ ANALİZ TESTİ ===');
    console.log('⚙️ Yeni iş akışı çalıştırılıyor...\n');
    
    // Tam analiz yap
    const tradeData = await analyzePricePanel(imagePath, symbol);
    
    // Debug için dosyaların oluşturulup oluşturulmadığını kontrol et
    console.log('\n=== DEBUG DOSYALARI KONTROL ===');
    if (fs.existsSync('original_price_panel.png')) {
      console.log('✅ original_price_panel.png başarıyla oluşturuldu');
      
      // Dosya boyutu bilgisi
      const stats = fs.statSync('original_price_panel.png');
      console.log(`   Boyut: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
      console.error('❌ original_price_panel.png oluşturulamadı');
    }
    
    if (fs.existsSync('optimized_price_panel.png')) {
      console.log('✅ optimized_price_panel.png başarıyla oluşturuldu');
      
      // Dosya boyutu bilgisi
      const stats = fs.statSync('optimized_price_panel.png');
      console.log(`   Boyut: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
      console.error('❌ optimized_price_panel.png oluşturulamadı');
    }
    
    console.log('\n=== ANALİZ SONUCU ===');
    if (tradeData) {
      console.log('✅ Trade Data başarıyla oluşturuldu:');
      console.log(JSON.stringify(tradeData, null, 2));
      
      console.log('\n🔹 Sembol:', tradeData.symbol);
      console.log('🔹 Entry (Giriş) Fiyatı:', tradeData.entry);
      console.log('🔹 Stop (Zarar Kes):', tradeData.stop);
      console.log('🔹 TP (Kar Al):', tradeData.takeProfit);
      
      // Kar/Zarar hesapla
      const direction = tradeData.takeProfit > tradeData.entry ? 'LONG' : 'SHORT';
      const riskPip = Math.abs(tradeData.entry - tradeData.stop);
      const rewardPip = Math.abs(tradeData.takeProfit - tradeData.entry);
      const riskRewardRatio = (rewardPip / riskPip).toFixed(2);
      
      console.log('\n🔹 İşlem Yönü:', direction);
      console.log('🔹 Risk (pip):', riskPip);
      console.log('🔹 Hedef (pip):', rewardPip);
      console.log('🔹 Risk/Ödül Oranı:', riskRewardRatio);
    } else {
      console.error('❌ Trade Data oluşturulamadı.\n');
      console.log('🔸 Sorun Giderme İpuçları:');
      console.log('   1. Ekran görüntüsündeki fiyat panelinin net olup olmadığını kontrol edin');
      console.log('   2. Debug görüntülerini inceleyerek OCR kalitesini değerlendirin');
      console.log('   3. Farklı bir ekran görüntüsü ile testi tekrarlayın');
    }
    
    console.log('\n🏁 TEST TAMAMLANDI 🏁');
    
  } catch (error) {
    console.error('\n❌ Test sırasında hata:', error);
  }
}

// Testi çalıştır
testPriceExtraction(); 