import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { PriceBox, isolatePricePanel } from './detectPriceColors';

/**
 * Fiyat metinlerini panelden çıkar
 */
export async function extractPriceTexts(imagePath: string): Promise<PriceBox[]> {
  try {
    // Fiyat panelini izole et
    const pricePanel = await isolatePricePanel(imagePath);
    
    // Panel görüntüsünü geçici bir buffer'a dönüştür
    const buffer = await pricePanel.toBuffer();
    
    // Orijinal buffer'ı sakla (renkli panel için)
    fs.writeFileSync('original_price_panel.png', buffer);
    
    // Panel görüntüsünü OCR için optimize et - 2 farklı yöntem uygulayıp sonuçları birleştireceğiz
    
    // 1. Yöntem: Gri tonlama ve karşıtlık artırma
    const optimizedPanel1 = sharp(buffer)
      .greyscale() // Gri tonlama
      .normalize() // Renk normalleştirme
      .modulate({ brightness: 1.3 }) // Parlaklık artır
      .gamma(1.7); // Kontrast artır
    
    // 2. Yöntem: Orijinal görüntüyü iyileştirme - renkleri koruyarak
    const optimizedPanel2 = sharp(buffer)
      .normalize() // Renk normalleştirme
      .modulate({ brightness: 1.2, saturation: 1.3 }) // Parlaklık ve doygunluk artır
      .sharpen({ sigma: 1.5 }); // Keskinleştirme uygula
    
    // İki yöntemi birleştiren bir görüntü oluştur
    const optimizedBuffer1 = await optimizedPanel1.toBuffer();
    const optimizedBuffer2 = await optimizedPanel2.toBuffer();
    
    // Optimize edilmiş görüntülerden birini kaydet (debug için)
    fs.writeFileSync('optimized_price_panel.png', optimizedBuffer1);
    
    // OCR işlemini her iki buffer üzerinde gerçekleştir
    console.log('OCR işlemi başlatılıyor (1/2)...');
    const result1 = await performOCR(optimizedBuffer1);
    console.log('OCR işlemi başlatılıyor (2/2)...');
    const result2 = await performOCR(optimizedBuffer2);
    
    // İki OCR sonucunu birleştir
    const combinedText = result1.data.text + '\n' + result2.data.text;
    console.log('OCR Sonucu:', combinedText);
    
    // OCR sonucunu satırlara böl ve işle
    const lines = combinedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Tekrarlanan satırları kaldır
      .filter((line, index, self) => 
        self.indexOf(line) === index
      );
    
    console.log('Algılanan satırlar:', lines);
    
    // Her satırı işle
    const priceBoxes: PriceBox[] = [];
    
    // Tahmini görüntü yüksekliği
    const estimatedHeight = 700; // Safe default height
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Metin fiyat değeri içeriyor mu kontrol et (daha geniş sayı formatlarını tanı)
      // 1,000.00 gibi normal sayılar, 1000 gibi tamsayılar veya .5 gibi ondalık sayıları tanı
      const numericMatch = line.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+)|(\.\d+)/);
      
      if (numericMatch) {
        // Y pozisyonunu tahmin et (satır dizininin oranıyla)
        const y = Math.floor((i / lines.length) * estimatedHeight);
        
        // Aynı sayı için farklı formatta bir değer zaten var mı kontrol et
        const numericValue = parsePrice(numericMatch[0]);
        const existingBox = priceBoxes.find(box => {
          const boxValue = parsePrice(box.text);
          return boxValue !== null && numericValue !== null && 
            Math.abs(boxValue - numericValue) < 0.01;
        });
        
        if (!existingBox) {
          priceBoxes.push({
            text: numericMatch[0],
            type: 'unknown', // Daha sonra tipini belirleyeceğiz
            y
          });
        }
      }
    }
    
    console.log(`OCR ile ${priceBoxes.length} potansiyel fiyat değeri bulundu.`);
    return priceBoxes;
  } catch (error) {
    console.error('Price panel text extraction error:', error);
    return [];
  }
}

/**
 * OCR işlemini gerçekleştir
 */
async function performOCR(buffer: Buffer): Promise<Tesseract.RecognizeResult> {
  // Desteklenen ve daha basit seçenekler kullan
  return await Tesseract.recognize(
    buffer, 
    'eng',
    {
      logger: m => console.log(m)
    }
  );
}

/**
 * Metinden sayısal fiyat değerini çıkar
 */
export function parsePrice(text: string): number | null {
  try {
    if (!text) return null;
    
    // Virgülleri kaldır, nokta yerine virgül varsa düzelt
    const normalized = text.replace(/,/g, '');
    const numValue = parseFloat(normalized);
    
    if (isNaN(numValue)) {
      return null;
    }
    
    return numValue;
  } catch (error) {
    console.error('Fiyat ayrıştırma hatası:', error);
    return null;
  }
} 