import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';

/**
 * Multiple OCR methods test for entry price detection
 * This script tests various image processing and OCR techniques
 * to find the most accurate method for price detection.
 */

// Test directory for screenshots
const TEST_DIR = 'C:/Users/aatak/OneDrive/Desktop/fx_screenshot';

interface OCRResult {
  method: string;
  text: string;
  confidence: number;
}

/**
 * Get latest screenshot from directory
 */
async function getLatestScreenshot(directoryPath: string): Promise<string> {
  try {
    // Get all files in directory
    const files = fs.readdirSync(directoryPath)
      .map(file => ({
        name: file,
        path: path.join(directoryPath, file),
        stat: fs.statSync(path.join(directoryPath, file))
      }))
      // Filter only image files
      .filter(file => /\.(png|jpg|jpeg)$/i.test(file.name))
      // Sort by creation time (newest first)
      .sort((a, b) => b.stat.birthtimeMs - a.stat.birthtimeMs);

    if (files.length === 0) {
      throw new Error('No image files found in screenshot directory!');
    }

    return files[0].path;
  } catch (error) {
    console.error('Error reading screenshot directory:', error);
    throw error;
  }
}

/**
 * Crop price panel from image
 */
async function cropPricePanel(imagePath: string): Promise<sharp.Sharp> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  
  const width = metadata.width || 1000;
  const height = metadata.height || 700;
  
  // Extract right panel (last 100 pixels in width)
  return image.extract({
    left: width - 100,
    top: 0,
    width: 100,
    height: height
  });
}

/**
 * Apply various image processing techniques and perform OCR
 */
async function testMultipleOCRTechniques(imagePath: string): Promise<OCRResult[]> {
  try {
    console.log(`Testing OCR techniques on: ${path.basename(imagePath)}`);
    
    // Crop price panel
    const pricePanel = await cropPricePanel(imagePath);
    const panelBuffer = await pricePanel.toBuffer();
    
    // Save original panel for reference
    fs.writeFileSync('ocr_test_original_panel.png', panelBuffer);
    
    // Apply different processing techniques
    const processes = [
      {
        name: "Standard Grayscale",
        image: pricePanel.clone()
          .greyscale()
          .normalize()
      },
      {
        name: "High Contrast",
        image: pricePanel.clone()
          .greyscale()
          .normalize()
          .modulate({ brightness: 1.5 })
          .gamma(1.7)
      },
      {
        name: "Sharpened",
        image: pricePanel.clone()
          .greyscale()
          .sharpen({ sigma: 1.5 })
      },
      {
        name: "Negative",
        image: pricePanel.clone()
          .greyscale()
          .negate()
      },
      {
        name: "Binary Threshold",
        image: pricePanel.clone()
          .greyscale()
          .threshold(128)
      },
      {
        name: "Color Enhanced",
        image: pricePanel.clone()
          .modulate({ brightness: 1.2, saturation: 1.3 })
      }
    ];
    
    // Process each technique
    const results: OCRResult[] = [];
    
    for (let i = 0; i < processes.length; i++) {
      const process = processes[i];
      const buffer = await process.image.toBuffer();
      
      // Save processed image
      fs.writeFileSync(`ocr_test_${i}_${process.name.toLowerCase().replace(/\s/g, '_')}.png`, buffer);
      
      // Perform OCR
      console.log(`Running OCR with method: ${process.name}`);
      const result = await Tesseract.recognize(buffer, 'eng', { 
        logger: () => {} 
      });
      
      // Extract numeric values with regex
      const numericMatches = result.data.text.match(/(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?)/g);
      
      if (numericMatches && numericMatches.length > 0) {
        // For each found numeric value
        for (const match of numericMatches) {
          // Only add if value is reasonable for a price
          const value = parseFloat(match.replace(/,/g, ''));
          if (!isNaN(value) && value > 10) { // Assuming prices are usually above 10
            results.push({
              method: process.name,
              text: match,
              confidence: result.data.confidence
            });
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error testing OCR techniques:', error);
    return [];
  }
}

/**
 * Analyze and display OCR results with statistical analysis
 */
function analyzeResults(results: OCRResult[]): void {
  if (results.length === 0) {
    console.log("❌ No numeric values detected by any method.");
    return;
  }
  
  console.log("\n=== OCR RESULTS ANALYSIS ===");
  
  // Group results by detected value
  const valueGroups = new Map<string, OCRResult[]>();
  
  for (const result of results) {
    // Normalize value format (remove commas)
    const normalizedValue = result.text.replace(/,/g, '');
    
    if (!valueGroups.has(normalizedValue)) {
      valueGroups.set(normalizedValue, []);
    }
    
    valueGroups.get(normalizedValue)!.push(result);
  }
  
  // Sort groups by frequency (most frequent first)
  const sortedGroups = Array.from(valueGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  // Display results
  console.log(`Found ${results.length} total numeric values across all methods.`);
  console.log(`Detected ${valueGroups.size} unique values.\n`);
  
  console.log("MOST LIKELY VALUES (by frequency):");
  sortedGroups.forEach(([value, occurrences], index) => {
    const percentage = (occurrences.length / results.length * 100).toFixed(1);
    console.log(`${index + 1}. Value: ${value} (${occurrences.length} occurrences, ${percentage}%)`);
    console.log(`   Detected by: ${occurrences.map(o => o.method).join(', ')}`);
  });
  
  console.log("\nMETHOD EFFECTIVENESS:");
  const methodCounts = new Map<string, number>();
  
  for (const result of results) {
    methodCounts.set(result.method, (methodCounts.get(result.method) || 0) + 1);
  }
  
  // Sort methods by number of detected values
  const sortedMethods = Array.from(methodCounts.entries())
    .sort((a, b) => b[1] - a[1]);
  
  sortedMethods.forEach(([method, count]) => {
    const percentage = (count / results.length * 100).toFixed(1);
    console.log(`${method}: ${count} values (${percentage}%)`);
  });
  
  // Most likely correct value (highest frequency)
  const mostLikelyValue = sortedGroups[0][0];
  const mostLikelyCount = sortedGroups[0][1].length;
  const confidence = (mostLikelyCount / results.length * 100).toFixed(1);
  
  console.log(`\n✅ MOST LIKELY CORRECT VALUE: ${mostLikelyValue} (Confidence: ${confidence}%)`);
}

/**
 * Main test function
 */
async function runOCRComparisonTest() {
  try {
    console.log("🔍 STARTING OCR COMPARISON TEST");
    
    // Get latest screenshot
    const imagePath = await getLatestScreenshot(TEST_DIR);
    console.log(`Testing image: ${path.basename(imagePath)}`);
    
    // Test multiple OCR techniques
    const results = await testMultipleOCRTechniques(imagePath);
    
    // Analyze and display results
    analyzeResults(results);
    
    console.log("\n✅ TEST COMPLETED");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
runOCRComparisonTest(); 