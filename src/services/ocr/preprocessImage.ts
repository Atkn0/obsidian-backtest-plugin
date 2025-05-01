import sharp from 'sharp';

export async function preprocessImage(image: sharp.Sharp | string): Promise<sharp.Sharp> {
  try {
    let sharpInstance: sharp.Sharp;
    
    // Eğer string ise (dosya yolu) Sharp instance oluştur
    if (typeof image === 'string') {
      sharpInstance = sharp(image);
    } else {
      // Zaten Sharp instance
      sharpInstance = image;
    }
    
    // Görüntüyü gri tonlama, kontrast artırma ve normalize etme
    return sharpInstance
      .greyscale() // Gri tonlama
      .gamma(2.2) // Kontrast artırma
      .normalize(); // Normalize etme
      
  } catch (error) {
    console.error('Error preprocessing image:', error);
    if (typeof image === 'string') {
      return sharp(image);
    }
    return image;
  }
}
