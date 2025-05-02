# TradingView Screenshot Analysis Plugin

This Obsidian plugin automatically analyzes TradingView screenshots to extract trading information including symbols, entry prices, stop-loss and take-profit values.

## Key Features

- **Symbol Detection**: Accurately identifies trading symbols (e.g., "NAS100", "EURUSD") from screenshots
- **Price Panel Analysis**: Detects and extracts entry, stop-loss, and take-profit values
- **Trade Direction Detection**: Automatically determines if a trade is LONG or SHORT based on price relationships
- **Automatic Note Creation**: Creates structured notes with extracted trade information

## OCR Improvements

### Symbol Detection Improvements

- **Cropping Focus**: Crops to the top-left corner where symbols typically appear
- **Image Enhancement**: Applies gamma correction, brightness/contrast adjustments, and sharpening
- **Character Recognition**: Uses specialized OCR configurations for financial symbols
- **Fixes**: Resolved "NAS100" being incorrectly identified as "ASCO"

### Entry Price Detection

The system uses advanced techniques to accurately detect gray entry price boxes:

1. **Enhanced Color Detection**: 
   - Expanded gray color profiles to detect various shades of gray used by TradingView
   - Includes light gray, dark gray, warm gray, and cool gray detection

2. **Advanced Pixel Clustering**:
   - Uses connected component analysis to group adjacent gray pixels
   - Applies breadth-first search algorithm to create coherent entry box areas
   - Sizes and sorts boxes by area to find the most significant entry indicators

3. **Multi-Method OCR Processing**:
   - Processes each detected area with multiple image enhancement techniques:
     - Standard grayscale normalization
     - High contrast enhancement
     - Negative image processing
     - Binary threshold processing
   - Compares OCR results across methods to determine the most reliable value

4. **Intelligent Text Extraction**:
   - Character substitution for common OCR errors (e.g., "O" → "0", "l" → "1")
   - Enhanced regex patterns for numerical values including commas and decimals
   - Cleans and normalizes detected numbers to standardize format

5. **Statistical Value Selection**:
   - Clustering analysis to group similar numeric values
   - Frequency analysis to identify most reliable readings
   - Confidence scoring based on detection consistency

## Testing

The plugin includes specialized test scripts to validate OCR accuracy:

```bash
# Run entry price detection test
npm run test:entry

# Run OCR comparison test (analyzes different processing methods)
npm run test:ocr

# Run symbol detection test
npm run test:symbol
```

The OCR comparison test generates detailed statistics about which image processing techniques produce the most reliable results for your specific TradingView setup.

## Usage

1. Install the plugin in Obsidian
2. Configure the screenshot directory in settings
3. Take screenshots of your TradingView charts
4. The plugin automatically processes new screenshots and creates notes with the extracted data

## Future Improvements

- Enhanced text recognition for non-standard price formats
- Support for more complex chart layouts and indicators
- Additional trading metrics extraction (e.g., risk/reward ratio calculation)
- API integration with popular trading journals