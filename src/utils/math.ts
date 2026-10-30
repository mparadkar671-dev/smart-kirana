// Mathematical & Accounting precision utilities for Kirana POS
// Enforces integer paise math (amount * 100) to eliminate IEEE 754 floating point rounding errors.

/**
 * Converts a rupee amount to integer paise (e.g. 12.50 -> 1250)
 */
export function toPaise(rupees: number): number {
  return Math.round((rupees + Number.EPSILON) * 100);
}

/**
 * Converts integer paise back to rupees (e.g. 1250 -> 12.50)
 */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Rounds a quantity or weight to 3 decimal places (e.g. 0.250 kg)
 */
export function roundQty(qty: number): number {
  return Math.round((qty + Number.EPSILON) * 1000) / 1000;
}

/**
 * Rounds a monetary amount to 2 decimal places cleanly
 */
export function roundCurrency(amount: number): number {
  return toRupees(toPaise(amount));
}

/**
 * Multiplies quantity with unit price in paise precision
 * line_total = round((qty * unit_price_paise) / 100) / 100
 */
export function calculateLineTotal(qty: number, unitPrice: number): number {
  const pricePaise = toPaise(unitPrice);
  const totalPaise = Math.round(qty * pricePaise);
  return toRupees(totalPaise);
}

/**
 * Reverse Price-to-Weight Loose Item Formula:
 * When a customer asks for ₹X worth of a loose item priced at ₹R per Kg:
 * exact deducted weight in Kg is Wkg = round(X / R, 3)
 * Example: ₹30 of peanuts at ₹120/kg -> 30 / 120 = 0.250 kg (250 grams)
 */
export function calculateReverseWeight(rupeeAmount: number, ratePerKg: number): number {
  if (ratePerKg <= 0 || rupeeAmount <= 0) return 0;
  return roundQty(rupeeAmount / ratePerKg);
}

/**
 * Formats a monetary amount into standard Indian Rupee notation (e.g., ₹1,23,456.00)
 */
export function formatINR(amount: number): string {
  const rounded = roundCurrency(amount);
  const parts = Math.abs(rounded).toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  // Indian number grouping: last 3 digits, then groups of 2
  if (integerPart.length > 3) {
    const lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    integerPart = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }

  const sign = rounded < 0 ? '-' : '';
  return `${sign}₹${integerPart}.${decimalPart}`;
}

/**
 * Returns rupee amount formatted to 2 decimals without symbol
 */
export function formatRupees(amount: number): string {
  return roundCurrency(amount).toFixed(2);
}

/**
 * Formats quantity with appropriate unit label (e.g., "1.250 kg" or "5 PCS")
 */
export function formatQuantity(qty: number, unitType: string): string {
  const cleanQty = roundQty(qty);
  if (unitType === 'KG_LOOSE') {
    if (cleanQty < 1) {
      return `${Math.round(cleanQty * 1000)}g`;
    }
    return `${cleanQty.toFixed(3)} kg`;
  }
  if (unitType === 'LTR') {
    if (cleanQty < 1) {
      return `${Math.round(cleanQty * 1000)} ml`;
    }
    return `${cleanQty.toFixed(3)} L`;
  }
  return `${cleanQty} ${unitType}`;
}

/**
 * Calculates profit margin percentage: ((selling - purchase) / selling) * 100
 */
export function calculateProfitMarginPercent(purchasePrice: number, sellingPrice: number): number {
  if (sellingPrice <= 0) return 0;
  const margin = ((sellingPrice - purchasePrice) / sellingPrice) * 100;
  return Math.round((margin + Number.EPSILON) * 10) / 10;
}

