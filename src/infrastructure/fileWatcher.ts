const { watch } = require('fs');
const path = require('path');

export class FileWatcher {
  private watchPath: string;
  private onNewFile: (filePath: string) => void;
  private watcher: any = null;

  constructor(watchPath: string, onNewFile: (filePath: string) => void) {
    this.watchPath = watchPath;
    this.onNewFile = onNewFile;
  }

  startWatching() {
    try {
      this.watcher = watch(this.watchPath, { persistent: true }, (eventType: string, filename: string) => {
        try {
          if (eventType === 'rename' && filename) {
            const fullPath = path.join(this.watchPath, filename);
            if (this.isValidScreenshot(fullPath)) {
              console.log(`🖼 Yeni dosya bulundu: ${fullPath}`);
              setTimeout(() => { // Dosyanın tamamen yazılmasını bekle
                this.onNewFile(fullPath);
              }, 500);
            }
          }
        } catch (error) {
          console.error('❌ Dosya işleme hatası:', error);
        }
      });
      
      console.log(`✅ FileWatcher başlatıldı: ${this.watchPath}`);
    } catch (error) {
      console.error('❌ FileWatcher başlatma hatası:', error);
    }
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('🛑 FileWatcher durduruldu');
    }
  }

  private isValidScreenshot(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  }
}
