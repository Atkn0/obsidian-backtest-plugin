const { watch } = require('fs');
const path = require('path');

export class FileWatcher {
  private watchPath: string;
  private onNewFile: (filePath: string) => void;

  constructor(watchPath: string, onNewFile: (filePath: string) => void) {
    this.watchPath = watchPath;
    this.onNewFile = onNewFile;
  }

  startWatching() {
    watch(this.watchPath, (eventType: string, filename: any) => {
      if (eventType === 'rename' && filename) {
        const fullPath = path.join(this.watchPath, filename);
        if (this.isValidScreenshot(fullPath)) {
          console.log(`🖼 Yeni dosya bulundu: ${fullPath}`);
          this.onNewFile(fullPath);
        }
      }
    });
  }

  private isValidScreenshot(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  }
}
