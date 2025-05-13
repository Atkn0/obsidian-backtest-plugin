import * as fs from 'fs';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';

// Entry için gri renk tanımları
const ENTRY_COLORS = [
  { r: 170, g: 170, b: 170 }, // Standart gri
  { r: 200, g: 200, b: 200 }, // Açık gri
  { r: 220, g: 220, b: 220 }, // Daha açık gri
  { r: 150, g: 150, b: 150 }, // Daha koyu gri
  { r: 180, g: 175, b: 170 }, // Hafif sıcak gri (sarımsı)
  { r: 170, g: 175, b: 180 }  // Hafif soğuk gri (mavimsi)
];

// Renk toleransı
const COLOR_TOLERANCE = 40;

/**
 * İki renk arasındaki mesafeyi hesapla
 */
function colorDistance(c1: { r: number, g: number, b: number }, c2: { r: number, g: number, b: number }): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Piksel renginin entry rengi olup olmadığını kontrol et
 */
function isEntryColor(color: { r: number, g: number, b: number }): boolean {
  return ENTRY_COLORS.some(entryColor => 
    colorDistance(color, entryColor) <= COLOR_TOLERANCE
  );
}

/**
 * Entry kutusunu tespit et
 * 
 * @param panelBuffer Fiyat paneli görüntüsü buffer
 * @returns Tespit edilen entry kutusu veya null
 */
export async function findEntryBox(panelBuffer: Buffer): Promise<{ box: { x: number, y: number, width: number, height: number }, index: number } | null> {
  try {
    // Görüntüyü işle
    const { data, info } = await sharp(panelBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Entry rengindeki pikselleri bul
    const entryPixels: { x: number, y: number }[] = [];
    
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        if (isEntryColor({ r, g, b })) {
          entryPixels.push({ x, y });
        }
      }
    }
    
    console.log(`${entryPixels.length} adet gri entry pikseli bulundu.`);
    
    if (entryPixels.length === 0) {
      return null;
    }
    
    // Satır tabanlı gruplama - her satırdaki piksel sayısını hesapla
    let rowGroups: { y: number, count: number }[] = [];
    
    for (let y = 0; y < info.height; y++) {
      const pixelsInRow = entryPixels.filter(p => p.y === y).length;
      if (pixelsInRow > 5) { // En az 5 piksel genişliğinde olmalı
        rowGroups.push({ y, count: pixelsInRow });
      }
    }
    
    // Ardışık satırları birleştirerek kutuları tespit et
    const boxes: { x: number, y: number, width: number, height: number }[] = [];
    let currentBox: { minY: number, maxY: number, pixels: { x: number, y: number }[] } | null = null;
    
    for (let i = 0; i < rowGroups.length; i++) {
      const row = rowGroups[i];
      
      if (i > 0 && row.y - rowGroups[i-1].y <= 3) {
        // Ardışık satır, mevcut kutuya ekle
        if (currentBox) {
          currentBox.maxY = row.y;
          currentBox.pixels.push(...entryPixels.filter(p => p.y === row.y));
        }
      } else {
        // Önceki kutuyu kaydet
        if (currentBox) {
          const minX = Math.min(...currentBox.pixels.map(p => p.x));
          const maxX = Math.max(...currentBox.pixels.map(p => p.x));
          
          boxes.push({
            x: minX,
            y: currentBox.minY,
            width: maxX - minX + 1,
            height: currentBox.maxY - currentBox.minY + 1
          });
        }
        
        // Yeni kutu başlat
        currentBox = {
          minY: row.y,
          maxY: row.y,
          pixels: entryPixels.filter(p => p.y === row.y)
        };
      }
    }
    
    // Son kutuyu ekle
    if (currentBox) {
      const minX = Math.min(...currentBox.pixels.map(p => p.x));
      const maxX = Math.max(...currentBox.pixels.map(p => p.x));
      
      boxes.push({
        x: minX,
        y: currentBox.minY,
        width: maxX - minX + 1,
        height: currentBox.maxY - currentBox.minY + 1
      });
    }
    
    // Kutuları filtrele: minimum boyut gereksinimlerini karşılayanları al
    const filteredBoxes = boxes.filter(box => 
      box.width > 10 && // Minimum genişlik
      box.height > 3    // Minimum yükseklik
    );
    
    console.log(`${filteredBoxes.length} adet potansiyel entry kutusu tespit edildi.`);
    
    if (filteredBoxes.length === 0) {
      return null;
    }
    
    // Entry kutusu seçimi için puanlama
    const aspectScores = filteredBoxes.map(box => {
      const aspectRatio = box.width / box.height;
      return (aspectRatio >= 3 && aspectRatio <= 5) ? 1.0 : 
             (aspectRatio >= 2.5 && aspectRatio < 3) ? 0.8 : 
             (aspectRatio > 5 && aspectRatio <= 6) ? 0.7 : 
             (aspectRatio >= 2 && aspectRatio < 2.5) ? 0.6 :
             (aspectRatio > 6 && aspectRatio <= 7) ? 0.5 : 0.2;
    });
    
    // Ekran ortasına yakınlık puanı
    const screenMiddle = info.height / 2;
    const positionScores = filteredBoxes.map(box => {
      const boxMiddle = box.y + (box.height / 2);
      const distanceFromMiddle = Math.abs(boxMiddle - screenMiddle);
      const normalizedDistance = distanceFromMiddle / (screenMiddle);
      return Math.pow(1 - Math.min(normalizedDistance, 1), 1.5);
    });
    
    // Alan puanı
    const areaScores = filteredBoxes.map(box => {
      const area = box.width * box.height;
      return (area >= 100 && area <= 600) ? 1.0 : 
             (area > 600 && area <= 1000) ? 0.7 : 
             (area >= 50 && area < 100) ? 0.6 : 
             (area > 1000 && area <= 2000) ? 0.4 : 0.2;
    });
    
    // Toplam puanlar
    const totalScores = filteredBoxes.map((_, i) => 
      (aspectScores[i] * 0.4) + 
      (positionScores[i] * 0.3) + 
      (areaScores[i] * 0.3)
    );
    
    const bestIdx = totalScores.indexOf(Math.max(...totalScores));
    const bestBox = filteredBoxes[bestIdx];
    
    console.log(`En muhtemel Entry kutusu seçildi (index: ${bestIdx}, puan: ${totalScores[bestIdx].toFixed(2)})`);
    
    return { box: bestBox, index: bestIdx };
  } catch (error) {
    console.error('Entry kutusu tespiti sırasında hata:', error);
    return null;
  }
}

/**
 * Entry değerini çıkar
 * 
 * @param panelBuffer Fiyat paneli görüntüsü buffer
 * @param box Tespit edilen entry kutusu
 * @returns Entry fiyatı değeri (string) veya null
 */
export async function extractTextFromEntryBox(panelBuffer: Buffer, box: { x: number, y: number, width: number, height: number }): Promise<string | null> {
  try {
    // Kırpma koordinatlarını marjla birlikte hesapla
    const marginX = Math.floor(box.width * 0.2);
    const marginY = Math.floor(box.height * 0.5);
    
    // Görüntünün boyutlarını al
    const metadata = await sharp(panelBuffer).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;
    
    const cropX = Math.max(0, box.x - marginX);
    const cropY = Math.max(0, box.y - marginY);
    // Width ve height hesaplamaları
    const cropWidth = Math.min(box.width + (marginX * 2), imageWidth - cropX);
    const cropHeight = Math.min(box.height + (marginY * 2), imageHeight - cropY);
    
    // Sıfır veya negatif boyutlar için kontrol
    if (cropWidth <= 0 || cropHeight <= 0) {
      console.error('Geçersiz kırpma boyutları:', { cropX, cropY, cropWidth, cropHeight });
      return null;
    }
    
    // Entry kutusunu kırp
    const entryBoxImage = await sharp(panelBuffer)
      .extract({ 
        left: cropX, 
        top: cropY, 
        width: cropWidth, 
        height: cropHeight 
      })
      .extend({ top:4, bottom:4, left:4, right:4, background:{r:255,g:255,b:255,alpha:1} })
      .toBuffer();
    
    // Debug için kutuyu kaydet
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entry_box_original_${timestamp}.png`;
    fs.writeFileSync(filename, entryBoxImage);
    
    // OCR için farklı işleme yöntemleri
    const processed1 = await sharp(entryBoxImage)
      .resize({ height: cropHeight * 4 })
      .sharpen()
      .normalize()
      .toBuffer();
    
    const processed2 = await sharp(entryBoxImage)
      .resize({ height: cropHeight * 4 })
      .modulate({ brightness: 1.2, saturation: 0.1 })
      .sharpen()
      .toBuffer();
    
    const processed3 = await sharp(entryBoxImage)
      .resize({ height: cropHeight * 5 })
      .toColourspace('b-w')
      .normalize()
      .threshold(170)
      .extend({top:10, bottom:10, left:10, right:10, background:'white'})
      .toBuffer();
    
    // OCR işlemi
    console.log('Çoklu OCR işlemi gerçekleştiriliyor...');
    
    const defaultOpts = { logger: () => {} };
    const singleOpts = { 
      logger: () => {}, 
      tessedit_pageseg_mode: '7', 
      tessedit_char_whitelist: '0123456789.,+-$€£¥₺%' 
    };
    
    const r1 = await Tesseract.recognize(processed1, 'eng', defaultOpts);
    const r2 = await Tesseract.recognize(processed2, 'eng', singleOpts);
    const r3 = await Tesseract.recognize(processed3, 'eng', singleOpts);
    
    console.log(`OCR1: "${r1.data.text.trim()}" (${r1.data.confidence.toFixed(1)}%)`);
    console.log(`OCR2: "${r2.data.text.trim()}" (${r2.data.confidence.toFixed(1)}%)`);
    console.log(`OCR3: "${r3.data.text.trim()}" (${r3.data.confidence.toFixed(1)}%)`);
    
    // En iyi sonucu seç
    const confs = [r1.data.confidence, r2.data.confidence, r3.data.confidence];
    const best = confs.indexOf(Math.max(...confs));
    let val = [r1, r2, r3][best].data.text.trim();
    
    // İlk olarak satır bazlı ayırma işlemi yap ve sadece ilk satırı al
    const lines = val.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length > 0) {
      val = lines[0]; // Sadece ilk satırı al
    }
    
    // Temizleme işlemleri
    val = val.replace(/[^\d.,+-]/g, '')
             .replace(/^[.,]/, '')
             .replace(/[.,]$/, '')
             .replace(/\.+/g, '.')
             .replace(/,+/g, ',')
             .trim();
    
    if (!val) {
      // Alternatif olarak r2 sonucunu dene
      const r2lines = r2.data.text.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (r2lines.length > 0) {
        val = r2lines[0].replace(/[^\d.,+-]/g, '').trim();
      }
    }
    
    console.log(`Temizlenmiş entry değeri: "${val}"`);
    return val || null;
  } catch (error) {
    console.error('Entry kutusundan metin çıkarma hatası:', error);
    return null;
  }
}

/**
 * Bir görüntüden entry fiyatını çıkar
 * 
 * @param imagePath Görüntü dosyası yolu
 * @returns Entry fiyatı değeri (number) veya null
 */
export async function extractEntryPrice(panelBuffer: Buffer): Promise<number | null> {
  try {
    console.log('\n=== ENTRY FİYAT TESPİT İŞLEMİ BAŞLADI ===\n');
    
    // Entry kutusunu tespit et
    console.log('\nEntry kutusu tespit ediliyor...');
    const res = await findEntryBox(panelBuffer);
    
    if (!res) {
      console.error('❌ Entry kutusu tespit edilemedi!');
      return null;
    }
    
    const box = res.box;
    
    // Entry kutusundan metni çıkar
    console.log('\nEntry kutusundan metin çıkarılıyor...');
    const entryValue = await extractTextFromEntryBox(panelBuffer, box);
    
    if (!entryValue) {
      console.error('❌ Entry değeri çıkarılamadı!');
      return null;
    }
    
    // Metni sayıya dönüştür
    const entryPrice = parseFloat(entryValue.replace(',', '.'));
    
    console.log(`\n✅ Tespit edilen Entry fiyatı: ${entryPrice}`);
    console.log('\n=== ENTRY FİYAT TESPİT İŞLEMİ TAMAMLANDI ===');
    
    return isNaN(entryPrice) ? null : entryPrice;
  } catch (error) {
    console.error('Entry fiyat tespiti sırasında hata:', error);
    return null;
  }
} 