import { PriceBox, extractPriceValues, determinePriceType } from './detectPriceColors';
import { extractPriceTexts, parsePrice } from './extractPricePanelText';
import { TradeData } from '../../domain/models/tradeData';

/**
 * Görüntüden fiyat değerlerini çıkar ve doğru bir şekilde sınıflandır
 */
export async function analyzePricePanel(imagePath: string, symbol: string): Promise<TradeData | null> {
  try {
    console.log('🎯 Fiyat paneli analiz ediliyor...');
    
    // Önemli: Önce OCR bazlı analiz yap (bu renkli panel görüntüsünü kaydedecek)
    console.log('🔤 OCR bazlı analiz yapılıyor...');
    const textBoxes = await extractPriceTexts(imagePath);
    console.log('🔤 OCR bazlı analiz sonuçları:', textBoxes);
    
    // Sonra renk bazlı analiz yap (kaydedilen renkli panel görüntüsünü kullanacak)
    console.log('🎨 Renk bazlı analiz yapılıyor...');
    const colorBoxes = await extractPriceValues(imagePath);
    console.log('🎨 Renk bazlı analiz sonuçları:', colorBoxes);
    
    // İki analiz sonucunu birleştir (geliştirilmiş fonksiyon)
    const mergedBoxes = mergeAnalysisResults(colorBoxes, textBoxes);
    console.log('🔄 Birleştirilmiş sonuçlar:', mergedBoxes);
    
    // Filtrele: Muhtemelen gerçekçi olmayan değerleri kaldır
    const filteredBoxes = filterUnrealisticValues(mergedBoxes);
    console.log('🧹 Filtrelenmiş değerler:', filteredBoxes);
    
    // TP, Entry ve Stop değerlerini çıkar - metin içeren kutulara öncelik ver
    const textBoxesWithContent = filteredBoxes.filter(box => box.text && box.text.trim() !== '');
    
    // Tiplerine göre değerleri bul
    let tpBox = textBoxesWithContent.find(box => box.type === 'tp');
    let entryBox = textBoxesWithContent.find(box => box.type === 'entry');
    let stopBox = textBoxesWithContent.find(box => box.type === 'stop');
    
    // Bulunamayanlar için hata göster
    if (!tpBox) console.warn('⚠️ TP değeri bulunamadı!');
    if (!entryBox) console.warn('⚠️ Entry değeri bulunamadı!');
    if (!stopBox) console.warn('⚠️ Stop değeri bulunamadı!');
    
    // OCR ile tespit edilen değerler arasından en olası TP, Entry ve Stop değerlerini bul
    if (textBoxesWithContent.length >= 2) {
      // Y pozisyonuna göre sırala (yukarıdan aşağıya)
      const sortedValues = [...textBoxesWithContent]
        .map(box => ({
          value: parsePrice(box.text) || 0,
          y: box.y,
          type: box.type
        }))
        .filter(item => item.value > 10) // Çok küçük değerleri filtrele (muhtemelen yanlış OCR)
        .sort((a, b) => a.value - b.value); // Değerlerine göre küçükten büyüğe sırala
      
      console.log('📊 Değerlerine göre sıralanmış metinler:', 
        sortedValues.map(v => `${v.value} (${v.type})`));
      
      if (sortedValues.length >= 2) {
        // Değerlerin dağılımına bakarak muhtemel işlem yönünü belirle
        const minValue = sortedValues[0].value;
        const maxValue = sortedValues[sortedValues.length - 1].value;
        const medianValue = sortedValues[Math.floor(sortedValues.length / 2)].value;
        
        // Değerler arasındaki mesafeleri hesapla
        const lowerRange = medianValue - minValue;
        const upperRange = maxValue - medianValue;
        
        // İşlem yönünü tahmin et
        const isLongTrade = lowerRange < upperRange;
        
        console.log(`📈 Tahmini işlem yönü: ${isLongTrade ? 'LONG' : 'SHORT'}`);
        
        if (isLongTrade) {
          // LONG pozisyon için: TP en büyük, Stop en küçük, Entry ortada
          if (!stopBox || !stopBox.text) {
            stopBox = { text: String(minValue), type: 'stop', y: sortedValues[0].y };
            console.log(`🔹 Stop değeri belirlendi: ${stopBox.text} (hesaplanan)`);
          }
          
          if (!entryBox || !entryBox.text) {
            // Entry, değerlerin ortasında bir değer olabilir
            entryBox = { text: String(medianValue), type: 'entry', y: sortedValues[Math.floor(sortedValues.length / 2)].y };
            console.log(`🔹 Entry değeri belirlendi: ${entryBox.text} (hesaplanan)`);
          }
          
          if (!tpBox || !tpBox.text) {
            tpBox = { text: String(maxValue), type: 'tp', y: sortedValues[sortedValues.length - 1].y };
            console.log(`🔹 TP değeri belirlendi: ${tpBox.text} (hesaplanan)`);
          }
        } else {
          // SHORT pozisyon için: TP en küçük, Stop en büyük, Entry ortada
          if (!stopBox || !stopBox.text) {
            stopBox = { text: String(maxValue), type: 'stop', y: sortedValues[sortedValues.length - 1].y };
            console.log(`🔹 Stop değeri belirlendi: ${stopBox.text} (hesaplanan)`);
          }
          
          if (!entryBox || !entryBox.text) {
            // Entry, değerlerin ortasında bir değer olabilir
            entryBox = { text: String(medianValue), type: 'entry', y: sortedValues[Math.floor(sortedValues.length / 2)].y };
            console.log(`🔹 Entry değeri belirlendi: ${entryBox.text} (hesaplanan)`);
          }
          
          if (!tpBox || !tpBox.text) {
            tpBox = { text: String(minValue), type: 'tp', y: sortedValues[0].y };
            console.log(`🔹 TP değeri belirlendi: ${tpBox.text} (hesaplanan)`);
          }
        }
        
        // Değerleri dönüştür
        const takeProfit = parsePrice(tpBox.text);
        const entry = parsePrice(entryBox.text);
        const stop = parsePrice(stopBox.text);
        
        if (takeProfit !== null && entry !== null && stop !== null) {
          console.log('✅ Tüm fiyat değerleri başarıyla çıkarıldı:');
          console.log(`   TP: ${takeProfit}, Entry: ${entry}, Stop: ${stop}`);
          
          // Risk-ödül oranını hesapla
          const riskPips = Math.abs(entry - stop);
          const rewardPips = Math.abs(takeProfit - entry);
          const riskRewardRatio = rewardPips / riskPips;
          
          // Risk-ödül oranı çok dengesizse uyarı ver
          if (riskRewardRatio < 0.1 || riskRewardRatio > 10) {
            console.warn('⚠️ Risk-ödül oranı olağandışı: ' + riskRewardRatio.toFixed(2));
          }
          
          return {
            symbol,
            entry,
            stop,
            takeProfit,
            timestamp: new Date().toISOString()
          };
        }
      }
    }
    
    // Standart yöntemle devam et (yeterli değer bulunamadıysa)
    // OCR'ın tespit edebildiği en azından iki değer varsa, bir trade verisi oluşturmayı deneyelim
    if (textBoxesWithContent.length >= 2) {
      // Sıralamaya göre değerleri tahmin et (yukarıdan aşağıya: TP -> Entry -> Stop)
      const sortedTexts = [...textBoxesWithContent].sort((a, b) => a.y - b.y);
      
      // Varsayılan değerleri ata
      const tp = tpBox ? parsePrice(tpBox.text) : (sortedTexts[0] ? parsePrice(sortedTexts[0].text) : null);
      const entry = entryBox ? parsePrice(entryBox.text) : (sortedTexts[1] ? parsePrice(sortedTexts[1].text) : null);
      const stop = stopBox ? parsePrice(stopBox.text) : (sortedTexts[textBoxesWithContent.length - 1] ? parsePrice(sortedTexts[textBoxesWithContent.length - 1].text) : null);
      
      // En az iki değer geçerliyse trade verisi oluştur
      if ((tp !== null && entry !== null) || (entry !== null && stop !== null) || (tp !== null && stop !== null)) {
        console.log('✅ En az iki fiyat değeri başarıyla çıkarıldı:');
        console.log(`   TP: ${tp}, Entry: ${entry}, Stop: ${stop}`);
        
        // Eksik değerler için varsayılan değerler ata (gerçek kullanımda bu değerler iyileştirilmeli)
        const takeProfit = tp !== null ? tp : (entry !== null ? entry * 1.01 : 0);
        const entryPrice = entry !== null ? entry : (tp !== null && stop !== null ? (tp + stop) / 2 : 0);
        const stopLoss = stop !== null ? stop : (entry !== null ? entry * 0.99 : 0);
        
        return {
          symbol,
          entry: entryPrice,
          stop: stopLoss,
          takeProfit,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    console.error('❌ Geçerli fiyat değerleri bulunamadı veya değerler eksik.');
    return null;
  } catch (error) {
    console.error('❌ Fiyat paneli analizi sırasında hata oluştu:', error);
    return null;
  }
}

/**
 * Tespit edilen değerlerden muhtemelen gerçekçi olmayanları filtrele
 */
function filterUnrealisticValues(boxes: PriceBox[]): PriceBox[] {
  // Sayısal değerleri olan kutuları hesapla
  const valuesWithNumbers = boxes
    .filter(box => box.text && box.text.trim() !== '')
    .map(box => ({
      box,
      value: parsePrice(box.text) || 0
    }));
  
  if (valuesWithNumbers.length === 0) return boxes;
  
  // Değerleri analiz et
  const values = valuesWithNumbers.map(item => item.value);
  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  const validRange = average * 3; // Ortalamadan çok sapan değerler için range
  
  // Gerçekçi değerleri temsil eden kümeleri bul (benzer değer aralıklarında gruplar)
  const sortedValues = [...values].sort((a, b) => a - b);
  
  // Benzer değer aralıklarını bul
  // Örneğin: [3, 20, 200, 21000, 21100, 21200, 21900]
  // Burada 21000+ grubu gerçekçi değerleri temsil eder
  
  let majorGroup: number[] = [];
  let currentGroup: number[] = [sortedValues[0]];
  
  // Değerleri gruplara ayır (değer farkı yaklaşık %10'dan fazla olanları ayrı grup say)
  for (let i = 1; i < sortedValues.length; i++) {
    const currentValue = sortedValues[i];
    const previousValue = sortedValues[i - 1];
    
    // Değerler birbirine yakınsa aynı grupta
    if (currentValue < previousValue * 3) {
      currentGroup.push(currentValue);
    } else {
      // Yeni bir grup başlat
      if (currentGroup.length > majorGroup.length) {
        majorGroup = currentGroup;
      }
      currentGroup = [currentValue];
    }
  }
  
  // Son grubu kontrol et
  if (currentGroup.length > majorGroup.length) {
    majorGroup = currentGroup;
  }
  
  // En büyük grubu bul
  if (majorGroup.length === 0 && sortedValues.length > 0) {
    majorGroup = [sortedValues[0]];
  }
  
  // Baskın grubun ortalama değeri
  const majorGroupAverage = majorGroup.reduce((sum, val) => sum + val, 0) / majorGroup.length;
  
  // Baskın gruptan çok sapan değerleri filtrele
  console.log(`🔍 Baskın değer grubu tespit edildi, ortalama: ${majorGroupAverage.toFixed(2)}`);
  console.log(`   Grup üyeleri: ${majorGroup.join(', ')}`);
  
  // Gerçekçi olmayan değerleri filtrele
  const filteredBoxes = boxes.filter(box => {
    if (!box.text || box.text.trim() === '') return true; // Metni olmayan kutuları tut
    
    const value = parsePrice(box.text) || 0;
    
    // Aşırı küçük değerleri filtrele (muhtemelen OCR hataları)
    if (value < 10 && majorGroupAverage > 1000) return false;
    
    // Ortalamadan çok sapan değerleri filtrele
    if (majorGroupAverage > 1000) { // Büyük değer ölçeğindeyiz
      // Değer çok küçükse ve ana gruba ait değilse filtrele
      if (value < 1000 && !majorGroup.includes(value)) {
        return false;
      }
    }
    
    return true;
  });
  
  return filteredBoxes;
}

/**
 * Renk bazlı ve OCR bazlı analiz sonuçlarını daha güçlü şekilde birleştir
 */
function mergeAnalysisResults(colorBoxes: PriceBox[], textBoxes: PriceBox[]): PriceBox[] {
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