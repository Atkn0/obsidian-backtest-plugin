import { Jimp } from 'jimp';

export async function preprocessImage(image: InstanceType<typeof Jimp>): Promise<InstanceType<typeof Jimp>> {
  return image
    .greyscale()
    .contrast(0.5)
    .normalize() as InstanceType<typeof Jimp>;
}
