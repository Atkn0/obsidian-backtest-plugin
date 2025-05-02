import { PriceBox } from './detectPriceColors';

/**
 * Renk bazlı ve OCR bazlı analiz sonuçlarını daha güçlü şekilde birleştir
 */
export function mergeAnalysisResults(colorBoxes: PriceBox[], textBoxes: PriceBox[]): PriceBox[] {
  // Renk analizi sonuçlarını başlangıç olarak koru
  const merged = [...colorBoxes];
  
  // OCR ile bulunan metinleri birleştir
  for (const textBox of textBoxes) {
    // Yakın konumda renk ile tespit edilmiş bir kutu var mı?
    const matchingColorBox = findClosestColorBox(textBox, colorBoxes, 50);
    
    if (matchingColorBox) {
      // Renk kutusuna metni ekle
      const index = merged.findIndex(box => box === matchingColorBox);
      if (index !== -1) {
        merged[index].text = textBox.text;
        // Debug log
        console.log(`Metin '${textBox.text}' şu tipe atandı: ${merged[index].type} (y=${merged[index].y})`);
      }
    } else {
      // Renk analizi ile bulunamayan kutuları ekle
      merged.push(textBox);
    }
  }
  
  // Tip tahmini yap
  assignTypeByPosition(merged);
  
  // Gerekirse eksik tip bilgilerini doldur
  fillMissingTypes(merged);
  
  return merged;
}

/**
 * En yakın renk kutusunu bul
 */
function findClosestColorBox(textBox: PriceBox, colorBoxes: PriceBox[], maxDistance: number): PriceBox | null {
  if (colorBoxes.length === 0) return null;
  
  let closestBox: PriceBox | null = null;
  let minDistance = Infinity;
  
  for (const colorBox of colorBoxes) {
    const distance = Math.abs(colorBox.y - textBox.y);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      closestBox = colorBox;
    }
  }
  
  return closestBox;
}

/**
 * Y pozisyonuna göre tip tahmini yap (yukarıdan aşağıya: TP -> Entry -> Stop)
 */
function assignTypeByPosition(boxes: PriceBox[]): void {
  // Y pozisyonuna göre sırala
  const sortedBoxes = [...boxes].sort((a, b) => a.y - b.y);
  
  // Bilinen tipleri kullanarak tip tespiti yap
  const knownTpBox = sortedBoxes.find(box => box.type === 'tp' && box.text);
  const knownEntryBox = sortedBoxes.find(box => box.type === 'entry' && box.text);
  const knownStopBox = sortedBoxes.find(box => box.type === 'stop' && box.text);
  
  // Eğer bilinen kutulardan bir tanesi yoksa, pozisyona göre tahmin et
  if (!knownTpBox && !knownEntryBox && !knownStopBox) {
    // Metin içeren kutulara odaklan
    const textBoxes = sortedBoxes.filter(box => box.text);
    
    if (textBoxes.length >= 3) {
      // En az 3 değer varsa, yukarıdan aşağıya: TP -> Entry -> Stop olarak kabul et
      textBoxes[0].type = 'tp';
      textBoxes[Math.floor(textBoxes.length / 2)].type = 'entry';
      textBoxes[textBoxes.length - 1].type = 'stop';
    } else if (textBoxes.length === 2) {
      // 2 değer varsa, yukarıdaki TP, aşağıdaki Stop olarak kabul et
      textBoxes[0].type = 'tp';
      textBoxes[1].type = 'stop';
    } else if (textBoxes.length === 1) {
      // Tek değer varsa Entry olarak kabul et
      textBoxes[0].type = 'entry';
    }
  }
}

/**
 * Eksik kalan tip bilgilerini akıllıca doldur
 */
function fillMissingTypes(boxes: PriceBox[]): void {
  // Y pozisyonuna göre sıralı halde kutular
  const sortedBoxes = [...boxes].sort((a, b) => a.y - b.y);
  
  // Metin içeren kutulara odaklan
  const textBoxes = sortedBoxes.filter(box => box.text);
  
  // Tipi belirlenmeyen kutuları doldur
  for (const box of textBoxes) {
    if (box.type === 'unknown') {
      // İlk ve son değerleri kontrol et
      if (box === textBoxes[0]) {
        box.type = 'tp'; // İlk değeri TP yap
      } else if (box === textBoxes[textBoxes.length - 1]) {
        box.type = 'stop'; // Son değeri Stop yap
      } else {
        box.type = 'entry'; // Ortadaki değerleri Entry yap
      }
    }
  }
} 