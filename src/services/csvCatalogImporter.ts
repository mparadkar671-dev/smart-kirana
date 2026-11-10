import { db, kiranaDb } from '../db/db';
import { Product, UnitType } from '../types';
import { generateUniqueStoreBarcode } from '../utils/barcodeGenerator';
import { generateSmartProductThumbnail } from '../utils/productImageEngine';
import { cloudSyncService } from './cloudSyncService';
import { unmarkProductsDeletedTombstone, isLegacyDuplicateProductId } from './inventoryService';
import { MAHARASHTRA_170_KIRANA_CATALOG } from './maharashtra170Catalog';

export { MAHARASHTRA_170_KIRANA_CATALOG } from './maharashtra170Catalog';
export const MASTER_KIRANA_CATALOG = MAHARASHTRA_170_KIRANA_CATALOG;

export interface RawSheetProductRow {
  marathiName: string;
  englishName: string;
  category: string;
  searchKeywords: string;
  sellPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  availableStock?: number;
  unitType?: UnitType;
  isQuickTap?: boolean;
}

/**
 * 105-Product Authentic Maharashtra Kirana Master Catalog
 * (Product Name Marathi, Product Name English, Category, POS Search Keywords, Default Prices & Unit)
 */
export const MAHARASHTRA_105_KIRANA_CATALOG: RawSheetProductRow[] = [
  // --- 1 to 18: DALS, PULSES & KADDHANYA (डाळी आणि कडधान्ये - KG_LOOSE) ---
  { marathiName: 'तूर डाळ', englishName: 'Toor Dal (Arhar)', category: 'Grains & Pulses', searchKeywords: 'toor dal, arhar dal, turdal, तुरीची डाळ, तूर डाळ, dal', sellPrice: 160, purchasePrice: 142, mrp: 170, availableStock: 25, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'मूग डाळ', englishName: 'Moong Dal', category: 'Grains & Pulses', searchKeywords: 'moong dal, mug dal, मुगाची डाळ, मूग डाळ, yellow dal', sellPrice: 125, purchasePrice: 108, mrp: 135, availableStock: 20, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'हरभरा डाळ', englishName: 'Chana Dal', category: 'Grains & Pulses', searchKeywords: 'chana dal, harbhara dal, चणा डाळ, हरभरा डाळ, besan dal', sellPrice: 95, purchasePrice: 82, mrp: 105, availableStock: 25, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'उडीद डाळ', englishName: 'Urad Dal (White)', category: 'Grains & Pulses', searchKeywords: 'urad dal, udid dal, उडीद डाळ, पांढरी डाळ, idli dal', sellPrice: 140, purchasePrice: 122, mrp: 150, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'मसूर डाळ', englishName: 'Masoor Dal (Red Lentil)', category: 'Grains & Pulses', searchKeywords: 'masoor dal, masur dal, मसूर डाळ, लाल डाळ', sellPrice: 98, purchasePrice: 84, mrp: 110, availableStock: 18, unitType: 'KG_LOOSE' },
  { marathiName: 'हिरवे मूग', englishName: 'Green Moong Whole', category: 'Grains & Pulses', searchKeywords: 'green moong, hirve moong, हिरवे मूग, आख्खे मूग, kadhanya', sellPrice: 120, purchasePrice: 104, mrp: 130, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'मटकी (गावरान)', englishName: 'Matki (Moth Beans)', category: 'Grains & Pulses', searchKeywords: 'matki, moth beans, मटकी, उसळ मटकी, misal matki', sellPrice: 130, purchasePrice: 112, mrp: 140, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'देशी हरभरा', englishName: 'Desi Kala Chana', category: 'Grains & Pulses', searchKeywords: 'kala chana, harbhara, देशी हरभरा, काळा चणा', sellPrice: 90, purchasePrice: 76, mrp: 100, availableStock: 20, unitType: 'KG_LOOSE' },
  { marathiName: 'काबुली चणा', englishName: 'Kabuli Chana (Chole)', category: 'Grains & Pulses', searchKeywords: 'kabuli chana, chole, काबुली चणा, छोले, white chana', sellPrice: 145, purchasePrice: 126, mrp: 155, availableStock: 12, unitType: 'KG_LOOSE' },
  { marathiName: 'पांढरा वाटाणा', englishName: 'White Vatana (Peas)', category: 'Grains & Pulses', searchKeywords: 'white vatana, safed vatana, पांढरा वाटाणा, रगडा वाटाणा, usal', sellPrice: 96, purchasePrice: 82, mrp: 105, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'हिरवा वाटाणा', englishName: 'Green Vatana Dry', category: 'Grains & Pulses', searchKeywords: 'green vatana, hirwa vatana, हिरवा वाटाणा, सुका वाटाणा', sellPrice: 110, purchasePrice: 94, mrp: 120, availableStock: 12, unitType: 'KG_LOOSE' },
  { marathiName: 'चवळी (पांढरी)', englishName: 'Chawli (Black Eyed Beans)', category: 'Grains & Pulses', searchKeywords: 'chawli, lobia, चवळी, पांढरी चवळी', sellPrice: 125, purchasePrice: 108, mrp: 135, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'राजमा (लाल)', englishName: 'Red Rajma (Kidney Beans)', category: 'Grains & Pulses', searchKeywords: 'rajma, kidney beans, राजमा, लाल राजमा', sellPrice: 150, purchasePrice: 130, mrp: 165, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'कुळीथ (हुलगे)', englishName: 'Kulith (Horse Gram)', category: 'Grains & Pulses', searchKeywords: 'kulith, hulge, कुळीथ, हुलगे, पिठलं', sellPrice: 110, purchasePrice: 92, mrp: 120, availableStock: 8, unitType: 'KG_LOOSE' },
  { marathiName: 'वाल (पावटा)', englishName: 'Vaal (Field Beans)', category: 'Grains & Pulses', searchKeywords: 'vaal, pavta, वाल, पावटा, बिरडे', sellPrice: 135, purchasePrice: 115, mrp: 145, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'मसूर (आख्खा)', englishName: 'Whole Black Masoor', category: 'Grains & Pulses', searchKeywords: 'akha masoor, black lentil, आख्खा मसूर, काळा मसूर', sellPrice: 96, purchasePrice: 82, mrp: 105, availableStock: 12, unitType: 'KG_LOOSE' },
  { marathiName: 'भाजकी डाळ (फुटाणा)', englishName: 'Roasted Chana Dal (Dalia)', category: 'Grains & Pulses', searchKeywords: 'roasted chana, futana dal, भाजकी डाळ, डाळं, chutney dal', sellPrice: 120, purchasePrice: 102, mrp: 130, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'सोयाबीन वडी', englishName: 'Soya Chunks (Loose)', category: 'Grains & Pulses', searchKeywords: 'soya chunks, soyabean vadi, सोयाबीन वडी, सोया वडी', sellPrice: 110, purchasePrice: 90, mrp: 125, availableStock: 8, unitType: 'KG_LOOSE' },

  // --- 19 to 36: RICE, WHEAT, FLOURS & POHA/UPWAS (तांदूळ, धान्य, पीठ आणि उपवास - KG_LOOSE) ---
  { marathiName: 'कोलम तांदूळ', englishName: 'Surti Kolam Rice', category: 'Grains & Pulses', searchKeywords: 'kolam rice, tandul, कोलम तांदूळ, तांदूळ, chawal', sellPrice: 64, purchasePrice: 54, mrp: 70, availableStock: 50, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'इंद्रायणी तांदूळ', englishName: 'Indrayani Rice (Maval)', category: 'Grains & Pulses', searchKeywords: 'indrayani rice, tandul, इंद्रायणी तांदूळ, चिकट तांदूळ', sellPrice: 68, purchasePrice: 58, mrp: 75, availableStock: 45, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'आंबेमोहोर तांदूळ', englishName: 'Ambemohar Rice', category: 'Grains & Pulses', searchKeywords: 'ambemohar rice, आंबेमोहोर तांदूळ, सुवासिक तांदूळ', sellPrice: 95, purchasePrice: 80, mrp: 105, availableStock: 30, unitType: 'KG_LOOSE' },
  { marathiName: 'बासमती तांदूळ', englishName: 'Basmati Biryani Rice', category: 'Grains & Pulses', searchKeywords: 'basmati rice, biryani rice, बासमती तांदूळ, पुलाव तांदूळ', sellPrice: 115, purchasePrice: 96, mrp: 130, availableStock: 30, unitType: 'KG_LOOSE' },
  { marathiName: 'लोकवन गहू', englishName: 'Lokwan Wheat (MP)', category: 'Grains & Pulses', searchKeywords: 'gahu, lokwan wheat, लोकवन गहू, गहू, gehu', sellPrice: 42, purchasePrice: 36, mrp: 46, availableStock: 60, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'सिहोर गहू', englishName: 'Sharbati / Sihor Wheat', category: 'Grains & Pulses', searchKeywords: 'sharbati wheat, sihor gahu, सिहोर गहू, शरबती गहू', sellPrice: 48, purchasePrice: 41, mrp: 54, availableStock: 40, unitType: 'KG_LOOSE' },
  { marathiName: 'ज्वारी (गावरान)', englishName: 'Jowar (Sorghum)', category: 'Grains & Pulses', searchKeywords: 'jowar, jwari, ज्वारी, भाकरी ज्वारी, शाळू ज्वारी', sellPrice: 55, purchasePrice: 46, mrp: 62, availableStock: 30, unitType: 'KG_LOOSE' },
  { marathiName: 'बाजरी (गावरान)', englishName: 'Bajra (Pearl Millet)', category: 'Grains & Pulses', searchKeywords: 'bajra, bajri, बाजरी, भाकरी बाजरी', sellPrice: 46, purchasePrice: 38, mrp: 52, availableStock: 25, unitType: 'KG_LOOSE' },
  { marathiName: 'नाचणी (रागी)', englishName: 'Nachni / Ragi', category: 'Grains & Pulses', searchKeywords: 'nachni, ragi, नाचणी, नागली', sellPrice: 60, purchasePrice: 50, mrp: 68, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'कांदे पोहे (जाड)', englishName: 'Kande Pohe (Thick Poha)', category: 'Grains & Pulses', searchKeywords: 'poha, pohe, kande pohe, कांदे पोहे, जाड पोहे', sellPrice: 58, purchasePrice: 48, mrp: 65, availableStock: 30, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'पातळ पोहे (चिवडा)', englishName: 'Patal Pohe (Chivda Poha)', category: 'Grains & Pulses', searchKeywords: 'patal pohe, chivda poha, पातळ पोहे, चिवडा पोहे', sellPrice: 64, purchasePrice: 52, mrp: 72, availableStock: 15, unitType: 'KG_LOOSE' },
  { marathiName: 'रवा (बारीक / जाड)', englishName: 'Sooji / Rava (Semolina)', category: 'Grains & Pulses', searchKeywords: 'rava, sooji, suji, रवा, उपमा रवा, शिरा रवा', sellPrice: 52, purchasePrice: 43, mrp: 58, availableStock: 25, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'मैदा', englishName: 'Maida (Refined Flour)', category: 'Grains & Pulses', searchKeywords: 'maida, मैदा, भटुरा पीठ', sellPrice: 48, purchasePrice: 39, mrp: 54, availableStock: 20, unitType: 'KG_LOOSE' },
  { marathiName: 'बेसन पीठ (चणा पीठ)', englishName: 'Besan (Gram Flour)', category: 'Grains & Pulses', searchKeywords: 'besan, chana pith, बेसन पीठ, डाळीचे पीठ, भजी पीठ', sellPrice: 105, purchasePrice: 88, mrp: 115, availableStock: 20, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'आशीर्वाद गव्हाचे पीठ ५ किलो', englishName: 'Aashirvaad Atta 5kg', category: 'Grains & Pulses', searchKeywords: 'aashirvaad atta, wheat flour, गव्हाचे पीठ, आशीर्वाद आटा', sellPrice: 255, purchasePrice: 232, mrp: 270, availableStock: 10, unitType: 'PACK' },
  { marathiName: 'साबुदाणा (उपवास)', englishName: 'Sabudana (Tapioca Pearls)', category: 'Grains & Pulses', searchKeywords: 'sabudana, sago, साबुदाणा, खिचडी साबुदाणा, upwas', sellPrice: 82, purchasePrice: 68, mrp: 90, availableStock: 25, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'वरई (भगर)', englishName: 'Varai / Bhagar (Samo Rice)', category: 'Grains & Pulses', searchKeywords: 'bhagar, varai, वरई, भगर, उपवास तांदूळ', sellPrice: 120, purchasePrice: 100, mrp: 130, availableStock: 12, unitType: 'KG_LOOSE' },
  { marathiName: 'शेवया (गव्हाच्या)', englishName: 'Roasted Vermicelli (Shevaya)', category: 'Grains & Pulses', searchKeywords: 'shevaya, vermicelli, शेवया, खीर शेवया', sellPrice: 80, purchasePrice: 65, mrp: 90, availableStock: 10, unitType: 'KG_LOOSE' },

  // --- 37 to 46: SUGAR, JAGGERY, SALT & DRY FRUITS (साखर, गूळ, मीठ आणि सुकामेवा) ---
  { marathiName: 'साखर (मोठी)', englishName: 'Sugar M-30 (Loose)', category: 'Grains & Pulses', searchKeywords: 'sugar, sakhar, chini, साखर, मोठी साखर', sellPrice: 44, purchasePrice: 39.5, mrp: 48, availableStock: 80, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'सेंद्रिय गूळ (कोल्हापुरी)', englishName: 'Kolhapuri Jaggery (Gul)', category: 'Grains & Pulses', searchKeywords: 'gul, jaggery, gud, गूळ, कोल्हापुरी गूळ, सेंद्रिय गूळ', sellPrice: 68, purchasePrice: 56, mrp: 75, availableStock: 25, unitType: 'KG_LOOSE' },
  { marathiName: 'शेंगदाणे (गावरान)', englishName: 'Groundnuts / Peanuts (Shengdane)', category: 'Grains & Pulses', searchKeywords: 'shengdane, groundnut, peanuts, शेंगदाणे, दाणे, उपवास शेंगदाणे', sellPrice: 130, purchasePrice: 112, mrp: 140, availableStock: 35, unitType: 'KG_LOOSE', isQuickTap: true },
  { marathiName: 'टाटा मीठ १ किलो', englishName: 'Tata Salt 1kg', category: 'Spices & Masalas', searchKeywords: 'tata salt, mith, namak, टाटा मीठ, मीठ', sellPrice: 28, purchasePrice: 24, mrp: 28, availableStock: 40, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'सैंधव मीठ (उपवास)', englishName: 'Sendha Namak (Rock Salt) 200g', category: 'Spices & Masalas', searchKeywords: 'sendha namak, rock salt, सैंधव मीठ, उपवास मीठ', sellPrice: 25, purchasePrice: 18, mrp: 30, availableStock: 20, unitType: 'PCS' },
  { marathiName: 'सुके खोबरे (वाटी)', englishName: 'Dry Coconut (Sukhe Khobre)', category: 'Grains & Pulses', searchKeywords: 'khobre, dry coconut, copra, सुके खोबरे, खोबऱ्याची वाटी', sellPrice: 210, purchasePrice: 180, mrp: 230, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'काजू (अखंड)', englishName: 'Cashew Nuts (Kaju W320)', category: 'Grains & Pulses', searchKeywords: 'kaju, cashew, काजू, सुकामेवा', sellPrice: 820, purchasePrice: 720, mrp: 900, availableStock: 5, unitType: 'KG_LOOSE' },
  { marathiName: 'बदाम (मामरा/कॅलिफोर्निया)', englishName: 'Almonds (Badam)', category: 'Grains & Pulses', searchKeywords: 'badam, almonds, बदाम, सुकामेवा', sellPrice: 760, purchasePrice: 660, mrp: 850, availableStock: 5, unitType: 'KG_LOOSE' },
  { marathiName: 'मनुका (बेदाणे)', englishName: 'Raisins (Kishmish / Bedane)', category: 'Grains & Pulses', searchKeywords: 'manuka, bedane, kishmish, मनुका, बेदाणे', sellPrice: 280, purchasePrice: 230, mrp: 320, availableStock: 6, unitType: 'KG_LOOSE' },
  { marathiName: 'खारीक (सुकी)', englishName: 'Dry Dates (Kharik)', category: 'Grains & Pulses', searchKeywords: 'kharik, dry dates, खारीक, खोबरे खारीक', sellPrice: 260, purchasePrice: 215, mrp: 290, availableStock: 6, unitType: 'KG_LOOSE' },

  // --- 47 to 56: EDIBLE OILS & GHEE (खाद्यतेल आणि तूप) ---
  { marathiName: 'फॉर्च्युन सूर्यफूल तेल १ लि.', englishName: 'Fortune Sunlite Oil 1L Pouch', category: 'Oil & Ghee', searchKeywords: 'fortune oil, sunflower oil, tel, फॉर्च्युन तेल, सूर्यफूल तेल, गोडे तेल', sellPrice: 145, purchasePrice: 133, mrp: 155, availableStock: 35, unitType: 'PACK', isQuickTap: true },
  { marathiName: 'जेमिनी सूर्यफूल तेल १ लि.', englishName: 'Gemini Sunflower Oil 1L Pouch', category: 'Oil & Ghee', searchKeywords: 'gemini oil, tel, जेमिनी तेल, सूर्यफूल तेल', sellPrice: 144, purchasePrice: 132, mrp: 155, availableStock: 30, unitType: 'PACK', isQuickTap: true },
  { marathiName: 'सफोला गोल्ड तेल १ लि.', englishName: 'Saffola Gold Oil 1L', category: 'Oil & Ghee', searchKeywords: 'saffola oil, सफोला तेल, खाद्यतेल', sellPrice: 175, purchasePrice: 158, mrp: 190, availableStock: 15, unitType: 'PACK' },
  { marathiName: 'धारा शेंगदाणा तेल १ लि.', englishName: 'Dhara Groundnut Oil 1L', category: 'Oil & Ghee', searchKeywords: 'groundnut oil, shengdana tel, शेंगदाणा तेल, धारा तेल', sellPrice: 185, purchasePrice: 168, mrp: 200, availableStock: 20, unitType: 'PACK' },
  { marathiName: 'फॉर्च्युन सोयाबीन तेल १ लि.', englishName: 'Fortune Soyabean Oil 1L', category: 'Oil & Ghee', searchKeywords: 'soyabean oil, सोयाबीन तेल, फॉर्च्युन सोया तेल', sellPrice: 136, purchasePrice: 124, mrp: 148, availableStock: 25, unitType: 'PACK' },
  { marathiName: 'अमूल शुद्ध तूप ५०० मिली', englishName: 'Amul Pure Ghee 500ml', category: 'Oil & Ghee', searchKeywords: 'amul ghee, tup, toop, अमूल तूप, साजूक तूप', sellPrice: 325, purchasePrice: 298, mrp: 340, availableStock: 12, unitType: 'PACK' },
  { marathiName: 'गोवर्धन गाईचे तूप ५०० मिली', englishName: 'Gowardhan Cow Ghee 500ml', category: 'Oil & Ghee', searchKeywords: 'gowardhan ghee, cow ghee, गोवर्धन तूप, गाईचे तूप', sellPrice: 345, purchasePrice: 315, mrp: 360, availableStock: 12, unitType: 'PACK' },
  { marathiName: 'डालडा वनस्पती तूप ५०० ग्रॅम', englishName: 'Dalda Vanaspati 500g', category: 'Oil & Ghee', searchKeywords: 'dalda, vanaspati, डालडा, वनस्पती तूप', sellPrice: 82, purchasePrice: 70, mrp: 90, availableStock: 15, unitType: 'PACK' },
  { marathiName: 'सुट्टे गोडे तेल (१ किलो)', englishName: 'Loose Refined Oil (1kg)', category: 'Oil & Ghee', searchKeywords: 'loose oil, sutte tel, सुट्टे तेल, गोडे तेल', sellPrice: 132, purchasePrice: 118, mrp: 140, availableStock: 20, unitType: 'KG_LOOSE' },
  { marathiName: 'मोहरी तेल (सरसो) ५०० मिली', englishName: 'Mustard Oil (Sarso) 500ml', category: 'Oil & Ghee', searchKeywords: 'mustard oil, sarso tel, मोहरी तेल, राईचे तेल', sellPrice: 92, purchasePrice: 78, mrp: 105, availableStock: 10, unitType: 'PCS' },

  // --- 57 to 74: SPICES & MASALAS (मसाले आणि फोडणी साहित्य) ---
  { marathiName: 'गगंगिरी हिरवा मसाला', englishName: 'Gagangiri Hirwa Masala 50g', category: 'Spices & Masalas', searchKeywords: 'gagangiri, hirwa masala, गगंगिरी हिरवा मसाला, हिरवा मसाला', sellPrice: 30, purchasePrice: 24, mrp: 32, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'एव्हरेस्ट तिखट लाल १०० ग्रॅम', englishName: 'Everest Tikhalal Chilli Powder 100g', category: 'Spices & Masalas', searchKeywords: 'everest tikhalal, mirchi powder, lal tikhat, लाल तिखट, मिरची पावडर', sellPrice: 68, purchasePrice: 56, mrp: 72, availableStock: 25, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'एव्हरेस्ट हळद पावडर १०० ग्रॅम', englishName: 'Everest Turmeric (Haldi) 100g', category: 'Spices & Masalas', searchKeywords: 'haldi powder, turmeric, हळद पावडर, एव्हरेस्ट हळद', sellPrice: 44, purchasePrice: 36, mrp: 48, availableStock: 25, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'एव्हरेस्ट मटन मसाला ५० ग्रॅम', englishName: 'Everest Meat / Mutton Masala 50g', category: 'Spices & Masalas', searchKeywords: 'everest mutton masala, meat masala, मटन मसाला, एव्हरेस्ट मसाला', sellPrice: 48, purchasePrice: 39, mrp: 52, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'एव्हरेस्ट चिकन मसाला ५० ग्रॅम', englishName: 'Everest Chicken Masala 50g', category: 'Spices & Masalas', searchKeywords: 'chicken masala, चिकन मसाला, एव्हरेस्ट चिकन', sellPrice: 46, purchasePrice: 38, mrp: 50, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'सुहाना कांदा लसूण मसाला २०० ग्रॅम', englishName: 'Suhana Kanda Lasun Masala 200g', category: 'Spices & Masalas', searchKeywords: 'kanda lasun masala, ambari, suhana, कांदा लसूण मसाला, घाटी मसाला', sellPrice: 78, purchasePrice: 64, mrp: 85, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'प्रवीण गोडा मसाला १०० ग्रॅम', englishName: 'Pravin Goda Masala 100g', category: 'Spices & Masalas', searchKeywords: 'goda masala, kala masala, गोडा मसाला, काळा मसाला, प्रवीण', sellPrice: 58, purchasePrice: 47, mrp: 64, availableStock: 20, unitType: 'PCS' },
  { marathiName: 'मॅगी मसाला-ए-मॅजिक (पुडी)', englishName: 'Maggi Masala-ae-Magic Sachet', category: 'Spices & Masalas', searchKeywords: 'maggi masala, magic masala, मॅगी मसाला, ५ रुपयाचा मसाला', sellPrice: 5, purchasePrice: 4.1, mrp: 5, availableStock: 60, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'धने पावडर १०० ग्रॅम', englishName: 'Coriander (Dhaniya) Powder 100g', category: 'Spices & Masalas', searchKeywords: 'dhana powder, coriander powder, धने पावडर, धणा पावडर', sellPrice: 38, purchasePrice: 30, mrp: 42, availableStock: 20, unitType: 'PCS' },
  { marathiName: 'जिरे (गावरान)', englishName: 'Cumin Seeds (Jeera)', category: 'Spices & Masalas', searchKeywords: 'jeera, jire, cumin, जिरे, फोडणी जिरे', sellPrice: 460, purchasePrice: 390, mrp: 500, availableStock: 5, unitType: 'KG_LOOSE' },
  { marathiName: 'मोहरी (राई)', englishName: 'Mustard Seeds (Mohari / Rai)', category: 'Spices & Masalas', searchKeywords: 'mohari, rai, mustard seeds, मोहरी, राई, फोडणी', sellPrice: 120, purchasePrice: 95, mrp: 140, availableStock: 8, unitType: 'KG_LOOSE' },
  { marathiName: 'हिंग डबी (रामबंधू / एलजी)', englishName: 'LG / Rambandhu Hing 50g', category: 'Spices & Masalas', searchKeywords: 'hing, asafoetida, हिंग, एलजी हिंग, फोडणी हिंग', sellPrice: 72, purchasePrice: 58, mrp: 78, availableStock: 20, unitType: 'PCS' },
  { marathiName: 'ओवा (गावरान)', englishName: 'Ajwain (Carom Seeds) 100g', category: 'Spices & Masalas', searchKeywords: 'ova, ajwain, ओवा', sellPrice: 35, purchasePrice: 26, mrp: 40, availableStock: 15, unitType: 'PCS' },
  { marathiName: 'बडीशेप (भाजलेली)', englishName: 'Saunf (Fennel Seeds) 100g', category: 'Spices & Masalas', searchKeywords: 'badishep, saunf, बडीशेप, मुखवास', sellPrice: 38, purchasePrice: 28, mrp: 45, availableStock: 15, unitType: 'PCS' },
  { marathiName: 'पांढरे तीळ', englishName: 'White Sesame Seeds (Til)', category: 'Spices & Masalas', searchKeywords: 'til, sesame, पांढरे तीळ, तीळ', sellPrice: 220, purchasePrice: 185, mrp: 240, availableStock: 8, unitType: 'KG_LOOSE' },
  { marathiName: 'मेथी दाणे', englishName: 'Fenugreek Seeds (Methi Dane) 100g', category: 'Spices & Masalas', searchKeywords: 'methi dane, fenugreek, मेथी दाणे', sellPrice: 22, purchasePrice: 16, mrp: 28, availableStock: 15, unitType: 'PCS' },
  { marathiName: 'खडा मसाला पाकीट', englishName: 'Whole Garam Masala Mix Pack', category: 'Spices & Masalas', searchKeywords: 'khada masala, garam masala, खडा मसाला, लवंग मिरी दालचिनी', sellPrice: 20, purchasePrice: 14, mrp: 25, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'चिंच (बिया नसलेली)', englishName: 'Seedless Tamarind (Chinch) 250g', category: 'Spices & Masalas', searchKeywords: 'chinch, imli, tamarind, चिंच', sellPrice: 48, purchasePrice: 38, mrp: 55, availableStock: 15, unitType: 'PACK' },

  // --- 75 to 86: TEA, COFFEE, BISCUITS & SNACKS (चहा, कॉफी, बिस्कीट आणि नाश्ता) ---
  { marathiName: 'सोसायटी चहा २५० ग्रॅम', englishName: 'Society Tea 250g Pack', category: 'Tea & Beverages', searchKeywords: 'society tea, chaha, patti, सोसायटी चहा, चहा पत्ती', sellPrice: 135, purchasePrice: 121, mrp: 140, availableStock: 25, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'वाघ बकरी चहा २५० ग्रॅम', englishName: 'Wagh Bakri Premium Tea 250g', category: 'Tea & Beverages', searchKeywords: 'wagh bakri tea, chaha, वाघ बकरी चहा, चहा पावडर', sellPrice: 132, purchasePrice: 118, mrp: 138, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'ब्रुक बॉन्ड रेड लेबल २५० ग्रॅम', englishName: 'Red Label Tea 250g', category: 'Tea & Beverages', searchKeywords: 'red label tea, chaha, रेड लेबल चहा', sellPrice: 130, purchasePrice: 116, mrp: 135, availableStock: 20, unitType: 'PCS' },
  { marathiName: 'टाटा टी अग्नि २५० ग्रॅम', englishName: 'Tata Tea Agni 250g', category: 'Tea & Beverages', searchKeywords: 'tata tea agni, chaha, टाटा चहा अग्नि', sellPrice: 72, purchasePrice: 62, mrp: 75, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'नेस्कॅफे कॉफी पाऊच', englishName: 'Nescafe Classic Coffee Sachet', category: 'Tea & Beverages', searchKeywords: 'nescafe, bru, coffee, कॉफी पुडी, नेस्कॅफे कॉफी', sellPrice: 10, purchasePrice: 8.5, mrp: 10, availableStock: 40, unitType: 'PCS' },
  { marathiName: 'पारले-जी बिस्कीट (₹५)', englishName: 'Parle-G Biscuit Small', category: 'Biscuits & Snacks', searchKeywords: 'parle g, biscuit, biskit, पारले-जी, बिस्कीट, पुढारी', sellPrice: 5, purchasePrice: 4.35, mrp: 5, availableStock: 80, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'ब्रिटानिया गुड डे बिस्कीट', englishName: 'Britannia Good Day Butter', category: 'Biscuits & Snacks', searchKeywords: 'good day, biscuit, गुड डे बिस्कीट, ब्रिटानिया', sellPrice: 20, purchasePrice: 17.5, mrp: 20, availableStock: 40, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'ब्रिटानिया मारी गोल्ड', englishName: 'Britannia Marie Gold Biscuit', category: 'Biscuits & Snacks', searchKeywords: 'marie gold, mari biscuit, मारी बिस्कीट, चहा बिस्कीट', sellPrice: 10, purchasePrice: 8.8, mrp: 10, availableStock: 45, unitType: 'PCS' },
  { marathiName: 'पारले क्रॅकजॅक / मोनॅको', englishName: 'Parle Krackjack / Monaco', category: 'Biscuits & Snacks', searchKeywords: 'krackjack, monaco, खारे बिस्कीट, क्रॅकजॅक, मोनॅको', sellPrice: 10, purchasePrice: 8.8, mrp: 10, availableStock: 35, unitType: 'PCS' },
  { marathiName: 'मॅगी नूडल्स ७० ग्रॅम', englishName: 'Maggi 2-Minute Noodles 70g', category: 'Biscuits & Snacks', searchKeywords: 'maggi, noodles, मॅगी, नूडल्स', sellPrice: 14, purchasePrice: 12.4, mrp: 14, availableStock: 50, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'बालाजी वेफर्स / कुरकुरे', englishName: 'Balaji Wafers / Kurkure Pack', category: 'Biscuits & Snacks', searchKeywords: 'balaji wafers, chips, kurkure, बालाजी वेफर्स, कुरकुरे, चिप्स', sellPrice: 10, purchasePrice: 8.5, mrp: 10, availableStock: 45, unitType: 'PCS' },
  { marathiName: 'हळदीराम भुजिया शेव २०० ग्रॅम', englishName: 'Haldiram Bhujia Sev 200g', category: 'Biscuits & Snacks', searchKeywords: 'bhujia, sev, farsan, शेव, फरसाण, भुजिया', sellPrice: 52, purchasePrice: 44, mrp: 55, availableStock: 20, unitType: 'PCS' },

  // --- 87 to 99: SOAPS, DETERGENTS & PERSONAL CARE (साबण, निर्मा आणि स्वच्छता) ---
  { marathiName: 'संतूर साबण १०० ग्रॅम', englishName: 'Santoor Sandal & Turmeric Soap', category: 'Soaps & Cleaning', searchKeywords: 'santoor soap, saban, संतूर साबण, अंघोळीचा साबण', sellPrice: 36, purchasePrice: 31.5, mrp: 38, availableStock: 40, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'लाईफबॉय साबण', englishName: 'Lifebuoy Total 10 Soap', category: 'Soaps & Cleaning', searchKeywords: 'lifebuoy soap, saban, लाईफबॉय साबण, लाल साबण', sellPrice: 36, purchasePrice: 31.5, mrp: 38, availableStock: 40, unitType: 'PCS' },
  { marathiName: 'लक्स साबण १०० ग्रॅम', englishName: 'Lux Rose & Vitamin E Soap', category: 'Soaps & Cleaning', searchKeywords: 'lux soap, saban, लक्स साबण, अंघोळीचा साबण', sellPrice: 38, purchasePrice: 33, mrp: 40, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'डेटॉल साबण', englishName: 'Dettol Original Soap 75g', category: 'Soaps & Cleaning', searchKeywords: 'dettol soap, saban, डेटॉल साबण, हिरवा साबण', sellPrice: 42, purchasePrice: 36.5, mrp: 45, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'रिन कपड्यांचा साबण', englishName: 'Rin Detergent Bar 250g', category: 'Soaps & Cleaning', searchKeywords: 'rin bar, kapdyacha saban, रिन साबण, कपड्यांचा साबण', sellPrice: 25, purchasePrice: 21.5, mrp: 25, availableStock: 45, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'व्हील वॉशिंग पावडर १ किलो', englishName: 'Active Wheel Detergent Powder 1kg', category: 'Soaps & Cleaning', searchKeywords: 'wheel powder, nirma, washing powder, व्हील पावडर, निर्मा पावडर', sellPrice: 72, purchasePrice: 63, mrp: 76, availableStock: 30, unitType: 'PACK', isQuickTap: true },
  { marathiName: 'सर्फ एक्सेल ईझी वॉश १ किलो', englishName: 'Surf Excel Easy Wash 1kg', category: 'Soaps & Cleaning', searchKeywords: 'surf excel, washing powder, सर्फ एक्सेल, निर्मा', sellPrice: 135, purchasePrice: 118, mrp: 142, availableStock: 20, unitType: 'PACK' },
  { marathiName: 'विम भांड्यांचा साबण (बार)', englishName: 'Vim Dishwash Bar 300g', category: 'Soaps & Cleaning', searchKeywords: 'vim bar, bhandyacha saban, विम बार, भांड्यांचा साबण', sellPrice: 25, purchasePrice: 21.5, mrp: 25, availableStock: 45, unitType: 'PCS', isQuickTap: true },
  { marathiName: 'कोलगेट टूथपेस्ट १०० ग्रॅम', englishName: 'Colgate Strong Teeth 100g', category: 'Soaps & Cleaning', searchKeywords: 'colgate, toothpaste, paste, कोलगेट, टूथपेस्ट, पेस्ट', sellPrice: 65, purchasePrice: 56, mrp: 68, availableStock: 25, unitType: 'PCS' },
  { marathiName: 'पॅराशूट खोबरेल तेल १०० मिली', englishName: 'Parachute Coconut Oil 100ml', category: 'Soaps & Cleaning', searchKeywords: 'parachute, coconut oil, khobrel tel, पॅराशूट, खोबरेल तेल, केसांचे तेल', sellPrice: 45, purchasePrice: 39, mrp: 48, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'क्लिनिक प्लस शॅम्पू पुडी', englishName: 'Clinic Plus Shampoo Sachet (Strip)', category: 'Soaps & Cleaning', searchKeywords: 'clinic plus, shampoo pudi, शॅम्पू पुडी, क्लिनिक प्लस', sellPrice: 2, purchasePrice: 1.5, mrp: 2, availableStock: 100, unitType: 'PCS' },
  { marathiName: 'हार्पिक टॉयलेट क्लीनर ५०० मिली', englishName: 'Harpic Toilet Cleaner 500ml', category: 'Soaps & Cleaning', searchKeywords: 'harpic, toilet cleaner, हार्पिक, बाथरूम क्लीनर', sellPrice: 98, purchasePrice: 84, mrp: 105, availableStock: 15, unitType: 'PCS' },
  { marathiName: 'फिनाईल बाटली १ लिटर', englishName: 'White Floor Phenyl 1L', category: 'Soaps & Cleaning', searchKeywords: 'phenyl, floor cleaner, फिनाईल, फरशी पुसण्याचे', sellPrice: 65, purchasePrice: 45, mrp: 80, availableStock: 15, unitType: 'PCS' },

  // --- 100 to 105: DAILY VEGETABLE ESSENTIALS, DAIRY & POOJA (कांदा, बटाटा, दूध आणि पूजा साहित्य) ---
  { marathiName: 'कांदा (गावरान)', englishName: 'Onion (Kanda)', category: 'Dairy & Bakery', searchKeywords: 'onion, kanda, pyaz, कांदा, गावरान कांदा', sellPrice: 40, purchasePrice: 30, mrp: 45, availableStock: 40, unitType: 'KG_LOOSE' },
  { marathiName: 'बटाटा (इंदोरी)', englishName: 'Potato (Batata)', category: 'Dairy & Bakery', searchKeywords: 'potato, batata, aloo, बटाटा, इंदोरी बटाटा', sellPrice: 36, purchasePrice: 26, mrp: 40, availableStock: 40, unitType: 'KG_LOOSE' },
  { marathiName: 'लसूण (गावरान)', englishName: 'Garlic (Lasun)', category: 'Spices & Masalas', searchKeywords: 'garlic, lasun, lehsun, लसूण, गावरान लसूण', sellPrice: 240, purchasePrice: 190, mrp: 260, availableStock: 10, unitType: 'KG_LOOSE' },
  { marathiName: 'गोकुळ / अमूल दूध ५०० मिली', englishName: 'Gokul / Amul Milk 500ml Pouch', category: 'Dairy & Bakery', searchKeywords: 'milk, dudh, gokul, amul, दूध पिशवी, गोकुळ दूध, अमूल दूध', sellPrice: 28, purchasePrice: 26.5, mrp: 28, availableStock: 35, unitType: 'PACK', isQuickTap: true },
  { marathiName: 'मंगलदीप अगरबत्ती पुडा', englishName: 'Mangaldeep Agarbatti Pack', category: 'General', searchKeywords: 'agarbatti, dhoop, kapoor, अगरबत्ती, पूजा साहित्य, उदबत्ती', sellPrice: 25, purchasePrice: 18, mrp: 30, availableStock: 30, unitType: 'PCS' },
  { marathiName: 'काडेपेटी (मॅचबॉक्स पॅक)', englishName: 'Homelite Matchbox (Kadepeti) Pack', category: 'General', searchKeywords: 'matchbox, kadepeti, machis, काडेपेटी, माचिस', sellPrice: 10, purchasePrice: 7.5, mrp: 12, availableStock: 40, unitType: 'PACK' },
];

/**
 * Automatically infers UnitType ('KG_LOOSE' | 'LTR' | 'PACK' | 'PCS') and sensible default prices
 * when importing a CSV row that may have blank price/unit cells.
 */
export function inferUnitAndDefaultPricing(row: {
  marathiName: string;
  englishName: string;
  category: string;
  searchKeywords: string;
  sellPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  availableStock?: number;
  unitType?: UnitType;
}): {
  unitType: UnitType;
  sellPrice: number;
  purchasePrice: number;
  mrp: number;
  availableStock: number;
  lowStockThreshold: number;
} {
  const combined = `${row.marathiName} ${row.englishName} ${row.category} ${row.searchKeywords}`.toLowerCase();

  // Check if a known item exists in our 105-item reference catalog
  const matchedCatalog = MAHARASHTRA_105_KIRANA_CATALOG.find(
    (c) =>
      c.englishName.toLowerCase() === row.englishName.toLowerCase() ||
      (row.marathiName && c.marathiName === row.marathiName) ||
      (row.englishName && c.englishName.toLowerCase().includes(row.englishName.toLowerCase()))
  );

  // Determine UnitType
  let unitType: UnitType = row.unitType || matchedCatalog?.unitType || 'PCS';
  if (!row.unitType && !matchedCatalog) {
    const hasPackWeight = /\b(\d+\s*(g|gm|ml|pack|pkt|sachet|pouch|bar))\b/i.test(combined);
    const isLooseCommodity =
      !hasPackWeight &&
      (combined.includes('dal') ||
        combined.includes('डाळ') ||
        combined.includes('rice') ||
        combined.includes('तांदूळ') ||
        combined.includes('wheat') ||
        combined.includes('गहू') ||
        combined.includes('sugar') ||
        combined.includes('साखर') ||
        combined.includes('shengdan') ||
        combined.includes('शेंगदाणे') ||
        combined.includes('groundnut') ||
        combined.includes('poha') ||
        combined.includes('पोहे') ||
        combined.includes('rava') ||
        combined.includes('रवा') ||
        combined.includes('sabudana') ||
        combined.includes('साबुदाणा') ||
        combined.includes('besan') ||
        combined.includes('बेसन') ||
        combined.includes('maida') ||
        combined.includes('मैदा') ||
        combined.includes('jowar') ||
        combined.includes('ज्वारी') ||
        combined.includes('bajra') ||
        combined.includes('बाजरी') ||
        combined.includes('matki') ||
        combined.includes('मटकी') ||
        combined.includes('chana') ||
        combined.includes('हरभरा') ||
        combined.includes('vatana') ||
        combined.includes('वाटाणा') ||
        combined.includes('moong') ||
        combined.includes('मूग') ||
        combined.includes('onion') ||
        combined.includes('कांदा') ||
        combined.includes('potato') ||
        combined.includes('बटाटा') ||
        combined.includes('garlic') ||
        combined.includes('लसूण') ||
        combined.includes('gul') ||
        combined.includes('गूळ') ||
        combined.includes('jaggery') ||
        combined.includes('kaju') ||
        combined.includes('badam') ||
        combined.includes('khobre'));

    if (isLooseCommodity) {
      unitType = 'KG_LOOSE';
    } else if (combined.includes('1l') || combined.includes('pouch') || combined.includes('5kg')) {
      unitType = 'PACK';
    }
  }

  const sellPrice =
    row.sellPrice !== undefined && Number.isFinite(row.sellPrice) && row.sellPrice >= 0
      ? Number(row.sellPrice)
      : matchedCatalog?.sellPrice || (unitType === 'KG_LOOSE' ? 110 : 35);

  const purchasePrice =
    row.purchasePrice !== undefined && Number.isFinite(row.purchasePrice) && row.purchasePrice >= 0
      ? Number(row.purchasePrice)
      : matchedCatalog?.purchasePrice || Math.round(sellPrice * 0.86 * 100) / 100;

  const mrp =
    row.mrp !== undefined && Number.isFinite(row.mrp) && row.mrp >= 0
      ? Number(row.mrp)
      : matchedCatalog?.mrp || (unitType === 'KG_LOOSE' ? Math.round(sellPrice * 1.08) : sellPrice);

  const isLoose = unitType === 'KG_LOOSE' || unitType === 'LTR';
  const availableStock =
    row.availableStock !== undefined && row.availableStock >= 0
      ? Number(row.availableStock)
      : matchedCatalog?.availableStock ?? (isLoose ? 20 : 30);

  const lowStockThreshold = isLoose ? 2 : 5;

  return {
    unitType,
    sellPrice,
    purchasePrice,
    mrp,
    availableStock,
    lowStockThreshold,
  };
}

/**
 * RFC-4180 compliant CSV line parser (supports commas inside quoted strings)
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses CSV text (e.g. Untitled_spreadsheet.csv) into structured RawSheetProductRow objects.
 */
export function parseKiranaCatalogCsv(csvText: string): RawSheetProductRow[] {
  const cleanLines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (cleanLines.length < 2) return [];

  const headers = parseCsvLine(cleanLines[0]).map((h) => h.toLowerCase());

  const findColIdx = (patterns: string[], fallbackIdx: number, excludeIndices: number[] = []): number => {
    const idx = headers.findIndex((h, index) => !excludeIndices.includes(index) && patterns.some((p) => h.includes(p)));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const marathiIdx = findColIdx(['marathi', 'मराठी'], 0);
  const englishIdx = findColIdx(['product name (english)', 'english', 'item name', 'name'], 1, [marathiIdx]);
  const categoryIdx = findColIdx(['category', 'विभाग'], 2, [marathiIdx, englishIdx]);
  const keywordsIdx = findColIdx(['keyword', 'search', 'pos'], 3, [marathiIdx, englishIdx]);
  const sellIdx = findColIdx(['sell', 'selling', 'rate', 'विक्री'], 4, [marathiIdx, englishIdx]);
  const purchaseIdx = findColIdx(['purchase', 'cost', 'wholesale', 'खरेदी'], 5, [marathiIdx, englishIdx]);
  const mrpIdx = findColIdx(['mrp'], 6, [marathiIdx, englishIdx]);
  const stockIdx = findColIdx(['stock', 'available', 'qty', 'शिल्लक'], 7, [marathiIdx, englishIdx]);

  const parsedRows: RawSheetProductRow[] = [];

  for (let i = 1; i < cleanLines.length; i++) {
    const cols = parseCsvLine(cleanLines[i]);
    if (cols.length === 0) continue;

    const marathiName = (cols[marathiIdx] || '').trim();
    const englishName = (cols[englishIdx] || '').trim();
    if (!marathiName && !englishName) continue;

    const category = (cols[categoryIdx] || 'General').trim() || 'General';
    const searchKeywords = (cols[keywordsIdx] || '').trim();

    const parseNum = (val?: string): number | undefined => {
      if (!val) return undefined;
      const cleaned = val.replace(/[₹,\s]/g, '');
      const num = parseFloat(cleaned);
      return Number.isFinite(num) && num >= 0 ? num : undefined;
    };

    parsedRows.push({
      marathiName,
      englishName,
      category,
      searchKeywords,
      sellPrice: parseNum(cols[sellIdx]),
      purchasePrice: parseNum(cols[purchaseIdx]),
      mrp: parseNum(cols[mrpIdx]),
      availableStock: parseNum(cols[stockIdx]),
    });
  }

  return parsedRows;
}

/**
 * Generates a clean short_code (e.g. "TD1", "PG5", "SK1") guaranteed unique within the catalog
 */
function generateShortCode(englishName: string, index: number, usedCodes: Set<string>): string {
  const words = englishName
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let prefix = '';
  if (words.length >= 2) {
    prefix = (words[0][0] + words[1][0] + (words[2]?.[0] || '')).toUpperCase();
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 3).toUpperCase();
  } else {
    prefix = 'KRN';
  }

  let candidate = `${prefix}${index + 1}`;
  let counter = 1;
  while (usedCodes.has(candidate)) {
    counter++;
    candidate = `${prefix}${index + 1}_${counter}`;
  }
  usedCodes.add(candidate);
  return candidate;
}

/**
 * Bulk imports an array of RawSheetProductRow items into Dexie (db.products) + Supabase
 * with uniform 160x160px square images, unique GS1 EAN-13 barcodes, and hidden POS search keywords.
 */
export async function bulkImportKiranaProducts(
  rows: RawSheetProductRow[]
): Promise<{ importedCount: number; updatedCount: number; totalProducts: number }> {
  const shopProfile = await db.getShopProfile().catch(() => null);
  const shopId =
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('kirana_active_shop_id') ||
        localStorage.getItem('kirana_base_shop_id') ||
        localStorage.getItem('smart_kirana_shop_id')
      : null) ||
    shopProfile?.shop_id ||
    shopProfile?.id ||
    'current_shop';

  const existingProducts = await db.products.toArray();
  const existingBarcodes = new Set<string>(
    existingProducts.map((p) => p.barcode).filter(Boolean)
  );
  const usedShortCodes = new Set<string>(
    existingProducts.map((p) => p.short_code.toUpperCase()).filter(Boolean)
  );

  let currentQuickTapCount = existingProducts.filter((p) => p.is_quick_tap).length;

  let importedCount = 0;
  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  const productsToSave: Product[] = [];
  const matchedExistingIds = new Set<string>();
  const obsoleteDuplicateIds = new Set<string>();

  // Purge any legacy timestamped duplicate IDs (prod-105-*, prod-csv-*)
  for (const ep of existingProducts) {
    if (isLegacyDuplicateProductId(ep.id)) {
      obsoleteDuplicateIds.add(ep.id);
    }
  }

  rows.forEach((row, index) => {
    const marathi = row.marathiName.trim();
    const english = row.englishName.trim();
    const bilingualDisplayName =
      marathi && english && !english.includes(marathi)
        ? `${marathi} (${english})`
        : marathi || english;

    const inferred = inferUnitAndDefaultPricing(row);

    const deterministicId = (row as any).id || `prod-170-${String(index + 1).padStart(3, '0')}`;

    // Check if this product already exists by stable ID or name without colliding across batch
    const matchingExistingAll = existingProducts.filter(
      (p) =>
        p.id === deterministicId ||
        p.name.toLowerCase() === bilingualDisplayName.toLowerCase() ||
        (english && p.name.toLowerCase() === english.toLowerCase()) ||
        (marathi && p.marathi_name === marathi)
    );
    const existingMatch = matchingExistingAll.find((p) => !matchedExistingIds.has(p.id));
    if (existingMatch) {
      matchedExistingIds.add(existingMatch.id);
    }
    for (const dup of matchingExistingAll) {
      if (dup.id !== deterministicId) {
        obsoleteDuplicateIds.add(dup.id);
      }
    }

    const barcode =
      existingMatch?.barcode && existingMatch.barcode.length === 13
        ? existingMatch.barcode
        : generateUniqueStoreBarcode(existingBarcodes);
    existingBarcodes.add(barcode);

    const shortCode =
      existingMatch?.short_code || generateShortCode(english || marathi, index, usedShortCodes);

    const imageUrl =
      existingMatch?.image_url ||
      generateSmartProductThumbnail({
        name: english || bilingualDisplayName,
        marathiName: marathi,
        category: row.category,
        unitType: inferred.unitType,
      });

    // Pin top high-velocity items to Top-24 Fast-Tap grid if slots remain
    let isQuickTap = existingMatch?.is_quick_tap ?? Boolean(row.isQuickTap);
    if (!existingMatch && isQuickTap && currentQuickTapCount >= 24) {
      isQuickTap = false;
    }
    if (!existingMatch && !isQuickTap && currentQuickTapCount < 24 && index < 24) {
      isQuickTap = true;
    }
    if (!existingMatch && isQuickTap) {
      currentQuickTapCount++;
    }

    const combinedKeywords = [
      row.searchKeywords,
      marathi,
      english,
      row.category,
    ]
      .filter(Boolean)
      .join(', ');

    const canonicalId = deterministicId;
    obsoleteDuplicateIds.delete(canonicalId);

    const productRecord: Product = {
      id: canonicalId,
      shop_id: shopId,
      business_type: 'KIRANA_RETAIL',
      name: bilingualDisplayName,
      marathi_name: marathi,
      search_keywords: combinedKeywords,
      short_code: shortCode,
      barcode,
      category: row.category || 'General',
      unit_type: inferred.unitType,
      purchase_price: inferred.purchasePrice,
      selling_price: inferred.sellPrice,
      mrp: inferred.mrp,
      current_stock: inferred.availableStock,
      low_stock_threshold: inferred.lowStockThreshold,
      last_supplier_name: existingMatch?.last_supplier_name || 'APMC Mandi Wholesaler',
      supplier_phone: existingMatch?.supplier_phone || '',
      wholesaler_id: existingMatch?.wholesaler_id || null,
      image_url: imageUrl,
      expiry_date: existingMatch?.expiry_date || null,
      is_quick_tap: isQuickTap,
      updated_at: nowIso,
    };

    productsToSave.push(productRecord);
    if (existingMatch) {
      updatedCount++;
    } else {
      importedCount++;
    }
  });

  unmarkProductsDeletedTombstone(productsToSave.map((p) => p.id));

  await db.transaction('rw', [db.products, db.inventory_logs, db.sync_outbox], async () => {
    if (obsoleteDuplicateIds.size > 0) {
      await db.products.bulkDelete(Array.from(obsoleteDuplicateIds));
    }
    await db.products.bulkPut(productsToSave);
    const outboxEntries = productsToSave.map((p, idx) => ({
      id: `sync-prod-${p.id}-${Date.now()}-${idx}`,
      shop_id: shopId,
      table_name: 'products' as const,
      operation: 'INSERT' as const,
      payload: p as unknown as Record<string, unknown>,
      status: 'PENDING' as const,
      retry_count: 0,
      created_at: nowIso,
    }));
    await db.sync_outbox.bulkPut(outboxEntries);
  });

  if (obsoleteDuplicateIds.size > 0) {
    cloudSyncService.deleteProductsBulk(Array.from(obsoleteDuplicateIds));
  }

  // Trigger non-blocking cloud sync to Supabase
  cloudSyncService.syncAllToCloud().catch(() => {});

  const totalProducts = await db.products.count();
  return { importedCount, updatedCount, totalProducts };
}

/**
 * Exports the 170-product Maharashtra Kirana master catalog as a ready-to-edit CSV string
 */
export function export170KiranaCatalogCsvString(): string {
  const header =
    'Product Name (Marathi),Product Name (English),Category,Search Keywords (POS),Sell Price,Purchase Price,MRP,Available Stock';
  const lines = MAHARASHTRA_170_KIRANA_CATALOG.map((r) => {
    const escapeCsv = (val: string | number | undefined) => {
      const s = String(val ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      escapeCsv(r.marathiName),
      escapeCsv(r.englishName),
      escapeCsv(r.category),
      escapeCsv(r.searchKeywords),
      escapeCsv(r.sellPrice),
      escapeCsv(r.purchasePrice),
      escapeCsv(r.mrp),
      escapeCsv(r.availableStock),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

/**
 * Exports the 105-product Maharashtra Kirana catalog as a ready-to-edit CSV string
 */
export function export105KiranaCatalogCsvString(): string {
  const header =
    'Product Name (Marathi),Product Name (English),Category,Search Keywords (POS),Sell Price,Purchase Price,MRP,Available Stock';
  const lines = MAHARASHTRA_105_KIRANA_CATALOG.map((r) => {
    const escapeCsv = (val: string | number | undefined) => {
      const s = String(val ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      escapeCsv(r.marathiName),
      escapeCsv(r.englishName),
      escapeCsv(r.category),
      escapeCsv(r.searchKeywords),
      escapeCsv(r.sellPrice),
      escapeCsv(r.purchasePrice),
      escapeCsv(r.mrp),
      escapeCsv(r.availableStock),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

