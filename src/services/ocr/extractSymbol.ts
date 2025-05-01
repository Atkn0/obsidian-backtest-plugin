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
    
    // Görüntüyü işle - contrast ve brightness ayarla
    const processedImage = sharpInstance
      .gamma(2.2) // contrast benzeri efekt
      .modulate({ brightness: 1.2 }); // brightness ayarı
    
    // PNG olarak buffer oluştur
    const buffer = await processedImage.toBuffer();
    console.log('Buffer oluşturuldu:', buffer.length, 'bytes');

    // Tesseract OCR işlemi - özel konfigürasyon ile
    const options: ExtendedWorkerOptions = {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,.',
      tessedit_pageseg_mode: '7' // Treat the image as a single text line
    };

    const result = await Tesseract.recognize(buffer, 'eng', options);
    
    console.log('Ham OCR sonucu:', result.data.text);

    // Metni işle ve sembolü çıkar
    const text = result.data.text.trim();
    
    // Virgülden önceki kısmı al (TradingView'da genelde "SYMBOL, timeframe" formatında)
    const symbolPart = text.split(',')[0];
    
    // Boşlukları temizle ve büyük harfe çevir
    const symbol = symbolPart.replace(/\s+/g, '').toUpperCase();
    
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
