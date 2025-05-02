import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

// Renk kodları - Trading View ekranından alınan değerler (biraz daha geniş renk spektrumu)
const TP_COLOR = { r: 0, g: 255, b: 170 }; // Açık yeşil - TP değeri için
const TP_COLOR_ALT = { r: 100, g: 255, b: 200 }; // Alternatif yeşil ton

// Entry için daha geniş gri renk aralığı tanımlama
const ENTRY_COLOR = { r: 170, g: 170, b: 170 }; // Gri - Entry değeri için
const ENTRY_COLOR_ALT = { r: 200, g: 200, b: 200 }; // Açık gri - alternatif
const ENTRY_COLOR_LIGHT = { r: 220, g: 220, b: 220 }; // Daha açık gri
const ENTRY_COLOR_DARK = { r: 150, g: 150, b: 150 }; // Daha koyu gri
const ENTRY_COLOR_WARM = { r: 180, g: 175, b: 170 }; // Hafif sıcak gri (sarımsı)
const ENTRY_COLOR_COOL = { r: 170, g: 175, b: 180 }; // Hafif soğuk gri (mavimsi)

const STOP_COLOR = { r: 255, g: 45, b: 40 }; // Kırmızı - Stop değeri için
const STOP_COLOR_ALT = { r: 255, g: 100, b: 80 }; // Açık kırmızı - alternatif

// Entry için gri renklerin listesi
const ENTRY_COLORS = [
  ENTRY_COLOR,
  ENTRY_COLOR_ALT,
  ENTRY_COLOR_LIGHT,
  ENTRY_COLOR_DARK,
  ENTRY_COLOR_WARM,
  ENTRY_COLOR_COOL
];

// Renk eşleşmesi için tolerans değeri (genişletildi)
const COLOR_TOLERANCE = 50;

// Minimum genişlik (daha küçük renk gruplarını da tespit edebilmek için düşürüldü)
const MIN_WIDTH = 3;

export interface PriceBox {
  text: string;
  type: 'tp' | 'entry' | 'stop' | 'unknown';
  y: number; // Dikey konum (yukarıdan aşağıya sıralama için)
}

/**
 * Renk mesafesi (benzerlik) hesaplama
 */
function colorDistance(color1: { r: number, g: number, b: number }, color2: { r: number, g: number, b: number }): number {
  return Math.sqrt(
    Math.pow(color1.r - color2.r, 2) +
    Math.pow(color1.g - color2.g, 2) +
    Math.pow(color1.b - color2.b, 2)
  );
}

/**
 * Renk eşleşip eşleşmediğini kontrol et
 */
function isColorMatch(color1: { r: number, g: number, b: number }, color2: { r: number, g: number, b: number }, tolerance: number): boolean {
  return colorDistance(color1, color2) <= tolerance;
}

/**
 * Belirli bir rengin herhangi bir Entry rengiyle eşleşip eşleşmediğini kontrol et
 */
function isEntryColor(color: { r: number, g: number, b: number }, tolerance: number): boolean {
  // Tüm olası Entry renkleriyle karşılaştır
  return ENTRY_COLORS.some(entryColor => isColorMatch(color, entryColor, tolerance));
}

/**
 * Görüntüdeki sağ fiyat panelini izole et
 */
export async function isolatePricePanel(imagePath: string): Promise<sharp.Sharp> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  
  const width = metadata.width || 1000;
  const height = metadata.height || 700;
  
  // Sağ paneli ayıkla (son 100 piksel genişliğinde)
  return image.extract({
    left: width - 100,
    top: 0,
    width: 100,
    height: height
  });
}

/**
 * Fiyat değerlerini görüntüden çıkar
 */
export async function extractPriceValues(imagePath: string): Promise<PriceBox[]> {
  try {
    // İki olası yöntem var:
    // 1. İzole edilen orijinal panel varsa onu kullan (extractPriceTexts daha önce çalıştıysa)
    // 2. Yoksa yeni baştan izole et
    
    let pricePanel: sharp.Sharp;
    let panelBuffer: Buffer;
    
    if (fs.existsSync('original_price_panel.png')) {
      console.log('📌 Var olan renkli panel görüntüsü kullanılıyor...');
      pricePanel = sharp('original_price_panel.png');
      panelBuffer = await pricePanel.toBuffer();
    } else {
      console.log('📌 Yeni panel görüntüsü izole ediliyor...');
      // Sağ paneli izole et
      pricePanel = await isolatePricePanel(imagePath);
      
      // Debug için paneli kaydet
      panelBuffer = await pricePanel.toBuffer();
      fs.writeFileSync('price_panel_debug.png', panelBuffer);
    }
    
    // Piksel verilerini analiz et
    const { data, info } = await pricePanel.raw().toBuffer({ resolveWithObject: true });
    
    // Renk gruplarını bul
    const colorGroups: { y: number, color: { r: number, g: number, b: number }, width: number, type: 'tp' | 'entry' | 'stop' | 'unknown' }[] = [];
    
    // Her pikseli kontrol et ve renk gruplarını oluştur
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // TP, Entry veya Stop renklerinden birine yakın mı kontrol et
        const color = { r, g, b };
        let type: 'tp' | 'entry' | 'stop' | 'unknown' = 'unknown';
        
        // Renk tipleri için tüm alternatif renkleri kontrol et
        if (isColorMatch(color, TP_COLOR, COLOR_TOLERANCE) || 
            isColorMatch(color, TP_COLOR_ALT, COLOR_TOLERANCE)) {
          type = 'tp';
        } else if (isEntryColor(color, COLOR_TOLERANCE)) {
          type = 'entry';
        } else if (isColorMatch(color, STOP_COLOR, COLOR_TOLERANCE) || 
                   isColorMatch(color, STOP_COLOR_ALT, COLOR_TOLERANCE)) {
          type = 'stop';
        } else {
          // Bilinmeyen renk, atla
          continue;
        }
        
        // Bu konumda renk grubu var mı kontrol et
        const existingGroup = colorGroups.find(group => 
          Math.abs(group.y - y) < 5 && group.type === type
        );
        
        if (existingGroup) {
          // Mevcut grubu güncelle
          existingGroup.width++;
        } else {
          // Yeni grup oluştur
          colorGroups.push({ y, color, width: 1, type });
        }
      }
    }
    
    // En geniş renk gruplarını seç (potansiyel fiyat değerleri)
    const significantGroups = colorGroups
      .filter(group => group.width > MIN_WIDTH) // Minimum genişlik filtresi
      .sort((a, b) => a.y - b.y); // Yukarıdan aşağıya sırala
    
    // Debug log
    console.log(`Bulunan potansiyel renk grupları: ${significantGroups.length}`);
    
    // Renklere göre fiyat tiplerini belirlenmişti, şimdi PriceBox'lara dönüştür
    const priceBoxes: PriceBox[] = [];
    
    // Her tür için en az bir kutu olsun
    const tpGroups = significantGroups.filter(g => g.type === 'tp');
    const entryGroups = significantGroups.filter(g => g.type === 'entry');
    const stopGroups = significantGroups.filter(g => g.type === 'stop');
    
    // TP gruplarından en az bir tane ekle (en geniş olanı)
    if (tpGroups.length > 0) {
      const bestTpGroup = tpGroups.sort((a, b) => b.width - a.width)[0];
      priceBoxes.push({
        text: '', // OCR ile doldurulacak
        type: 'tp',
        y: bestTpGroup.y
      });
    }
    
    // Entry gruplarından en az bir tane ekle
    if (entryGroups.length > 0) {
      const bestEntryGroup = entryGroups.sort((a, b) => b.width - a.width)[0];
      priceBoxes.push({
        text: '', // OCR ile doldurulacak
        type: 'entry',
        y: bestEntryGroup.y
      });
    }
    
    // Stop gruplarından en az bir tane ekle
    if (stopGroups.length > 0) {
      const bestStopGroup = stopGroups.sort((a, b) => b.width - a.width)[0];
      priceBoxes.push({
        text: '', // OCR ile doldurulacak
        type: 'stop',
        y: bestStopGroup.y
      });
    }
    
    // Eğer en az bir türden kutu bulunamadıysa tüm grupları ekle
    if (priceBoxes.length === 0) {
      for (const group of significantGroups) {
        priceBoxes.push({
          text: '', // OCR ile doldurulacak
          type: group.type,
          y: group.y
        });
      }
    }
    
    return priceBoxes;
  } catch (error) {
    console.error('Fiyat paneli analiz edilirken hata oluştu:', error);
    return [];
  }
}

/**
 * Renk analizi ile fiyat tipini belirle
 */
export function determinePriceType(color: { r: number, g: number, b: number }): 'tp' | 'entry' | 'stop' | 'unknown' {
  if (isColorMatch(color, TP_COLOR, COLOR_TOLERANCE) || 
      isColorMatch(color, TP_COLOR_ALT, COLOR_TOLERANCE)) {
    return 'tp';
  } else if (isEntryColor(color, COLOR_TOLERANCE)) {
    return 'entry';
  } else if (isColorMatch(color, STOP_COLOR, COLOR_TOLERANCE) || 
             isColorMatch(color, STOP_COLOR_ALT, COLOR_TOLERANCE)) {
    return 'stop';
  }
  
  return 'unknown';
}