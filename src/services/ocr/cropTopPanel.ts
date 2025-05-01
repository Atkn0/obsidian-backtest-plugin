import sharp from 'sharp';
import * as fs from 'fs';

export async function cropTopPanel(image: sharp.Sharp | string): Promise<sharp.Sharp> {
  try {
    let sharpInstance: sharp.Sharp;
    
    // Eğer string ise (dosya yolu) Sharp instance oluştur
    if (typeof image === 'string') {
      sharpInstance = sharp(image);
    } else {
      // Zaten Sharp instance
      sharpInstance = image.clone(); // Orijinali değiştirmemek için clone
    }
    
    // Görüntü bilgilerini al
    const metadata = await sharpInstance.metadata();
    const width = metadata.width || 0;
    
    // Üst kısmı kırp
    const cropped = sharpInstance.extract({
      left: 0,
      top: 0,
      width: width,
      height: 50 // Üst kısım yüksekliği
    });

    // 💾 Dosyaya yaz (görseli incelemek için)
    const buffer = await cropped.toBuffer();
    fs.writeFileSync('top_panel_debug.png', buffer);
    console.log('📸 Kırpılmış üst panel kaydedildi: top_panel_debug.png');

    return cropped;
  } catch (error) {
    console.error('Error cropping top panel:', error);
    if (typeof image === 'string') {
      return sharp(image);
    }
    return image;
  }
}
