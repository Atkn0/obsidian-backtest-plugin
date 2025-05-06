import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';

/**
 * Basitleştirilmiş Stop Loss (SL) Price Testi
 *
 * Bu test, TradingView ekran görüntülerindeki kırmızı Stop Loss kutularını tespit eder
 * ve bu kutulardan fiyat değerlerini çıkarır.
 */

// Stop Loss için kırmızı/bordo renk tanımları (görüntüden alınmış)
const SL_COLORS = [
  // Kırmızı/bordo stop loss renkleri
  { r: 187, g: 59, b: 59 },    // Ana SL kutusu rengi (görüntüden)
  { r: 165, g: 42, b: 42 },    // Bordo/maroon
  { r: 178, g: 54, b: 54 },    // Alternatif SL rengi (açık bordo)
  { r: 158, g: 46, b: 56 },    // Alternatif SL rengi (görüntüden)
  { r: 220, g: 20, b: 60 },    // Crimson kırmızı
  { r: 200, g: 0, b: 0 },      // Koyu kırmızı
  { r: 255, g: 0, b: 0 },      // Parlak kırmızı
  
  // Daha koyu kırmızı tonları
  { r: 139, g: 0, b: 0 },      // Dark red
  { r: 128, g: 0, b: 0 },      // Maroon
  
  // İçinde bulunulan tema için daha esnek renkler
  { r: 180, g: 30, b: 30 },    // Orta kırmızı
  { r: 150, g: 30, b: 30 }     // Koyu kırmızı
];

// Renk toleransı - SL ve current price renkleri arasında daha iyi ayrım için
const COLOR_TOLERANCE = 40;  // Increased tolerance for better detection

// Current price için sadece kırmızı tonları
const CURRENT_PRICE_COLORS = [
  { r: 220, g: 20, b: 60 },   // Crimson kırmızı (düşüş)
  { r: 255, g: 0, b: 0 }      // Parlak kırmızı (düşüş)
];

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
 * Piksel renginin SL rengi olup olmadığını kontrol et
 */
function isStopColor(color: { r: number, g: number, b: number }): boolean {
  const isCloseToStopColor = SL_COLORS.some(slColor =>
    colorDistance(color, slColor) <= COLOR_TOLERANCE
  );
  if (isCloseToStopColor) {
    return differentiateStopFromCurrentPrice(color) === 'stop';
  }
  return false;
}

/**
 * Piksel renginin canlı fiyat rengi olup olmadığını kontrol et
 */
function isCurrentPriceColor(color: { r: number, g: number, b: number }): boolean {
  const isCloseToCurrentColor = CURRENT_PRICE_COLORS.some(currentColor =>
    colorDistance(color, currentColor) <= COLOR_TOLERANCE
  );
  if (isCloseToCurrentColor) {
    return differentiateStopFromCurrentPrice(color) === 'current';
  }
  return false;
}

/**
 * Piksel renginin SL rengi mi yoksa current price rengi mi olduğunu daha hassas ayırt et
 */
function differentiateStopFromCurrentPrice(color: { r: number, g: number, b: number }): 'stop' | 'current' | 'other' {
  // Stop Loss kutuları için kırmızı/bordo tonu (r yüksek, g ve b düşük)
  if (color.r > 120 && 
      color.g < 100 && 
      color.b < 100 && 
      color.r > color.g * 1.5 && 
      color.r > color.b * 1.5) {
    return 'stop'; // Kırmızı/bordo (Stop Loss)
  }
  
  // Alternatif kırmızı tonu kontrolü - daha geniş aralık
  if (color.r > 100 && 
      color.g < color.r * 0.6 && 
      color.b < color.r * 0.6) {
    return 'stop'; // Daha esnek kırmızı kontrolü
  }
  
  // Current price kırmızısı için parlak kırmızı (fiyat değişimi için)
  if (color.r > 220 && color.g < 50 && color.b < 50) {
    return 'current'; // Çok parlak kırmızı (düşüş)
  }
  
  return 'other';
}

/**
 * Stop kutusunun şekil ve boyutunun uygun olup olmadığını kontrol et
 */
function isStopBoxShape(box: { width: number, height: number }): boolean {
  const aspectRatio = box.width / box.height;
  const isValidAspect = aspectRatio >= 3 && aspectRatio <= 6;
  const area = box.width * box.height;
  const isValidSize = area >= 100 && area <= 500;
  return isValidAspect && isValidSize;
}

/**
 * En son ekran görüntüsünü al
 */
async function getLatestScreenshot(directoryPath: string): Promise<string> {
  const files = fs.readdirSync(directoryPath)
    .map(file => ({ name: file, path: path.join(directoryPath, file), stat: fs.statSync(path.join(directoryPath, file)) }))
    .filter(file => /\.(png|jpg|jpeg)$/i.test(file.name))
    .sort((a, b) => b.stat.birthtimeMs - a.stat.birthtimeMs);
  if (files.length === 0) throw new Error('Screenshot klasöründe görüntü bulunamadı!');
  return files[0].path;
}

/**
 * Fiyat panelini izole et (sağ panel genişliğini artırıldı, 300px)
 */
async function isolatePricePanel(imagePath: string): Promise<Buffer> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1000;
  const height = metadata.height || 700;
  const cropWidth = 300;
  const pricePanel = image.extract({ left: Math.max(0, width - cropWidth), top: 0, width: cropWidth, height: height });
  return await pricePanel.toBuffer();
}

/**
 * Stop Loss kutularını tespit et ve değerlendir
 */
async function findStopBox(panelBuffer: Buffer): Promise<{ box: { x: number, y: number, width: number, height: number }, index: number } | null> {
  // Görüntüyü işle
  const { data, info } = await sharp(panelBuffer).raw().toBuffer({ resolveWithObject: true });
  
  // DEBUG: Most common panel colors
  console.log('DEBUG: Panelde en sık görülen renkler analiz ediliyor...');
  const colorCount: Record<string, {count: number, rgb: {r: number, g: number, b: number}}> = {};
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const key = `${r},${g},${b}`;
      if (!colorCount[key]) {
        colorCount[key] = {count: 0, rgb: {r, g, b}};
      }
      colorCount[key].count++;
    }
  }
  
  const topColors = Object.entries(colorCount)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  
  console.log('Top 15 panel colors (RGB,count):');
  topColors.forEach(([key, {count, rgb}]) => {
    const isStop = isStopColor(rgb);
    console.log(`${key} (${count}x) ${isStop ? '- POSSIBLE SL COLOR!' : ''}`);
  });
  
  // Find all SL pixels
  const stopPixels: { x: number, y: number }[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      if (isStopColor({r, g, b})) {
        stopPixels.push({x, y});
      }
    }
  }
  
  console.log(`${stopPixels.length} adet kırmızı Stop Loss pikseli bulundu.`);
  
  // Debug: İlk birkaç pikselin renk değerlerini göster
  if (stopPixels.length > 0) {
    console.log('Bulunan SL renklerine örnekler:');
    for (let i = 0; i < Math.min(10, stopPixels.length); i++) {
      const px = stopPixels[i];
      const idx = (px.y * info.width + px.x) * info.channels;
      console.log(`Piksel ${i+1}: R=${data[idx]}, G=${data[idx+1]}, B=${data[idx+2]}`);
    }
  }
  
  if (stopPixels.length === 0) {
    console.log('HATA: Hiç kırmızı Stop Loss pikseli bulunamadı! Renk filtrelerinizi kontrol edin.');
    return null;
  }
  
  // SPECIAL HANDLING: If most pixels detected are from the dark theme background,
  // we need to look for clusters or regions with higher concentration of red pixels
  console.log('Daha yoğun kırmızı piksel bölgelerini tespit etme...');
  
  // Create a density map to find regions with higher concentration of red pixels
  const densityMap = new Array(info.height).fill(0).map(() => new Array(info.width).fill(0));
  
  // Calculate density by counting neighbors in a small window
  for (const pixel of stopPixels) {
    const windowSize = 5; // 5x5 window
    for (let dy = -windowSize; dy <= windowSize; dy++) {
      for (let dx = -windowSize; dx <= windowSize; dx++) {
        const nx = pixel.x + dx;
        const ny = pixel.y + dy;
        if (nx >= 0 && nx < info.width && ny >= 0 && ny < info.height) {
          densityMap[ny][nx]++;
        }
      }
    }
  }
  
  // Find regions with highest density
  let maxDensity = 0;
  let highDensityRegions: { x: number, y: number }[] = [];
  const densityThreshold = 5; // Minimum density to consider
  
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (densityMap[y][x] > maxDensity) {
        maxDensity = densityMap[y][x];
      }
      if (densityMap[y][x] >= densityThreshold) {
        highDensityRegions.push({ x, y });
      }
    }
  }
  
  console.log(`Maksimum piksel yoğunluğu: ${maxDensity}`);
  console.log(`${highDensityRegions.length} adet yüksek yoğunluklu piksel bölgesi bulundu.`);
  
  // Group high density pixels into clusters
  const clusters: { x: number, y: number, width: number, height: number }[] = [];
  
  if (highDensityRegions.length > 0) {
    // Group into clusters based on proximity
    const processed = new Set<string>();
    
    for (const point of highDensityRegions) {
      const key = `${point.x},${point.y}`;
      if (processed.has(key)) continue;
      
      // Start a new cluster
      const cluster: { x: number, y: number }[] = [point];
      processed.add(key);
      
      // Find connected points
      let i = 0;
      while (i < cluster.length) {
        const current = cluster[i];
        
        // Check 8-connected neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = current.x + dx;
            const ny = current.y + dy;
            const neighborKey = `${nx},${ny}`;
            
            if (
              !processed.has(neighborKey) && 
              highDensityRegions.some(p => p.x === nx && p.y === ny)
            ) {
              cluster.push({ x: nx, y: ny });
              processed.add(neighborKey);
            }
          }
        }
        
        i++;
      }
      
      // If cluster is large enough, calculate its bounding box
      if (cluster.length >= 10) {
        const minX = Math.min(...cluster.map(p => p.x));
        const maxX = Math.max(...cluster.map(p => p.x));
        const minY = Math.min(...cluster.map(p => p.y));
        const maxY = Math.max(...cluster.map(p => p.y));
        
        clusters.push({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        });
      }
    }
  }
  
  console.log(`${clusters.length} adet potansiyel Stop Loss bölgesi tespit edildi.`);
  
  // Satır tabanlı gruplama - her satırdaki piksel sayısını hesapla
  const rowGroups: { y: number, count: number }[] = [];
  for (let y = 0; y < info.height; y++) {
    const pixelsInRow = stopPixels.filter(p => p.y === y).length;
    if (pixelsInRow > 3) { // En az 3 piksel genişliğinde olmalı
      rowGroups.push({ y, count: pixelsInRow });
    }
  }
  
  console.log(`${rowGroups.length} satırda Stop Loss pikseli grupları bulundu.`);
  
  // Ardışık satırları birleştirerek kutuları tespit et
  const boxes: { x: number, y: number, width: number, height: number }[] = [];
  let currentBox: { minY: number, maxY: number, pixels: { x: number, y: number }[] } | null = null;
  
  for (let i = 0; i < rowGroups.length; i++) {
    const row = rowGroups[i];
    
    if (i > 0 && row.y - rowGroups[i-1].y <= 5) {
      // Ardışık satır, mevcut kutuya ekle
      if (currentBox) {
        currentBox.maxY = row.y;
        currentBox.pixels.push(...stopPixels.filter(p => p.y === row.y));
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
        pixels: stopPixels.filter(p => p.y === row.y)
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
  
  // Combine both types of boxes
  const allBoxes = [...boxes, ...clusters];
  
  // Kutuları filtrele
  const filteredBoxes = allBoxes.filter(box => {
    // Minimum size requirements
    const isLargeEnough = box.width >= 5 && box.height >= 3;
    
    // Avoid boxes that are excessively large (more than 95% of panel width or 70% of panel height)
    const isTooLarge = (box.width > info.width * 0.95) || (box.height > info.height * 0.7);
    
    // Any aspect ratio is acceptable for now
    return isLargeEnough && !isTooLarge;
  });
  
  console.log(`${filteredBoxes.length} adet potansiyel Stop Loss kutusu tespit edildi.`);
  
  if (filteredBoxes.length === 0) {
    // If we still have no boxes, check if there are any regions with a reasonable concentration of red pixels
    if (stopPixels.length > 100) {
      console.log('Alternatif yöntem deneniyor: Görüntüyü bölgelere ayırma...');
      
      // Divide the image into a grid and find the region with highest red pixel concentration
      const gridSize = 20; // 20x20 grid
      const gridCellWidth = Math.ceil(info.width / gridSize);
      const gridCellHeight = Math.ceil(info.height / gridSize);
      
      const grid: number[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
      
      // Count red pixels in each grid cell
      for (const pixel of stopPixels) {
        const gridX = Math.floor(pixel.x / gridCellWidth);
        const gridY = Math.floor(pixel.y / gridCellHeight);
        if (gridX < gridSize && gridY < gridSize) {
          grid[gridY][gridX]++;
        }
      }
      
      // Find the cell with highest concentration
      let maxCount = 0;
      let bestCell = { x: 0, y: 0 };
      
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          if (grid[y][x] > maxCount) {
            maxCount = grid[y][x];
            bestCell = { x, y };
          }
        }
      }
      
      console.log(`En yoğun bölge: (${bestCell.x}, ${bestCell.y}) - ${maxCount} piksel`);
      
      // Create a box around this region, slightly larger
      const bestBox = {
        x: Math.max(0, bestCell.x * gridCellWidth - gridCellWidth/2),
        y: Math.max(0, bestCell.y * gridCellHeight - gridCellHeight/2),
        width: Math.min(info.width, gridCellWidth * 2),
        height: Math.min(info.height, gridCellHeight * 2)
      };
      
      console.log(`Alternatif Stop Loss kutusu oluşturuldu: x=${bestBox.x}, y=${bestBox.y}, w=${bestBox.width}, h=${bestBox.height}`);
      
      return { box: bestBox, index: 0 };
    }
    
    console.log('HATA: Kutu filtreleme sonrası hiç uygun Stop Loss kutusu kalmadı!');
    return null;
  }
  
  // Puanlama ile en iyi kutuyu seç
  const aspectScores = filteredBoxes.map(box => {
    const aspectRatio = box.width / box.height;
    // Allow wider range of aspect ratios
    return (aspectRatio >= 2 && aspectRatio <= 8) ? 1.0 : 
           (aspectRatio >= 1 && aspectRatio < 2) ? 0.7 : 
           (aspectRatio > 8 && aspectRatio <= 12) ? 0.5 : 0.3;
  });
  
  const screenMiddle = info.height / 2;
  const positionScores = filteredBoxes.map(box => {
    const boxMiddle = box.y + (box.height / 2);
    const distanceFromMiddle = Math.abs(boxMiddle - screenMiddle);
    const normalizedDistance = distanceFromMiddle / (screenMiddle);
    return Math.pow(1 - Math.min(normalizedDistance, 1), 1.5);
  });
  
  const areaScores = filteredBoxes.map(box => {
    const area = box.width * box.height;
    return (area >= 100 && area <= 600) ? 1.0 : 
           (area > 600 && area <= 1000) ? 0.7 : 
           (area >= 50 && area < 100) ? 0.6 : 
           (area > 1000 && area <= 2000) ? 0.4 : 0.2;
  });
  
  const fillScores = filteredBoxes.map(box => {
    const pixelsInBox = stopPixels.filter(p => 
      p.x >= box.x && p.x < box.x + box.width && 
      p.y >= box.y && p.y < box.y + box.height
    );
    
    const fillRatio = pixelsInBox.length / (box.width * box.height);
    
    return (fillRatio >= 0.1 && fillRatio <= 0.7) ? 1.0 : 
           (fillRatio > 0.7 && fillRatio <= 0.9) ? 0.7 : 
           (fillRatio > 0 && fillRatio < 0.1) ? 0.5 : 0.2;
  });
  
  const horizontalScores = filteredBoxes.map(box => {
    const boxMiddle = box.x + (box.width / 2);
    const screenMiddleX = info.width / 2;
    const distanceFromMiddle = Math.abs(boxMiddle - screenMiddleX);
    const normalizedDistance = distanceFromMiddle / (screenMiddleX);
    return 1 - Math.min(normalizedDistance, 1);
  });
  
  const totalScores = filteredBoxes.map((_, i) => 
    (aspectScores[i] * 0.2) + 
    (positionScores[i] * 0.3) + 
    (areaScores[i] * 0.2) + 
    (fillScores[i] * 0.2) + 
    (horizontalScores[i] * 0.1)
  );
  
  // Kutu bilgilerini ve puanlarını goster
  filteredBoxes.forEach((box, i) => {
    console.log(`Box ${i+1}: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
    console.log(`  Oran: ${(box.width/box.height).toFixed(1)} (${aspectScores[i].toFixed(2)}) Pos: ${positionScores[i].toFixed(2)} Area: ${areaScores[i].toFixed(2)} Fill: ${fillScores[i].toFixed(2)} Hor: ${horizontalScores[i].toFixed(2)} Total: ${totalScores[i].toFixed(2)}`);
  });
  
  const bestIdx = totalScores.indexOf(Math.max(...totalScores));
  const bestBox = filteredBoxes[bestIdx];
  
  console.log(`En muhtemel Stop Loss kutusu seçildi (index: ${bestIdx}, puan: ${totalScores[bestIdx].toFixed(2)})`);
  
  return { box: bestBox, index: bestIdx };
}

/**
 * Stop Loss kutularını görselleştir
 */
async function visualizeStopBoxes(
  panelBuffer: Buffer,
  bestBox: { x: number, y: number, width: number, height: number },
  allBoxes: { x: number, y: number, width: number, height: number }[],
  scores?: number[]
): Promise<void> {
  try {
    // Panelin boyutlarını al
    const baseImage = sharp(panelBuffer);
    const metadata = await baseImage.metadata();
    const width = metadata.width!;
    const height = metadata.height!;
    if (!width || !height) {
      throw new Error('Görüntü boyutları alınamadı.');
    }
    
    // Stop Loss box'larını işaretle - en iyi kutu mor, diğerleri pembe
    const svg = `
    <svg width="${width}" height="${height}">
      ${allBoxes.map((box, index) => {
        const isBest = box.x === bestBox.x && box.y === bestBox.y;
        const scoreInfo = scores ? ` (${scores[index].toFixed(2)})` : '';
        const boxColor = isBest ? '#8e44ad' : 'pink';
        
        return `
          <rect 
            x="${box.x}" 
            y="${box.y}" 
            width="${box.width}" 
            height="${box.height}" 
            fill="rgba(255, 0, 255, 0.2)" 
            stroke="${boxColor}" 
            stroke-width="${isBest ? 3 : 1}"
            stroke-dasharray="${isBest ? '0' : '5,5'}"
          />
          <text 
            x="${box.x + box.width/2}" 
            y="${box.y - 3}" 
            font-family="Arial" 
            font-size="10" 
            fill="${boxColor}" 
            text-anchor="middle"
            font-weight="bold"
          >Box ${index + 1}${isBest ? ' (SL)' : ''}${scoreInfo}</text>
          
          <!-- Kutu ölçülerini göster -->
          <text 
            x="${box.x + box.width/2}" 
            y="${box.y + box.height + 12}" 
            font-family="Arial" 
            font-size="9" 
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
        stroke-width="2" 
        stroke-dasharray="5,5"
      />
      
      <!-- OCR için işlenecek alan açıklaması -->
      <text 
        x="${bestBox.x + bestBox.width/2}" 
        y="${Math.max(0, bestBox.y - Math.floor(bestBox.height * 0.5)) - 5}" 
        font-family="Arial" 
        font-size="10" 
        fill="rgba(0, 255, 0, 1)" 
        text-anchor="middle"
        font-weight="bold"
      >OCR Region</text>
    </svg>
  `;
  
    // SVG overlay ekle
    const overlayedImage = await baseImage
      .composite([{
        input: Buffer.from(svg),
        gravity: 'northwest'
      }])
      .toBuffer();
    
    // Save with timestamp to prevent overwriting
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFilename = `stop_boxes_debug_${timestamp}.png`;
    
    // Sonuç görüntüsünü kaydet
    fs.writeFileSync(outputFilename, overlayedImage);
    console.log(`Görselleştirilmiş Stop Loss kutuları kaydedildi: ${outputFilename}`);
    
    // Highlight just the best box for clarity
    const bestBoxHighlight = await sharp(panelBuffer)
      .extract({
        left: Math.max(0, bestBox.x - 10),
        top: Math.max(0, bestBox.y - 10),
        width: Math.min(width - Math.max(0, bestBox.x - 10), bestBox.width + 20),
        height: Math.min(height - Math.max(0, bestBox.y - 10), bestBox.height + 20)
      })
      .toBuffer();
    
    fs.writeFileSync(`best_sl_box_${timestamp}.png`, bestBoxHighlight);
    console.log(`En iyi Stop Loss kutusu izole edildi: best_sl_box_${timestamp}.png`);
    
  } catch (error) {
    console.error('Stop Loss kutularını görselleştirme hatası:', error);
  }
}

/**
 * Stop Loss kutusundan metin çıkar
 */
async function extractTextFromStopBox(panelBuffer: Buffer, box: { x: number, y: number, width: number, height: number }): Promise<string | null> {
  try {
    // Timestamp for unique filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Extract the box with margin for better OCR
    const marginX = Math.floor(box.width * 0.2);
    const marginY = Math.floor(box.height * 0.5);
    
    const cropX = Math.max(0, box.x - marginX);
    const cropY = Math.max(0, box.y - marginY);
    const cropWidth = Math.min(box.width + (marginX * 2), box.x + box.width + marginX);
    const cropHeight = Math.min(box.height + (marginY * 2), box.y + box.height + marginY);
    
    const stopBoxImage = await sharp(panelBuffer)
      .extract({ 
        left: cropX, 
        top: cropY, 
        width: cropWidth, 
        height: cropHeight 
      })
      .extend({ top:4, bottom:4, left:4, right:4, background:{r:255,g:255,b:255,alpha:1} })
      .toBuffer();
    
    const filename1 = `stop_box_original_${timestamp}.png`;
    fs.writeFileSync(filename1, stopBoxImage);
    console.log(`Orijinal Stop Loss kutusu kaydedildi: ${filename1}`);

    // Various processing methods for better OCR results
    const processed1 = await sharp(stopBoxImage)
      .resize({ height: cropHeight * 4 })
      .sharpen()
      .normalize()
      .toBuffer();
    
    const filename2 = `stop_box_processed_1_${timestamp}.png`;
    fs.writeFileSync(filename2, processed1);
    
    const processed2 = await sharp(stopBoxImage)
      .resize({ height: cropHeight * 4 })
      .modulate({ brightness:1.2, saturation:0.1 })
      .sharpen()
      .toBuffer();
    
    const filename3 = `stop_box_processed_2_${timestamp}.png`;
    fs.writeFileSync(filename3, processed2);
    
    const processed3 = await sharp(stopBoxImage)
      .resize({ height: cropHeight * 5 })
      .toColourspace('b-w')
      .normalize()
      .threshold(170)
      .extend({top:10, bottom:10, left:10, right:10, background:'white'})
      .toBuffer();
    
    const filename4 = `stop_box_processed_3_${timestamp}.png`;
    fs.writeFileSync(filename4, processed3);

    const origPad = await sharp(stopBoxImage)
      .extend({top:5, bottom:5, left:5, right:5, background:'white'})
      .resize({height: cropHeight * 3})
      .toBuffer();
    
    const filename5 = `stop_box_processed_orig_${timestamp}.png`;
    fs.writeFileSync(filename5, origPad);

    console.log('Çoklu OCR işlemi gerçekleştiriliyor...');
    
    // Try multiple OCR approaches with different parameters
    const defaultOpts = { logger: () => {} };
    const singleOpts = { 
      logger: () => {}, 
      tessedit_pageseg_mode: '7', 
      tessedit_char_whitelist: '0123456789.,+-$€£¥₺%' 
    };
    
    const r1 = await Tesseract.recognize(processed1, 'eng', defaultOpts);
    const r2 = await Tesseract.recognize(processed2, 'eng', singleOpts);
    const r3 = await Tesseract.recognize(processed3, 'eng', singleOpts);
    const ro = await Tesseract.recognize(origPad, 'eng', singleOpts);
    
    console.log(`OCR1: "${r1.data.text.trim()}" (${r1.data.confidence.toFixed(1)}%)`);
    console.log(`OCR2: "${r2.data.text.trim()}" (${r2.data.confidence.toFixed(1)}%)`);
    console.log(`OCR3: "${r3.data.text.trim()}" (${r3.data.confidence.toFixed(1)}%)`);
    console.log(`OCR Orig: "${ro.data.text.trim()}" (${ro.data.confidence.toFixed(1)}%)`);

    // Choose the best result based on confidence
    const confs = [r1.data.confidence, r2.data.confidence, r3.data.confidence, ro.data.confidence];
    const best = confs.indexOf(Math.max(...confs));
    let val = [r1, r2, r3, ro][best].data.text.trim();
    
    // Alternate extraction approach
    val = r3.data.text.trim();
    
    // Clean the result to keep only relevant characters
    val = val.replace(/[^\d.,+-]/g, '')
             .replace(/^[.,]/, '')
             .replace(/[.,]$/, '')
             .replace(/\.+/g, '.')
             .replace(/,+/g, ',')
             .trim();
    
    if (!val) {
      val = r2.data.text.trim().replace(/[^\d.,+-]/g, '').trim();
    }
    
    console.log(`Cleaned: "${val}"`);
    return val || null;
  } catch(e) { 
    console.error('OCR hata:', e); 
    return null; 
  }
}

/**
 * Stop Loss değerlerini test et
 */
async function testStopPrice() {
  try {
    console.log('\n=== STOP LOSS FİYAT TESPİT TESTİ BAŞLADI ===\n');
    
    // Ekran görüntüsünü al
    const screenshotFolder = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';
    const imagePath = await getLatestScreenshot(screenshotFolder);
    
    console.log(`İşlenen görüntü: ${path.basename(imagePath)}`);
    
    // Fiyat panelini izole et
    console.log('\n1. Fiyat paneli izole ediliyor...');
    const panel = await isolatePricePanel(imagePath);
    fs.writeFileSync('price_panel.png', panel);
    console.log('Fiyat paneli kaydedildi: price_panel.png');
    
    // Stop Loss kutusunu tespit et
    console.log('\n2. Stop Loss kutusu tespit ediliyor...');
    const res = await findStopBox(panel);
    
    if (!res) {
      console.error('❌ Stop Loss kutusu tespit edilemedi!');
      console.log('\n=== STOP LOSS FİYAT SONUÇLARI ===');
      console.error('❌ Stop Loss değeri çıkarılamadı!');
      console.log('\n=== TEST TAMAMLANDI ===');
      return; // Kutu bulunamadığı için işlemi sonlandır
    }
    
    const box = res.box;
    
    // Tüm SL kutularını görselleştir
    console.log('\n3. Stop Loss kutuları görselleştiriliyor...');
    await visualizeStopBoxes(panel, box, [box], [1]);
    
    // Stop Loss kutusundan metni çıkar
    console.log('\n4. Stop Loss kutusundan metin çıkarılıyor...');
    const stopValue = await extractTextFromStopBox(panel, box);
    
    console.log('\n=== STOP LOSS FİYAT SONUÇLARI ===');
    if(stopValue) console.log(`\n✓ Tespit edilen Stop Loss fiyatı: ${stopValue}`);
    else console.error('❌ Stop Loss değeri çıkarılamadı!');
    console.log('\n=== TEST TAMAMLANDI ===');
  } catch(err) {
    console.error('Test hatası:', err);
  }
}

// Testi çalıştır
testStopPrice(); 