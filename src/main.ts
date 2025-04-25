import { Plugin } from 'obsidian';
import { FileWatcher } from './infrastructure/fileWatcher';

export default class BacktestPlugin extends Plugin {
  private fileWatcher: FileWatcher | null = null;

  async onload() {
    console.log('🧠 Backtest Auto Note Plugin loaded!');

    const screenshotsFolder = "C:/Users/aatak/OneDrive/Desktop/fx_screenshot"; 
    
    this.fileWatcher = new FileWatcher(screenshotsFolder, (filePath: string) => {
      console.log(`🖼 Yeni Screenshot Yakalandı: ${filePath}`);
    });

    this.fileWatcher.startWatching();
  }

  onunload() {
    console.log('❌ Plugin unloaded');
  }
}
