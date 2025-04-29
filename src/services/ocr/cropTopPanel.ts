import { Jimp } from 'jimp';

export async function cropTopPanel(image: InstanceType<typeof Jimp>): Promise<InstanceType<typeof Jimp>> {
  try {
    const width = image.width;
    const cropped = image.clone().crop({
      x: 0,
      y: 0,
      w: width,
      h: 100
    });
    return cropped as InstanceType<typeof Jimp>;
  } catch (error) {
    console.error('Error cropping top panel:', error);
    return image;
  }
}
