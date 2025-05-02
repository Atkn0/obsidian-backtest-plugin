import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';
import * as fs from 'fs';

type ExtendedWorkerOptions = Partial<Tesseract.WorkerOptions> & {
  tessedit_char_whitelist?: string;
  tessedit_pageseg_mode?: string;
};

export async function extractSymbol(image: sharp.Sharp | string): Promise<string> {
  try {
    let sharpInstance: sharp.Sharp;
    
    // Eğer string ise (dosya yolu) Sharp instance oluştur
    if (typeof image === 'string') {
      sharpInstance = sharp(image);
    } else {
      // Zaten Sharp instance
      sharpInstance = image;
    }
    
    // Görüntünün sadece sol üst köşesini kes (sembol genellikle buradadır)
    const metadata = await sharpInstance.metadata();
    const width = metadata.width || 1000;
    const height = metadata.height || 700;
    
    // Sol üst köşeyi kırp - genellikle sembol burada olur
    const croppedImage = sharpInstance.extract({
      left: 0,
      top: 0,
      width: Math.min(300, width),
      height: Math.min(50, height)
    });
    
    // Görüntüyü işle - sembol daha net görünsün diye kontrast ve netlik artır
    const processedImage = croppedImage
      .gamma(2.2) // Kontrast benzeri efekt
      .modulate({ brightness: 1.2, saturation: 1.3 }) // Parlaklık ayarı
      .sharpen({ sigma: 1.0 }); // Netlik artır
    
    // PNG olarak buffer oluştur
    const buffer = await processedImage.toBuffer();
    console.log('Buffer oluşturuldu:', buffer.length, 'bytes');
    
    // Debug için görüntüyü kaydet
    fs.writeFileSync('symbol_debug.png', buffer);

    // Tesseract OCR işlemi - özel konfigürasyon ile
    // Daha fazla karakteri tanıması için whitelist genişletildi
    const options: ExtendedWorkerOptions = {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.',
      tessedit_pageseg_mode: '7' // Treat the image as a single text line
    };

    const result = await Tesseract.recognize(buffer, 'eng', options);
    
    console.log('Ham OCR sonucu:', result.data.text);

    // Metni işle ve sembolü çıkar
    const text = result.data.text.trim();
    
    // Virgülden önceki kısmı al (TradingView'da genelde "SYMBOL, timeframe" formatında)
    // veya ilk kelimeyi al
    let symbolText = text.split(',')[0];
    if (symbolText.includes(' ')) {
      symbolText = symbolText.split(' ')[0]; // İlk kelimeyi al
    }
    
    // Boşlukları temizle ve büyük harfe çevir
    const symbol = symbolText.replace(/\s+/g, '').toUpperCase();
    
    // Sembol geçerli mi kontrol et
    if (symbol && /^[A-Z0-9]+$/.test(symbol)) {
      console.log('Çıkarılan sembol:', symbol);
      return symbol;
    }

    console.log('Geçerli sembol bulunamadı, ham metin:', text);
    return 'UNKNOWN';

  } catch (error) {
    console.error('Symbol extraction error:', error);
    return 'UNKNOWN';
  }
}
