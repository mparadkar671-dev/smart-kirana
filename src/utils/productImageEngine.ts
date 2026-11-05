/**
 * Standardized 160x160px (1:1 Square) Product Image Normalizer & Smart Brand Thumbnail Engine
 * Ensures 100% uniform 160x160px product visuals across Inventory Master & POS Top-24 Fast-Tap Grid.
 */

const TARGET_SIZE = 160;
const MAX_BYTES = 15 * 1024; // 15 KB max per product image

export interface BrandPalette {
  bgLight: string;
  primary: string;
  accent: string;
  textDark: string;
  badgeText: string;
  shape: 'POUCH' | 'BOWL' | 'BOTTLE' | 'BAR';
  iconGlyph: string;
}

/**
 * Selects a realistic Indian Kirana brand/item color palette and pack silhouette
 */
export function resolveBrandPalette(
  name: string,
  marathiName: string = '',
  category: string = '',
  unitType: string = 'PCS'
): BrandPalette {
  const combined = `${name} ${marathiName} ${category}`.toLowerCase();

  // 1. Everest / Maggi / Haldi / Mirchi / Spices & Masalas (Yellow + Red)
  if (
    combined.includes('everest') ||
    combined.includes('maggi') ||
    combined.includes('haldi') ||
    combined.includes('turmeric') ||
    combined.includes('हळद') ||
    combined.includes('mirchi') ||
    combined.includes('tikhat') ||
    combined.includes('तिखट') ||
    combined.includes('masala') ||
    combined.includes('मसाला') ||
    combined.includes('suhana') ||
    combined.includes('ambari') ||
    combined.includes('ramdev')
  ) {
    // Special case: Gagangiri / Hirwa / Green Masala -> Green
    if (combined.includes('gagangiri') || combined.includes('hirwa') || combined.includes('हिरवा')) {
      return {
        bgLight: '#DCFCE7',
        primary: '#15803D',
        accent: '#166534',
        textDark: '#052E16',
        badgeText: 'MASALA',
        shape: 'POUCH',
        iconGlyph: '🌿',
      };
    }
    return {
      bgLight: '#FEF08A',
      primary: '#DC2626',
      accent: '#B91C1C',
      textDark: '#7F1D1D',
      badgeText: combined.includes('maggi') ? 'NOODLES' : 'SPICES',
      shape: 'POUCH',
      iconGlyph: combined.includes('maggi') ? '🍜' : '🌶️',
    };
  }

  // 2. Vim / Dettol / Green Moong / Sabzi / Cleaning Green
  if (
    combined.includes('vim') ||
    combined.includes('dettol') ||
    combined.includes('moong') ||
    combined.includes('मूग') ||
    combined.includes('hirve') ||
    combined.includes('vatana') ||
    combined.includes('वाटाणा') ||
    combined.includes('medimix') ||
    combined.includes('cinthol')
  ) {
    const isDal = combined.includes('moong') || combined.includes('मूग') || combined.includes('vatana');
    return {
      bgLight: '#DCFCE7',
      primary: '#16A34A',
      accent: '#14532D',
      textDark: '#052E16',
      badgeText: isDal ? 'PULSES' : 'HOME CARE',
      shape: isDal ? 'BOWL' : 'BAR',
      iconGlyph: isDal ? '🥣' : '🧼',
    };
  }

  // 3. Parachute / Rin / Surf Excel / Wheel / Clinic Plus / Salt / Milk (Royal Blue)
  if (
    combined.includes('parachute') ||
    combined.includes('coconut oil') ||
    combined.includes('खोबरेल') ||
    combined.includes('rin') ||
    combined.includes('surf') ||
    combined.includes('wheel') ||
    combined.includes('nirma') ||
    combined.includes('clinic') ||
    combined.includes('salt') ||
    combined.includes('मीठ') ||
    combined.includes('milk') ||
    combined.includes('दूध') ||
    combined.includes('dahi') ||
    combined.includes('curd')
  ) {
    const isBottle = combined.includes('parachute') || combined.includes('oil') || combined.includes('तेल');
    return {
      bgLight: '#DBEAFE',
      primary: '#1D4ED8',
      accent: '#1E3A8A',
      textDark: '#172554',
      badgeText: isBottle ? 'HAIR OIL' : 'DAILY',
      shape: isBottle ? 'BOTTLE' : 'POUCH',
      iconGlyph: isBottle ? '💧' : combined.includes('milk') || combined.includes('दूध') ? '🥛' : '✨',
    };
  }

  // 4. Dals, Pulses, Besan, Shengdane, Jaggery, Edible Oils, Ghee (Golden Yellow / Amber)
  if (
    combined.includes('dal') ||
    combined.includes('डाळ') ||
    combined.includes('toor') ||
    combined.includes('तूर') ||
    combined.includes('chana') ||
    combined.includes('हरभरा') ||
    combined.includes('masoor') ||
    combined.includes('मसूर') ||
    combined.includes('udid') ||
    combined.includes('उडीद') ||
    combined.includes('matki') ||
    combined.includes('मटकी') ||
    combined.includes('chawli') ||
    combined.includes('चवळी') ||
    combined.includes('besan') ||
    combined.includes('बेसन') ||
    combined.includes('shengdan') ||
    combined.includes('शेंगदाणे') ||
    combined.includes('groundnut') ||
    combined.includes('oil') ||
    combined.includes('तेल') ||
    combined.includes('ghee') ||
    combined.includes('तूप') ||
    combined.includes('gul') ||
    combined.includes('गूळ') ||
    combined.includes('jaggery')
  ) {
    const isOil = combined.includes('oil') || combined.includes('तेल') || combined.includes('ghee') || combined.includes('तूप');
    return {
      bgLight: '#FEF3C7',
      primary: '#D97706',
      accent: '#92400E',
      textDark: '#451A03',
      badgeText: isOil ? 'OIL & GHEE' : 'GRAINS & DAL',
      shape: isOil ? 'POUCH' : 'BOWL',
      iconGlyph: isOil ? '🌻' : '🌾',
    };
  }

  // 5. Tea (Chaha), Coffee, Biscuits (Parle-G, Good Day, Marie), Bakery (Rich Terracotta / Brown)
  if (
    combined.includes('tea') ||
    combined.includes('chaha') ||
    combined.includes('चहा') ||
    combined.includes('society') ||
    combined.includes('red label') ||
    combined.includes('wagh bakri') ||
    combined.includes('coffee') ||
    combined.includes('कॉफी') ||
    combined.includes('parle') ||
    combined.includes('बिस्कीट') ||
    combined.includes('biscuit') ||
    combined.includes('good day') ||
    combined.includes('marie') ||
    combined.includes('bourbon') ||
    combined.includes('krackjack') ||
    combined.includes('monaco') ||
    combined.includes('toast') ||
    combined.includes('khari')
  ) {
    const isTea = combined.includes('tea') || combined.includes('chaha') || combined.includes('चहा') || combined.includes('coffee');
    return {
      bgLight: '#FFEDD5',
      primary: '#C2410C',
      accent: '#7C2D12',
      textDark: '#431407',
      badgeText: isTea ? 'TEA & BEV' : 'BISCUITS',
      shape: 'POUCH',
      iconGlyph: isTea ? '☕' : '🍪',
    };
  }

  // 6. Soaps & Personal Care (Lifebuoy, Lux, Santoor, Colgate) -> Coral / Rose
  if (
    combined.includes('soap') ||
    combined.includes('saban') ||
    combined.includes('साबण') ||
    combined.includes('lifebuoy') ||
    combined.includes('lux') ||
    combined.includes('santoor') ||
    combined.includes('pears') ||
    combined.includes('dove') ||
    combined.includes('colgate') ||
    combined.includes('toothpaste') ||
    combined.includes('पेस्ट') ||
    combined.includes('shampoo') ||
    combined.includes('शॅम्पू')
  ) {
    return {
      bgLight: '#FFE4E6',
      primary: '#E11D48',
      accent: '#9F1239',
      textDark: '#4C0519',
      badgeText: 'PERSONAL',
      shape: 'BAR',
      iconGlyph: '🫧',
    };
  }

  // 7. Sugar, Rice, Poha, Rava, Sabudana, Atta, Maida, Onion, Potato, Garlic -> Teal / Slate
  const isLoose = unitType === 'KG_LOOSE';
  return {
    bgLight: '#F0FDFA',
    primary: '#0D9488',
    accent: '#115E59',
    textDark: '#042F2E',
    badgeText: isLoose ? 'LOOSE KG' : 'KIRANA',
    shape: isLoose ? 'BOWL' : 'POUCH',
    iconGlyph: isLoose ? '⚖️' : '🛍️',
  };
}

/**
 * Generates a crisp 160x160px (1:1 square) product thumbnail on HTML5 <canvas> (with SVG fallback for JSDOM).
 */
export function generateSmartProductThumbnail(params: {
  name: string;
  marathiName?: string;
  category?: string;
  unitType?: string;
}): string {
  const { name, marathiName = '', category = 'Kirana', unitType = 'PCS' } = params;
  const palette = resolveBrandPalette(name, marathiName, category, unitType);

  const primaryTitle = (marathiName || name || 'किराणा').trim();
  const secondaryTitle = (name || '').replace(marathiName, '').replace(/[()]/g, '').trim();

  const shortTop = primaryTitle.length > 14 ? primaryTitle.slice(0, 13) + '…' : primaryTitle;
  const shortSub = secondaryTitle.length > 18 ? secondaryTitle.slice(0, 17) + '…' : secondaryTitle;

  const isJsdom =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    /jsdom/i.test(navigator.userAgent);

  try {
    if (typeof document !== 'undefined' && !isJsdom) {
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // 1. Pure #FFFFFF studio outer frame
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

        // 2. Soft studio card inner background (rounded)
        ctx.fillStyle = palette.bgLight;
        ctx.beginPath();
        ctx.roundRect(6, 6, TARGET_SIZE - 12, TARGET_SIZE - 12, 16);
        ctx.fill();

        // 3. Top Category Pill Ribbon
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.roundRect(16, 14, TARGET_SIZE - 32, 20, 10);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(palette.badgeText, TARGET_SIZE / 2, 24);

        // 4. Center Product Pack / Bowl Illustration
        if (palette.shape === 'BOWL') {
          // Grain / Dal Bowl
          ctx.fillStyle = palette.primary;
          ctx.beginPath();
          ctx.arc(TARGET_SIZE / 2, 68, 24, 0, Math.PI, false);
          ctx.fill();

          ctx.fillStyle = palette.accent;
          ctx.beginPath();
          ctx.ellipse(TARGET_SIZE / 2, 68, 24, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (palette.shape === 'BOTTLE') {
          // Bottle silhouette
          ctx.fillStyle = palette.primary;
          ctx.beginPath();
          ctx.roundRect(TARGET_SIZE / 2 - 14, 52, 28, 38, 8);
          ctx.fill();
          ctx.fillStyle = palette.accent;
          ctx.fillRect(TARGET_SIZE / 2 - 7, 42, 14, 10);
        } else if (palette.shape === 'BAR') {
          // Soap / Bar silhouette
          ctx.fillStyle = palette.primary;
          ctx.beginPath();
          ctx.roundRect(TARGET_SIZE / 2 - 26, 54, 52, 32, 10);
          ctx.fill();
        } else {
          // FMCG Retail Pouch silhouette
          ctx.fillStyle = palette.primary;
          ctx.beginPath();
          ctx.roundRect(TARGET_SIZE / 2 - 22, 44, 44, 46, 6);
          ctx.fill();

          // Top & bottom crimp seals
          ctx.fillStyle = palette.accent;
          ctx.fillRect(TARGET_SIZE / 2 - 22, 44, 44, 5);
          ctx.fillRect(TARGET_SIZE / 2 - 22, 85, 44, 5);
        }

        // Icon Glyph inside pack
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(palette.iconGlyph, TARGET_SIZE / 2, 68);

        // 5. Marathi Title Badge at Bottom
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(12, 98, TARGET_SIZE - 24, 48, 10);
        ctx.fill();
        ctx.strokeStyle = palette.primary;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = palette.textDark;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shortTop, TARGET_SIZE / 2, 115);

        if (shortSub) {
          ctx.fillStyle = '#475569';
          ctx.font = '600 9.5px system-ui, sans-serif';
          ctx.fillText(shortSub, TARGET_SIZE / 2, 133);
        }

        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        if (dataUrl && dataUrl.startsWith('data:image/')) {
          return dataUrl;
        }
      }
    }
  } catch {
    // Fallback to deterministic 160x160 SVG DataURL (e.g. in JSDOM test environments)
  }

  // Crisp 160x160 SVG DataURL Fallback (100% deterministic in JSDOM and browsers)
  const safeTop = shortTop.replace(/[<>&"']/g, '');
  const safeSub = shortSub.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" fill="#FFFFFF"/>
    <rect x="6" y="6" width="148" height="148" rx="16" fill="${palette.bgLight}"/>
    <rect x="16" y="14" width="128" height="20" rx="10" fill="${palette.accent}"/>
    <text x="80" y="27" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="9" font-weight="bold">${palette.badgeText}</text>
    <rect x="54" y="44" width="52" height="46" rx="8" fill="${palette.primary}"/>
    <text x="80" y="73" text-anchor="middle" font-size="22">${palette.iconGlyph}</text>
    <rect x="12" y="98" width="136" height="48" rx="10" fill="#FFFFFF" stroke="${palette.primary}" stroke-width="1.5"/>
    <text x="80" y="117" text-anchor="middle" fill="${palette.textDark}" font-family="sans-serif" font-size="12" font-weight="bold">${safeTop}</text>
    <text x="80" y="135" text-anchor="middle" fill="#475569" font-family="sans-serif" font-size="9.5" font-weight="bold">${safeSub}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Uniform Upload Cropper:
 * Normalizes any uploaded/pasted/dragged product photo onto a 160x160px pure #FFFFFF square canvas
 * and exports it as a compact WebP DataURL (< 15KB).
 */
export async function normalizeProductImageToSquare(
  fileOrDataUrl: File | Blob | string,
  fitMode: 'contain' | 'cover' = 'contain'
): Promise<string> {
  if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image/svg+xml')) {
    return fileOrDataUrl;
  }

  const dataUrlSource: string = await new Promise((resolve, reject) => {
    if (typeof fileOrDataUrl === 'string') {
      resolve(fileOrDataUrl);
      return;
    }
    if (!fileOrDataUrl.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, WebP)'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(fileOrDataUrl);
  });

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finishWithFallback = () => {
      if (settled) return;
      settled = true;
      resolve(
        'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
      );
    };

    const timer = setTimeout(finishWithFallback, 700);

    img.onerror = () => {
      clearTimeout(timer);
      finishWithFallback();
    };

    img.onload = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrlSource);
          return;
        }

        // Fill pure #FFFFFF studio square background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

        const srcW = img.width || TARGET_SIZE;
        const srcH = img.height || TARGET_SIZE;

        if (fitMode === 'cover') {
          const minDim = Math.min(srcW, srcH);
          const sx = Math.floor((srcW - minDim) / 2);
          const sy = Math.floor((srcH - minDim) / 2);
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);
        } else {
          // Center-fit ('contain') with 6px studio padding so full product pack is visible
          const pad = 6;
          const avail = TARGET_SIZE - pad * 2;
          const scale = Math.min(avail / srcW, avail / srcH);
          const drawW = Math.round(srcW * scale);
          const drawH = Math.round(srcH * scale);
          const dx = Math.floor((TARGET_SIZE - drawW) / 2);
          const dy = Math.floor((TARGET_SIZE - drawH) / 2);
          ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
        }

        let quality = 0.82;
        let out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) {
          out = canvas.toDataURL('image/jpeg', quality);
        }

        while (out.length * 0.75 > MAX_BYTES && quality > 0.35) {
          quality -= 0.12;
          out = canvas.toDataURL('image/webp', quality);
        }

        resolve(out);
      } catch {
        resolve(
          'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
        );
      }
    };

    img.src = dataUrlSource;
  });
}
