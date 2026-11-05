/**
 * GS1 In-Store EAN-13 Barcode Generator Utility
 * Generates collision-free 13-digit EAN-13 retail barcodes with prefix "200"
 * and a mathematically valid Modulo-10 check digit.
 */

/**
 * Computes the standard GS1 EAN-13 Modulo-10 check digit for a 12-digit numeric string.
 * Weights alternate 1, 3, 1, 3... from left to right (indices 0..11).
 */
export function calculateEan13CheckDigit(first12Digits: string): number {
  if (!/^\d{12}$/.test(first12Digits)) {
    throw new Error('EAN-13 payload must be exactly 12 numeric digits before check digit calculation');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12Digits[i]);
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * Validates whether a 13-digit string is a valid EAN-13 barcode with correct Modulo-10 check digit.
 */
export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  const first12 = barcode.slice(0, 12);
  const expectedCheck = calculateEan13CheckDigit(first12);
  return Number(barcode[12]) === expectedCheck;
}

/**
 * Pure function that generates a unique 13-digit EAN-13 barcode starting with GS1 in-store prefix '200'
 * guaranteed not to collide with any barcode in existingBarcodes.
 */
export function generateUniqueStoreBarcode(existingBarcodes: Set<string> = new Set()): string {
  const maxAttempts = 500;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate 9 random digits for positions 4..12
    const random9 = Math.floor(100000000 + Math.random() * 900000000).toString();
    const first12 = `200${random9}`;
    const checkDigit = calculateEan13CheckDigit(first12);
    const candidate = `${first12}${checkDigit}`;

    if (!existingBarcodes.has(candidate)) {
      return candidate;
    }
  }

  // Fallback deterministic counter if random space was somehow exhausted
  let counter = 1;
  while (true) {
    const padded9 = String(counter).padStart(9, '0').slice(-9);
    const first12 = `200${padded9}`;
    const checkDigit = calculateEan13CheckDigit(first12);
    const candidate = `${first12}${checkDigit}`;
    if (!existingBarcodes.has(candidate)) {
      return candidate;
    }
    counter++;
  }
}

/**
 * Generates deterministic visual bar widths for rendering a clean SVG barcode preview
 */
export function getBarcodePatternBars(barcode: string): number[] {
  const clean = (barcode || '2000000000000').replace(/\D/g, '').padEnd(13, '0').slice(0, 13);
  const bars: number[] = [2, 1, 2]; // Start guard
  for (let i = 0; i < clean.length; i++) {
    const d = Number(clean[i]);
    bars.push((d % 3) + 1, ((d + 1) % 2) + 1, ((d + 2) % 3) + 1, 1);
    if (i === 6) {
      bars.push(1, 2, 1, 2, 1); // Center guard
    }
  }
  bars.push(2, 1, 2); // End guard
  return bars;
}
