import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';

/**
 * Basitleştirilmiş Entry Price Testi
 * 
 * Bu test, TradingView ekran görüntülerindeki gri entry kutuları tespit eder
 * ve bu kutulardan fiyat değerlerini çıkarır.
 */

// Entry için gri renk tanımları
const ENTRY_COLORS = [
  { r: 170, g: 170, b: 170 }, // Standart gri
  { r: 200, g: 200, b: 200 }  // Açık gri
];

// Renk toleransı
const COLOR_TOLERANCE = 40;

/**
 * En son ekran görüntüsünü al
 */
async function getLatestScreenshot(directoryPath: string): Promise<string> {
  const files = fs.readdirSync(directoryPath)
    .map(file => ({
      name: file,
      path: path.join(directoryPath, file),
      stat: fs.statSync(path.join(directoryPath, file))
    }))
    .filter(file => /\.(png|jpg|jpeg)$/i.test(file.name))
    .sort((a, b) => b.stat.birthtimeMs - a.stat.birthtimeMs);

  if (files.length === 0) {
    throw new Error('Screenshot klasöründe görüntü bulunamadı!');
  }

  return files[0].path;
}

/**
 * Fiyat panelini izole et
 */
async function isolatePricePanel(imagePath: string): Promise<Buffer> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  
  const width = metadata.width || 1000;
  const height = metadata.height || 700;
  
  // Sağ paneli ayıkla (son 100 piksel genişliğinde)
  const pricePanel = image.extract({
    left: width - 100,
    top: 0,
    width: 100,
    height: height
  });
  
  // Panel görüntüsünü buffer'a dönüştür
  return await pricePanel.toBuffer();
}

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
 * Entry kutularını tespit et ve değerlendir
 */
async function findEntryBox(panelBuffer: Buffer): Promise<{ box: { x: number, y: number, width: number, height: number }, index: number } | null> {
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
  
  // GELİŞTİRİLMİŞ ENTRY KUTUSU SEÇİMİ:
  // TradingView'de entry kutuları için daha kapsamlı değerlendirme yapıyoruz
  
  // 1. Şekil ve Oran Puanlaması: Entry kutularının genişlik/yükseklik oranı genellikle 3-5 arasındadır
  const aspectScores = filteredBoxes.map(box => {
    const aspectRatio = box.width / box.height;
    // İdeal oran: 3-5 arası (1.0 puan)
    // Kabul edilebilir aralık: 2-7 arası (0.5-0.8 puan)
    // Diğer oranlar daha düşük puan alır
    return (aspectRatio >= 3 && aspectRatio <= 5) ? 1.0 : 
           (aspectRatio >= 2.5 && aspectRatio < 3) ? 0.8 : 
           (aspectRatio > 5 && aspectRatio <= 6) ? 0.7 : 
           (aspectRatio >= 2 && aspectRatio < 2.5) ? 0.6 :
           (aspectRatio > 6 && aspectRatio <= 7) ? 0.5 : 0.2;
  });
  
  // 2. Konum Puanlaması: Entry kutuları genellikle ekranın orta bölgesinde yer alır
  const screenMiddle = info.height / 2;
  const positionScores = filteredBoxes.map(box => {
    const boxMiddle = box.y + (box.height / 2);
    const distanceFromMiddle = Math.abs(boxMiddle - screenMiddle);
    const normalizedDistance = distanceFromMiddle / (info.height / 2); // 0-1 arası normalize et
    
    // Orta kısma yakınlık puanı (1'e yakın = daha iyi)
    // Quadratic decay - ortadan uzaklaştıkça puan daha hızlı düşer
    return Math.pow(1 - Math.min(normalizedDistance, 1), 1.5);
  });
  
  // 3. Boyut Puanlaması: Entry kutuları genellikle ne çok büyük ne de çok küçük olur
  const areaScores = filteredBoxes.map(box => {
    const area = box.width * box.height;
    // İdeal alan: 150-400 piksel karesi
    return (area >= 150 && area <= 400) ? 1.0 : 
           (area > 400 && area <= 600) ? 0.8 : 
           (area >= 100 && area < 150) ? 0.7 : 
           (area > 600 && area <= 800) ? 0.6 : 
           (area >= 50 && area < 100) ? 0.4 : 
           (area > 800 && area <= 1000) ? 0.3 : 0.1;
  });
  
  // 4. Doluluk Oranı Puanlaması: Entry kutuları genellikle homojen gri renk dağılımına sahiptir
  const fillScores = filteredBoxes.map(box => {
    // Kutu içindeki gri piksel sayısını hesapla
    const boxPixels = entryPixels.filter(p => 
      p.x >= box.x && p.x < box.x + box.width && 
      p.y >= box.y && p.y < box.y + box.height
    );
    
    // Doluluk oranı: kutu içindeki gri pikseller / toplam kutu alanı
    const fillRatio = boxPixels.length / (box.width * box.height);
    
    // İdeal doluluk: %40-70 arası
    return (fillRatio >= 0.4 && fillRatio <= 0.7) ? 1.0 :
           (fillRatio > 0.7 && fillRatio <= 0.9) ? 0.8 :
           (fillRatio >= 0.3 && fillRatio < 0.4) ? 0.7 :
           (fillRatio > 0.9) ? 0.4 :
           (fillRatio >= 0.2 && fillRatio < 0.3) ? 0.3 : 0.1;
  });
  
  // 5. Yatay Konum Puanlaması: Entry kutuları genellikle panel ortasına yakın olur
  const horizontalScores = filteredBoxes.map(box => {
    const panelMidX = info.width / 2;
    const boxMidX = box.x + (box.width / 2);
    const distanceFromCenter = Math.abs(boxMidX - panelMidX);
    const normalizedDistance = distanceFromCenter / (info.width / 2);
    
    // Merkeze yakınlık puanı
    return 1 - Math.min(normalizedDistance, 1);
  });
  
  // Toplam puanları hesapla - ağırlıklı ortalama
  const totalScores = filteredBoxes.map((_, i) => {
    // Puanları ağırlıklarına göre topla
    return (aspectScores[i] * 0.25) +     // Şekil ve oran: %25
           (positionScores[i] * 0.25) +   // Konum: %25
           (areaScores[i] * 0.2) +        // Boyut: %20
           (fillScores[i] * 0.2) +        // Doluluk: %20
           (horizontalScores[i] * 0.1);   // Yatay konum: %10
  });
  
  // Puanlama detayını loglama
  filteredBoxes.forEach((box, i) => {
    console.log(`Box ${i+1}: x=${box.x}, y=${box.y}, genişlik=${box.width}, yükseklik=${box.height}`);
    console.log(`  > Oran: ${(box.width/box.height).toFixed(1)} (Puan: ${aspectScores[i].toFixed(2)})`);
    console.log(`  > Konum: ${positionScores[i].toFixed(2)}, Alan: ${(box.width*box.height)} (${areaScores[i].toFixed(2)})`);
    console.log(`  > Doluluk: ${fillScores[i].toFixed(2)}, Yatay: ${horizontalScores[i].toFixed(2)}`);
    console.log(`  > TOPLAM PUAN: ${totalScores[i].toFixed(2)}`);
  });
  
  // En yüksek puanlı kutuyu seç
  const bestBoxIndex = totalScores.indexOf(Math.max(...totalScores));
  const bestBox = filteredBoxes[bestBoxIndex];
  
  console.log(`En muhtemel entry kutusu seçildi (index: ${bestBoxIndex}, puan: ${totalScores[bestBoxIndex].toFixed(2)})`);
  console.log(`Entry kutusu: x=${bestBox.x}, y=${bestBox.y}, genişlik=${bestBox.width}, yükseklik=${bestBox.height}`);
  
  return { box: bestBox, index: bestBoxIndex };
}

/**
 * Tespit edilen entry kutularını görselleştir
 */
async function visualizeEntryBoxes(
  panelBuffer: Buffer, 
  bestBox: { x: number, y: number, width: number, height: number }, 
  allBoxes: { x: number, y: number, width: number, height: number }[],
  scores?: number[]
): Promise<void> {
  // Panelin boyutlarını al
  const metadata = await sharp(panelBuffer).metadata();
  const { width, height } = metadata;
  
  if (!width || !height) {
    throw new Error('Görüntü boyutları alınamadı.');
  }
  
  // Entry box'larını işaretle - en iyi kutu kırmızı, diğerleri sarı
  // Puanlar varsa onları da göster
  const svg = `
    <svg width="${width}" height="${height}">
      ${allBoxes.map((box, index) => {
        const isBest = box.x === bestBox.x && box.y === bestBox.y;
        const scoreInfo = scores ? ` (${scores[index].toFixed(2)})` : '';
        const boxColor = isBest ? 'red' : 'yellow';
        
        return `
          <rect 
            x="${box.x}" 
            y="${box.y}" 
            width="${box.width}" 
            height="${box.height}" 
            fill="none" 
            stroke="${boxColor}" 
            stroke-width="${isBest ? 2 : 1}"
            stroke-dasharray="${isBest ? '0' : '5,5'}"
          />
          <text 
            x="${box.x + box.width/2}" 
            y="${box.y - 3}" 
            font-family="Arial" 
            font-size="8" 
            fill="${boxColor}" 
            text-anchor="middle"
          >Box ${index + 1}${isBest ? ' (Entry)' : ''}${scoreInfo}</text>
          
          <!-- Kutu ölçülerini göster -->
          <text 
            x="${box.x + box.width/2}" 
            y="${box.y + box.height + 9}" 
            font-family="Arial" 
            font-size="7" 
            fill="${boxColor}" 
            text-anchor="middle"
          >${box.width}x${box.height}</text>
        `;
      }).join('')}
      
      <!-- İşlenmesi için marjinli alanı göster (sadece en iyi kutu için) -->
      <rect 
        x="${Math.max(0, bestBox.x - Math.floor(bestBox.width * 0.2))}" 
        y="${Math.max(0, bestBox.y - Math.floor(bestBox.height * 0.5))}" 
        width="${Math.min(bestBox.width + (Math.floor(bestBox.width * 0.2) * 2), width - Math.max(0, bestBox.x - Math.floor(bestBox.width * 0.2)))}" 
        height="${Math.min(bestBox.height + (Math.floor(bestBox.height * 0.5) * 2), height - Math.max(0, bestBox.y - Math.floor(bestBox.height * 0.5)))}" 
        fill="none" 
        stroke="rgba(0, 255, 0, 0.7)" 
        stroke-width="1" 
        stroke-dasharray="3,3"
      />
      
      <!-- OCR için işlenecek alan açıklaması -->
      <text 
        x="${bestBox.x + bestBox.width/2}" 
        y="${Math.max(0, bestBox.y - Math.floor(bestBox.height * 0.5)) - 5}" 
        font-family="Arial" 
        font-size="7" 
        fill="rgba(0, 255, 0, 0.9)" 
        text-anchor="middle"
      >OCR Region</text>
    </svg>
  `;
  
  // SVG overlay ekle
  const markedImage = await sharp(panelBuffer)
    .composite([{
      input: Buffer.from(svg),
      gravity: 'northwest'
    }])
    .toBuffer();
  
  fs.writeFileSync('entry_boxes_debug.png', markedImage);
  console.log('Entry kutuları görselleştirildi: entry_boxes_debug.png');
}

/**
 * Entry kutusundan metin çıkar
 */
async function extractTextFromEntryBox(panelBuffer: Buffer, box: { x: number, y: number, width: number, height: number }): Promise<string | null> {
  try {
    // MARGIN EKLENMİŞ KUTU: Kesilecek alanın her yönüne biraz boşluk ekle
    const marginX = Math.max(3, Math.floor(box.width * 0.15)); // Genişliğin %15'i kadar yatay kenar boşluğu
    const marginY = Math.max(2, Math.floor(box.height * 0.25)); // Yüksekliğin %25'i kadar dikey kenar boşluğu
    
    // Panel sınırlarını aşmamaya dikkat et
    const panelMetadata = await sharp(panelBuffer).metadata();
    const panelWidth = panelMetadata.width || 100;
    const panelHeight = panelMetadata.height || 700;
    
    // Margin'li kesilecek koordinatlar
    const extractLeft = Math.max(0, box.x - marginX);
    const extractTop = Math.max(0, box.y - marginY); 
    const extractWidth = Math.min(box.width + (marginX * 2), panelWidth - extractLeft);
    const extractHeight = Math.min(box.height + (marginY * 2), panelHeight - extractTop);
    
    // Ortak kırpılmış görüntüyü al
    const croppedBuffer = await sharp(panelBuffer)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight
      })
      .toBuffer();
    
    fs.writeFileSync('entry_box_original.png', croppedBuffer);
    
    // Birden fazla görüntü işleme yaklaşımı uygula
    
    // 1. OCR için ilk işlenmiş görüntü - Standart parametre seti
    const processedBuffer1 = await sharp(croppedBuffer)
      .greyscale()
      .normalise()
      .modulate({ brightness: 1.7 })
      .gamma(1.4)
      .sharpen({ sigma: 1.5 })
      .resize({ width: extractWidth * 5, height: extractHeight * 5 })
      .toBuffer();
    
    // 2. OCR için ikinci işlenmiş görüntü - Daha yüksek kontrast ve parlaklık
    const processedBuffer2 = await sharp(croppedBuffer)
      .greyscale()
      .normalise()
      .modulate({ brightness: 2.0 })
      .gamma(1.8)
      .sharpen({ sigma: 1.7 })
      .resize({ width: extractWidth * 5, height: extractHeight * 5 })
      .toBuffer();
    
    // 3. OCR için üçüncü işlenmiş görüntü - Binary eşikleme yaklaşımı
    const processedBuffer3 = await sharp(croppedBuffer)
      .greyscale()
      .normalise()
      .threshold(150)
      .resize({ width: extractWidth * 6, height: extractHeight * 6 })
      .toBuffer();
    
    fs.writeFileSync('entry_box_processed_1.png', processedBuffer1);
    fs.writeFileSync('entry_box_processed_2.png', processedBuffer2);
    fs.writeFileSync('entry_box_processed_3.png', processedBuffer3);
    
    console.log('Entry kutusu görüntüleri kaydedildi: entry_box_original.png, entry_box_processed_1-3.png');
    
    // Tüm işlenmiş görüntüler üzerinde OCR uygula
    console.log('Çoklu OCR işlemi gerçekleştiriliyor...');
    
    // Standart OCR seçenekleri
    const defaultOptions = {
      logger: () => {}
    };
    
    // Tek satır metin olduğunu bildiğimiz için PSM değeri ayarlanmış OCR seçenekleri
    const singleLineOptions = {
      logger: () => {},
      tessedit_pageseg_mode: "7" // PSM 7 - Tek satır metin
    };
    
    // Tüm görüntüler için OCR işlemlerini uygula
    const result1 = await Tesseract.recognize(processedBuffer1, 'eng', defaultOptions);
    const result2 = await Tesseract.recognize(processedBuffer2, 'eng', defaultOptions);
    const result3 = await Tesseract.recognize(processedBuffer3, 'eng', singleLineOptions);
    
    // Orijinal görüntü için de uygula
    const resultOrig = await Tesseract.recognize(processedBuffer1, 'eng', singleLineOptions);
    
    // OCR sonuçlarını göster
    console.log(`OCR Sonucu 1: "${result1.data.text.trim()}" (Güven: ${result1.data.confidence.toFixed(1)}%)`);
    console.log(`OCR Sonucu 2: "${result2.data.text.trim()}" (Güven: ${result2.data.confidence.toFixed(1)}%)`);
    console.log(`OCR Sonucu 3: "${result3.data.text.trim()}" (Güven: ${result3.data.confidence.toFixed(1)}%)`);
    console.log(`OCR Sonucu Orig: "${resultOrig.data.text.trim()}" (Güven: ${resultOrig.data.confidence.toFixed(1)}%)`);
    
    // Doğrudan OCR sonucu 3'ü kullan (en yüksek güvenli sonuç)
    const result3Text = result3.data.text.trim();
    
    // Sayıyı doğrudan sonuç 3'ten çıkarmaya çalış
    const directMatch3 = result3Text.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
    
    if (directMatch3) {
      let value = directMatch3[0];
      // Virgül ile başlayan değerlere sıfır ekle
      if (value.startsWith(',') || value.startsWith('.')) {
        value = '0' + value;
      }
      
      console.log(`OCR Sonucu 3'ten tespit edilen değer: "${value}" (Güven: ${result3.data.confidence.toFixed(1)}%)`);
      return value;
    }
    
    // Sonuç 3'te direk sayı bulunamadıysa, temizleme işlemi uygula
    const cleanedResult3 = result3Text
      .replace(/O|o|Q|D|0/g, '0')  // O, Q, D, 0 -> 0
      .replace(/l|I|i|!|\||1/g, '1') // l, I, i, !, |, 1 -> 1
      .replace(/S|s|5/g, '5')      // S, s, 5 -> 5
      .replace(/B|b|ß|8/g, '8')    // B, ß, 8 -> 8
      .replace(/Z|z|2/g, '2')      // Z, z, 2 -> 2
      .replace(/G|g|6/g, '6')      // G, g, 6 -> 6
      .replace(/T|t|7/g, '7')      // T, t, 7 -> 7
      .replace(/[^\d.,]/g, '');    // Rakam, nokta ve virgül dışındakileri temizle
    
    // Temizlenmiş metinden sayı çıkar
    const cleanedMatch3 = cleanedResult3.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
    
    if (cleanedMatch3) {
      let value = cleanedMatch3[0];
      if (value.startsWith(',') || value.startsWith('.')) {
        value = '0' + value;
      }
      
      console.log(`OCR Sonucu 3'ün temizlenmiş değeri: "${value}" (Güven: ${result3.data.confidence.toFixed(1)}%)`);
      return value;
    }
    
    // Diğer tüm OCR sonuçları ile devam et
    const allTexts = [
      result1.data.text.trim(),
      result2.data.text.trim(),
      result3.data.text.trim(),
      resultOrig.data.text.trim()
    ];
    
    // Tüm metinler için temizleme işlemleri
    const allCleanedTexts: string[] = [];
    
    for (const text of allTexts) {
      if (text && text.length > 0) {
        // Doğrudan eşleşen sayıları bul
        const directMatch = text.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
        
        if (directMatch) {
          allCleanedTexts.push(directMatch[0]);
        }
        
        // Temizlenen metinleri de kontrol et
        const cleaned = text
          .replace(/O|o|Q|D|0/g, '0') // O, Q, D, 0 -> 0
          .replace(/l|I|i|!|\||1/g, '1') // l, I, i, !, |, 1 -> 1
          .replace(/S|s|5/g, '5') // S, s, 5 -> 5
          .replace(/B|b|ß|8/g, '8') // B, ß, 8 -> 8
          .replace(/Z|z|2/g, '2') // Z, z, 2 -> 2
          .replace(/G|g|6/g, '6') // G, g, 6 -> 6
          .replace(/T|t|7/g, '7') // T, t, 7 -> 7
          .replace(/[^\d.,]/g, ''); // Rakam, nokta ve virgül dışındakileri temizle
        
        if (cleaned && cleaned.length > 0) {
          const cleanedMatch = cleaned.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
          
          if (cleanedMatch) {
            allCleanedTexts.push(cleanedMatch[0]);
          }
        }
      }
    }
    
    console.log("Tüm aday değerler:", allCleanedTexts);
    
    // Olası değerlerin sıklığını hesapla
    const valueCounts: Record<string, number> = {};
    
    for (const value of allCleanedTexts) {
      if (value in valueCounts) {
        valueCounts[value]++;
      } else {
        valueCounts[value] = 1;
      }
    }
    
    console.log("Değer sıklıkları:", valueCounts);
    
    // En sık tekrarlanan değeri bul
    let mostFrequent = "";
    let highestCount = 0;
    
    for (const [value, count] of Object.entries(valueCounts)) {
      if (count > highestCount) {
        highestCount = count;
        mostFrequent = value;
      } else if (count === highestCount) {
        // Eşitlikte uzun olan değeri tercih et (genellikle daha fazla bilgi içerir)
        if (value.length > mostFrequent.length) {
          mostFrequent = value;
        }
      }
    }
    
    // Eğer en sık tekrarlanan bir değer bulunamadıysa, tüm adaylar arasından en uzun olanı seç
    if (!mostFrequent && allCleanedTexts.length > 0) {
      mostFrequent = allCleanedTexts.sort((a, b) => b.length - a.length)[0];
    }
    
    // Son bir temizleme (virgül/nokta ile başlıyorsa)
    if (mostFrequent && (mostFrequent.startsWith(',') || mostFrequent.startsWith('.'))) {
      mostFrequent = '0' + mostFrequent;
    }
    
    if (mostFrequent) {
      console.log(`Tespit edilen en olası değer: "${mostFrequent}"`);
      return mostFrequent;
    }
    
    // Eğer hiçbir aday bulunamazsa, orijinal kodu çalıştır
    // Metni temizle ve sayıları çıkar
    const text = result1.data.text.trim();
    
    // İlk olarak normal sayı formatını ara
    const numericMatch = text.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
    
    if (numericMatch) {
      // Gerçek sayısal değeri temizle
      let value = numericMatch[0];
      // Virgül ile başlayan değerlere sıfır ekle
      if (value.startsWith(',') || value.startsWith('.')) {
        value = '0' + value;
      }
      
      console.log(`Tespit edilen değer: "${value}"`);
      return value;
    } 
    
    // Sayı bulunamadıysa, metni temizle ve tekrar dene
    const cleanedText = text
      .replace(/O|o|Q|D/g, '0') // O, Q, D harflerini 0 rakamına çevir
      .replace(/l|I|i|!|\|/g, '1') // l, I, i, !, | karakterlerini 1 rakamına çevir 
      .replace(/S|s/g, '5') // S harfini 5 rakamına çevir
      .replace(/B|b|ß/g, '8') // B, ß harflerini 8 rakamına çevir
      .replace(/Z|z/g, '2') // Z harfini 2 rakamına çevir
      .replace(/[^\d.,]/g, ''); // Rakam, nokta ve virgül dışındakileri temizle
    
    const rematched = cleanedText.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/);
    
    if (rematched && rematched[0]) {
      console.log(`Temizlenmiş metin değeri: "${rematched[0]}"`);
      return rematched[0];
    } 
    
    console.log('⚠️ Metinde sayısal değer bulunamadı.');
    return null;
  } catch (error) {
    console.error('Entry kutusundan metin çıkarma hatası:', error);
    return null;
  }
}

/**
 * Entry değerlerini test et
 */
async function testEntryPrice() {
  try {
    console.log('\n=== ENTRY FİYAT TESPİT TESTİ BAŞLADI ===\n');
    
    // Ekran görüntüsünü al
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    const imagePath = await getLatestScreenshot(screenshotFolder);
    
    console.log(`İşlenen görüntü: ${path.basename(imagePath)}`);
    
    // Fiyat panelini izole et
    console.log('\n1. Fiyat paneli izole ediliyor...');
    const panelBuffer = await isolatePricePanel(imagePath);
    fs.writeFileSync('price_panel.png', panelBuffer);
    console.log('Fiyat paneli kaydedildi: price_panel.png');
    
    // Entry kutusunu tespit et - sadece en iyi kutuyu al
    console.log('\n2. Entry kutusu tespit ediliyor...');
    const result = await findEntryBox(panelBuffer);
    
    if (!result) {
      console.error('❌ Entry kutusu tespit edilemedi!');
      return;
    }
    
    const { box: entryBox, index } = result;
    
    // Tüm kutuları ve puanları hesapla (görselleştirme için)
    const { data, info } = await sharp(panelBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
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
    
    // Satır grupları
    const rowGroups: { y: number, count: number }[] = [];
    for (let y = 0; y < info.height; y++) {
      const pixelsInRow = entryPixels.filter(p => p.y === y).length;
      if (pixelsInRow > 5) rowGroups.push({ y, count: pixelsInRow });
    }
    
    // Tüm kutuları hesapla
    const allBoxes: { x: number, y: number, width: number, height: number }[] = [];
    let currentBox: { minY: number, maxY: number, pixels: { x: number, y: number }[] } | null = null;
    
    for (let i = 0; i < rowGroups.length; i++) {
      const row = rowGroups[i];
      
      if (i > 0 && row.y - rowGroups[i-1].y <= 3) {
        if (currentBox) {
          currentBox.maxY = row.y;
          currentBox.pixels.push(...entryPixels.filter(p => p.y === row.y));
        }
      } else {
        if (currentBox) {
          const minX = Math.min(...currentBox.pixels.map(p => p.x));
          const maxX = Math.max(...currentBox.pixels.map(p => p.x));
          
          allBoxes.push({
            x: minX,
            y: currentBox.minY,
            width: maxX - minX + 1,
            height: currentBox.maxY - currentBox.minY + 1
          });
        }
        
        currentBox = {
          minY: row.y,
          maxY: row.y,
          pixels: entryPixels.filter(p => p.y === row.y)
        };
      }
    }
    
    if (currentBox) {
      const minX = Math.min(...currentBox.pixels.map(p => p.x));
      const maxX = Math.max(...currentBox.pixels.map(p => p.x));
      
      allBoxes.push({
        x: minX,
        y: currentBox.minY,
        width: maxX - minX + 1,
        height: currentBox.maxY - currentBox.minY + 1
      });
    }
    
    // Boyu/eni yeterli olan kutuları filtrele
    const filteredBoxes = allBoxes.filter(box => box.width > 10 && box.height > 3);
    
    // Puanlama hesapla (görselleştirme için)
    const scores: number[] = [];
    
    if (filteredBoxes.length > 0) {
      const screenMiddle = info.height / 2;
      
      // Oran puanları
      const aspectScores = filteredBoxes.map(box => {
        const aspectRatio = box.width / box.height;
        return (aspectRatio >= 3 && aspectRatio <= 5) ? 1.0 : 
               (aspectRatio >= 2.5 && aspectRatio < 3) ? 0.8 : 
               (aspectRatio > 5 && aspectRatio <= 6) ? 0.7 : 
               (aspectRatio >= 2 && aspectRatio < 2.5) ? 0.6 :
               (aspectRatio > 6 && aspectRatio <= 7) ? 0.5 : 0.2;
      });
      
      // Konum puanları
      const positionScores = filteredBoxes.map(box => {
        const boxMiddle = box.y + (box.height / 2);
        const distanceFromMiddle = Math.abs(boxMiddle - screenMiddle);
        const normalizedDistance = distanceFromMiddle / (info.height / 2);
        return Math.pow(1 - Math.min(normalizedDistance, 1), 1.5);
      });
      
      // Alan puanları
      const areaScores = filteredBoxes.map(box => {
        const area = box.width * box.height;
        return (area >= 150 && area <= 400) ? 1.0 : 
               (area > 400 && area <= 600) ? 0.8 : 
               (area >= 100 && area < 150) ? 0.7 : 
               (area > 600 && area <= 800) ? 0.6 : 
               (area >= 50 && area < 100) ? 0.4 : 
               (area > 800 && area <= 1000) ? 0.3 : 0.1;
      });
      
      // Doluluk puanları
      const fillScores = filteredBoxes.map(box => {
        const boxPixels = entryPixels.filter(p => 
          p.x >= box.x && p.x < box.x + box.width && 
          p.y >= box.y && p.y < box.y + box.height
        );
        const fillRatio = boxPixels.length / (box.width * box.height);
        return (fillRatio >= 0.4 && fillRatio <= 0.7) ? 1.0 :
               (fillRatio > 0.7 && fillRatio <= 0.9) ? 0.8 :
               (fillRatio >= 0.3 && fillRatio < 0.4) ? 0.7 :
               (fillRatio > 0.9) ? 0.4 :
               (fillRatio >= 0.2 && fillRatio < 0.3) ? 0.3 : 0.1;
      });
      
      // Yatay konum puanları
      const horizontalScores = filteredBoxes.map(box => {
        const panelMidX = info.width / 2;
        const boxMidX = box.x + (box.width / 2);
        const distanceFromCenter = Math.abs(boxMidX - panelMidX);
        const normalizedDistance = distanceFromCenter / (info.width / 2);
        return 1 - Math.min(normalizedDistance, 1);
      });
      
      // Toplam puanları hesapla - görselleştirme için
      for (let i = 0; i < filteredBoxes.length; i++) {
        const totalScore = (aspectScores[i] * 0.25) + 
                           (positionScores[i] * 0.25) + 
                           (areaScores[i] * 0.2) + 
                           (fillScores[i] * 0.2) + 
                           (horizontalScores[i] * 0.1);
        scores.push(totalScore);
      }
    }
    
    // Entry kutularını görselleştir - puanları da geçir
    console.log('\n3. Entry kutuları görselleştiriliyor...');
    await visualizeEntryBoxes(panelBuffer, entryBox, filteredBoxes, scores);
    
    // Sadece entry kutusundan metni çıkar
    console.log('\n4. Entry kutusundan metin çıkarılıyor...');
    const entryValue = await extractTextFromEntryBox(panelBuffer, entryBox);
    
    // Sonuçları göster
    console.log('\n=== ENTRY FİYAT SONUÇLARI ===');
    
    if (entryValue) {
      console.log(`\n✓ Tespit edilen entry fiyatı: ${entryValue}`);
    } else {
      console.error('❌ Entry değeri çıkarılamadı!');
    }
    
    console.log('\n=== TEST TAMAMLANDI ===');
  } catch (error) {
    console.error('Test sırasında hata oluştu:', error);
  }
}

// Testi çalıştır
testEntryPrice(); 