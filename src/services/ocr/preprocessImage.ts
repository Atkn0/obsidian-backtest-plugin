import { Jimp } from 'jimp';

export async function preprocessImage(image: typeof Jimp.prototype): Promise<typeof Jimp.prototype> {
  return image
    .greyscale()
    .contrast(0.5)
    .normalize();
}
