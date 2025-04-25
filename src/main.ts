import { Plugin } from 'obsidian';

export default class BacktestPlugin extends Plugin {
  async onload() {
    console.log('🧠 Backtest Auto Note Plugin loaded!');
  }

  onunload() {
    console.log('❌ Plugin unloaded');
  }
}
