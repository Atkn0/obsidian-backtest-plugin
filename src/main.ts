import { Plugin } from 'obsidian';
import { FileWatcher } from './infrastructure/fileWatcher';
import { OCRService } from './services/ocr/ocrService'; 
import { TradeData } from './domain/models/tradeData';

export default class BacktestPlugin extends Plugin {
  private fileWatcher: FileWatcher | null = null;
  private ocrService: OCRService | null = null;

  async onload() {
    this.app.workspace.containerEl.createEl('div', { 
      text: '🧠 Backtest Auto Note Plugin loaded!' 
    });

    const screenshotsFolder = "C:/Users/aatak/OneDrive/Desktop/fx_screenshot"; 
    
    // OCR servisini başlat
    try {
      this.ocrService = new OCRService();
      this.log('✅ OCR Service başarıyla başlatıldı');
    } catch (error) {
      this.error('OCR Service başlatılamadı:', error);
    }

    // FileWatcher'ı başlat
    this.fileWatcher = new FileWatcher(screenshotsFolder, async (filePath: string) => {
      try {
        this.log(`🖼️ Yeni Screenshot Yakalandı: ${filePath}`);
        
        if (!this.ocrService) {
          this.error('❌ OCRService başlatılamadı');
          return;
        }
        
        this.log('🔍 OCR işlemi başlatılıyor...'); 
        
        const tradeData = await this.ocrService.extractTradeData(filePath);
        
        if (tradeData) {
          this.log('✅ İşlem verileri başarıyla çıkarıldı:' + JSON.stringify(tradeData, null, 2));
          // Obsidian notice ile kullanıcıya bildir
          new Notice(`Trade data bulundu: ${tradeData.symbol}`);
        } else {
          this.error('❌ İşlem verileri çıkarılamadı - OCR başarısız oldu');
          new Notice('Trade data çıkarılamadı!');
        }
      } catch (error) {
        this.error('❌ OCR işleminde hata:', error);
        if (error instanceof Error) {
          this.error('Hata detayı:', error.message);
          console.error('Stack trace:', error.stack);
          new Notice('OCR işleminde hata oluştu!');
        }
      }
    });

    this.fileWatcher.startWatching();
    this.log(`📡 ${screenshotsFolder} klasörü izleniyor...`);
  }

  onunload() {
    if (this.fileWatcher) {
      this.fileWatcher.stopWatching();
    }
    this.log('❌ Plugin devre dışı bırakıldı');
  }

  private log(message: string, ...args: any[]) {
    console.log(`[Backtest Plugin] ${message}`, ...args);
    this.app.workspace.containerEl.createEl('div', {
      text: message
    });
  }

  private error(message: string, ...args: any[]) {
    console.error(`[Backtest Plugin] ${message}`, ...args);
    this.app.workspace.containerEl.createEl('div', {
      text: `Error: ${message}`,
      cls: 'backtest-error'
    });
    new Notice(`Error: ${message}`);
  }
}
