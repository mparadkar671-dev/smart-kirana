import { normalizeProductImageToSquare } from './productImageEngine';

/**
 * Compresses and normalizes an uploaded product image file into a compact 160x160px square WebP DataURL (< 15KB).
 */
export async function compressProductImage(file: File): Promise<string> {
  return normalizeProductImageToSquare(file, 'contain');
}
