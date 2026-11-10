import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { db, generateInviteCode } from '../db/db';
import { UserRole, StoreUser, RegisteredShop, BusinessType } from '../types';
import { cloudSyncService } from './cloudSyncService';
import { notificationService } from './notificationService';
import { HomemadeFoodService } from './homemadeFoodService';
import { getHomemadeShopIdForOwner, getBaseKiranaShopId, getHomemadeShopId } from '../utils/businessFirewall';

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 to 100
  label: 'Too Weak' | 'Weak' | 'Medium' | 'Strong';
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumberOrSpecial: boolean;
  errors: string[];
}

/**
 * Standard enterprise password strength validator
 * Requirements: >= 8 characters, >= 1 uppercase, >= 1 lowercase, >= 1 digit/symbol
 */
export const validatePasswordStrength = (password: string): PasswordValidationResult => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Minimum 8 characters');
  if (!hasUppercase) errors.push('At least 1 uppercase letter (A-Z)');
  if (!hasLowercase) errors.push('At least 1 lowercase letter (a-z)');
  if (!hasNumberOrSpecial) errors.push('At least 1 number or special character');

  let passedRules = 0;
  if (hasMinLength) passedRules++;
  if (hasUppercase) passedRules++;
  if (hasLowercase) passedRules++;
  if (hasNumberOrSpecial) passedRules++;

  let score = 0;
  let label: PasswordValidationResult['label'] = 'Too Weak';

  if (passedRules === 1) {
    score = 25;
    label = 'Too Weak';
  } else if (passedRules === 2) {
    score = 50;
    label = 'Weak';
  } else if (passedRules === 3) {
    score = 75;
    label = 'Medium';
  } else if (passedRules === 4) {
    score = 100;
    label = 'Strong';
  }

  return {
    isValid: passedRules === 4,
    score,
    label,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumberOrSpecial,
    errors,
  };
};

export interface SignUpShopData {
  shopName: string;
  ownerName: string;
  phone: string;
  role?: UserRole;
  shopId?: string;
  inviteCode?: string;
  isJoiningExisting?: boolean;
  businessType?: BusinessType;
}

export const authService = {
  /**
   * Validates a 6-digit store invite code (e.g. KRN-4829)
   * Prevents leaking list of stores to unauthenticated users
   */
  async validateStoreInviteCode(rawCode: string): Promise<{
    valid: boolean;
    shop?: { id: string; shop_name: string; owner_name: string; phone?: string; invite_code: string };
    message?: string;
  }> {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) {
      return { valid: false, message: 'Store invite code is required.' };
    }

    // 1. Check local Dexie DB
    try {
      const localShop = await db.getShopByInviteCode(code);
      if (localShop) {
        return {
          valid: true,
          shop: {
            id: localShop.id,
            shop_name: localShop.shop_name,
            owner_name: localShop.owner_name,
            phone: localShop.phone,
            invite_code: localShop.invite_code || code,
          },
        };
      }
    } catch (e) {
      console.warn('Local invite code lookup failed:', e);
    }

    // 2. Check Supabase shop_profile (skip network call in test environment)
    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
    if (supabase && !isTestEnv) {
      try {
        const { data, error } = await supabase
          .from('shop_profile')
          .select('id, shop_name, owner_name, phone, invite_code')
          .ilike('invite_code', code)
          .maybeSingle();

        if (data && !error) {
          return {
            valid: true,
            shop: {
              id: data.id,
              shop_name: data.shop_name,
              owner_name: data.owner_name,
              phone: data.phone,
              invite_code: data.invite_code,
            },
          };
        }
      } catch (err) {
        console.warn('Supabase invite code check failed:', err);
      }
    }

    // Default seed fallback
    if (code === 'KRN-4829') {
      return {
        valid: true,
        shop: {
          id: 'current_shop',
          shop_name: 'Laxmi Vatsalya General Store',
          owner_name: 'Pandurang Paradkar',
          phone: '9404380326',
          invite_code: 'KRN-4829',
        },
      };
    }

    return {
      valid: false,
      message: `Store invite code "${code}" not found. Please ask your Store Owner for the exact invite code.`,
    };
  },

  /**
   * Fetches available registered shops from cloud and local cache for staff dropdown selection
   */
  async getAvailableShops(): Promise<RegisteredShop[]> {
    const shops: RegisteredShop[] = [];
    const seen = new Set<string>();

    // 1. From local DB profile
    try {
      const local = await db.getShopProfile();
      if (local && local.shop_name && local.shop_name !== 'Shree Ganesh Kirana & General Store') {
        shops.push({
          id: local.id || 'current_shop',
          shop_name: local.shop_name,
          owner_name: local.owner_name,
          phone: local.phone,
          address: local.address,
        });
        seen.add(local.shop_name.toLowerCase().trim());
      }
    } catch (e) {
      console.warn('Error reading local shop profile:', e);
    }

    // Default fallback if database has no registered shops yet
    if (shops.length === 0) {
      shops.push({
        id: 'default_shop',
        shop_name: 'Laxi Vatsalaya store',
        owner_name: 'Mayuresh paradkar',
        phone: '9405048317',
      });
    }

    return shops;
  },

  /**
   * Registers a new store user (Owner, Manager, Accountant, Cashier) with standard password verification & Supabase Auth
   */
  async signUp(email: string, password: string, shopData: SignUpShopData) {
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password does not meet standard security rules: ${validation.errors.join(', ')}`);
    }

    const assignedRole: UserRole = shopData.role || 'OWNER';
    // Non-owners joining an existing shop require store owner approval before gaining full access
    const isJoining = Boolean(shopData.isJoiningExisting || assignedRole !== 'OWNER');
    const isActive = !isJoining; // Owners are active immediately; staff require owner approval
    const approvalStatus = isActive ? 'APPROVED' : 'PENDING';

    let targetShopId = shopData.shopId || 'current_shop';
    let targetShopName = shopData.shopName || 'Laxmi Vatsalya General Store';

    // Multi-tenant isolation: non-owners must supply a valid store invite code
    if (isJoining) {
      if (shopData.inviteCode) {
        const inviteCheck = await this.validateStoreInviteCode(shopData.inviteCode);
        if (!inviteCheck.valid || !inviteCheck.shop) {
          throw new Error(inviteCheck.message || 'Invalid Store Invite Code.');
        }
        targetShopId = inviteCheck.shop.id;
        targetShopName = inviteCheck.shop.shop_name;
      } else if (!shopData.shopId) {
        throw new Error(
          `Store Invite Code is required to register as ${assignedRole}. Ask your store owner for their 6-digit invite code.`
        );
      }
    }

    // If Owner registering a new shop, update local shop profile with new invite code and business_type
    const ownerInviteCode = generateInviteCode();
    const selectedBusinessType: BusinessType = shopData.businessType || 'KIRANA_RETAIL';
    const defaultPrefix = selectedBusinessType === 'HOMEMADE_FOOD' ? 'HMF' : 'KRN';
    if (!isJoining) {
      try {
        if (selectedBusinessType === 'HOMEMADE_FOOD') {
          await HomemadeFoodService.switchBusinessWorkspace('HOMEMADE_FOOD', { autoSeedHomemadeMenu: true });
        }
        await db.updateShopProfile({
          shop_name: shopData.shopName || (selectedBusinessType === 'HOMEMADE_FOOD' ? 'Gruh Udyog & Homemade Foods' : 'My Kirana Store'),
          owner_name: shopData.ownerName || 'Store Owner',
          phone: shopData.phone || '',
          upi_vpa: `${shopData.phone || 'kirana'}@upi`,
          invite_code: ownerInviteCode,
          business_type: selectedBusinessType,
          invoice_prefix: defaultPrefix,
        });
      } catch (e) {
        console.warn('Failed to save local shop profile on signup:', e);
      }
    }

    // Save local store user record
    const localStoreUser: StoreUser = {
      id: `usr-${Date.now()}`,
      email,
      full_name: shopData.ownerName || 'Store User',
      phone: shopData.phone || undefined,
      role: assignedRole,
      shop_id: targetShopId,
      is_active: isActive,
      approval_status: approvalStatus,
      created_at: new Date().toISOString(),
    };

    try {
      await db.saveStoreUser(localStoreUser);
    } catch (e) {
      console.warn('Failed to save local store user:', e);
    }

    if (!supabase) {
      throw new Error('Supabase client is not configured. Check your credentials in Settings.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          shop_name: targetShopName,
          owner_name: shopData.ownerName,
          phone: shopData.phone,
          role: assignedRole,
          shop_id: targetShopId,
          is_active: isActive,
          approval_status: approvalStatus,
        },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });

    if (error) {
      throw error;
    }

    // If user account was created, save to Supabase shop_profile and store_users tables
    if (data.user) {
      localStoreUser.user_id = data.user.id;
      await db.saveStoreUser(localStoreUser);

      if (!isJoining) {
        try {
          await supabase.from('shop_profile').upsert({
            id: 'current_shop',
            shop_id: 'current_shop',
            user_id: data.user.id,
            shop_name: shopData.shopName || 'Laxmi Vatsalya General Store',
            owner_name: shopData.ownerName || 'Pandurang Paradkar',
            phone: shopData.phone || '9404380326',
            upi_vpa: `${shopData.phone || '9404380326'}@upi`,
            invite_code: ownerInviteCode,
            updated_at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('Could not sync initial profile to Supabase:', err);
        }
      }

      try {
        await supabase.from('store_users').upsert({
          id: localStoreUser.id,
          user_id: data.user.id,
          email,
          full_name: shopData.ownerName || 'Store User',
          phone: shopData.phone || null,
          role: assignedRole,
          shop_id: targetShopId,
          is_active: isActive,
          created_at: localStoreUser.created_at,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Could not sync store user to Supabase:', err);
      }

      // If joining as staff, notify store owner
      if (isJoining) {
        notificationService.pushNotification({
          id: `staff-req-${localStoreUser.id}`,
          type: 'STAFF_REQUEST',
          title: `👤 Staff Join Request: ${shopData.ownerName || email}`,
          message: `Requested access as ${assignedRole} for ${targetShopName}. Tap to approve permissions.`,
          timestamp: new Date().toISOString(),
          isRead: false,
          priority: 'high',
          category: 'staff',
          actionLabel: 'Approve Staff Access',
          actionType: 'APPROVE_STAFF',
          actionData: {
            userId: localStoreUser.id,
            email,
            role: assignedRole,
            name: shopData.ownerName,
          },
        });
      }
    }

    return data;
  },

  /**
   * Signs in with email and password
   */
  async signIn(email: string, password: string) {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    // Restore shop profile & store user role from Supabase to IndexedDB
    if (data.user) {
      try {
        const { isOwner, role } = await this.syncCanonicalSession(data.user);

        if (!isOwner && role !== 'OWNER') {
          const storeUser = await db.getStoreUserByUserId(data.user.id);
          if (storeUser && storeUser.is_active === false && storeUser.approval_status === 'PENDING') {
            throw new Error(
              `ACCESS_PENDING_APPROVAL: Your request to join this store as ${role} is awaiting approval from the store owner.`
            );
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('ACCESS_PENDING_APPROVAL')) {
          throw err;
        }
        console.warn('Could not sync user/profile on sign in:', err);
      }
    }

    return data;
  },

  /**
   * Same-Login Canonical Account Resolution:
   * Resolves canonical shop_id and binds multi-device sessions to the same shop_id without data splitting
   */
  async syncCanonicalSession(user: User): Promise<{ canonicalShopId: string; role: UserRole; isOwner: boolean }> {
    const isTestEnv = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
    let canonicalShopId = 'current_shop';
    let role: UserRole = (user.user_metadata?.role as UserRole) || 'OWNER';
    let isOwner = role === 'OWNER';

    if (supabase && !isTestEnv) {
      try {
        // 1. Fetch existing shop_profile created by this account
        const { data: profile } = await supabase
          .from('shop_profile')
          .select('*')
          .or(`user_id.eq.${user.id},id.eq.${user.user_metadata?.shop_id || ''}`)
          .maybeSingle();

        // 2. Fetch existing store_user entry
        const { data: storeUserData } = await supabase
          .from('store_users')
          .select('*')
          .or(`user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();

        if (profile) {
          canonicalShopId = profile.id;
          isOwner = profile.user_id === user.id || role === 'OWNER' || storeUserData?.role === 'OWNER';
        } else if (storeUserData?.shop_id) {
          canonicalShopId = storeUserData.shop_id;
        } else if (user.user_metadata?.shop_id) {
          canonicalShopId = user.user_metadata.shop_id as string;
        }

        if (storeUserData?.role) {
          role = storeUserData.role;
        }
        if (isOwner) {
          role = 'OWNER';
        }

        // Owner role is automatically active & approved across every device signed into the Owner's email
        const isActive = isOwner ? true : (storeUserData?.is_active ?? true);
        const approvalStatus = (isOwner || isActive) ? 'APPROVED' : 'PENDING';

        const kiranaShopId = getBaseKiranaShopId(canonicalShopId);
        const homemadeShopId = getHomemadeShopId(kiranaShopId);
        const activeBiz = (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_business_type') : null) || 'KIRANA_RETAIL';
        const activeShopId = activeBiz === 'HOMEMADE_FOOD' ? homemadeShopId : kiranaShopId;

        // Check if device previously had a different shop_id (e.g. from guest mode or demo)
        if (typeof localStorage !== 'undefined') {
          const previousShopId = localStorage.getItem('kirana_active_shop_id');
          if (previousShopId && previousShopId !== kiranaShopId && previousShopId !== homemadeShopId && previousShopId !== 'current_shop') {
            console.log(`Canonical shop sync: store switch detected (${previousShopId} -> ${kiranaShopId}). Clearing local Dexie data.`);
            await db.clearAllRecordsToEmpty();
            await db.sync_outbox.clear();
          }
          localStorage.setItem('kirana_base_shop_id', kiranaShopId);
          localStorage.setItem('kirana_primary_shop_id', kiranaShopId);
          localStorage.setItem('kirana_homemade_shop_id', homemadeShopId);
          localStorage.setItem('kirana_active_shop_id', activeShopId);
        }

        const storeUserRecord: StoreUser = {
          id: storeUserData?.id || `usr-${user.id.slice(0, 8)}`,
          user_id: user.id,
          email: user.email || '',
          full_name:
            storeUserData?.full_name ||
            user.user_metadata?.owner_name ||
            (isOwner ? 'Store Owner' : 'Store User'),
          phone: storeUserData?.phone || user.user_metadata?.phone,
          role,
          shop_id: canonicalShopId,
          is_active: isActive,
          approval_status: approvalStatus,
          created_at: storeUserData?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await db.saveStoreUser(storeUserRecord);

        // Ensure both Kirana and Homemade Food shop_profile records exist in Dexie
        await db.updateShopProfile({
          id: kiranaShopId,
          shop_id: kiranaShopId,
          shop_name: profile?.shop_name || user.user_metadata?.shop_name || 'My Kirana Store',
          owner_name: profile?.owner_name || user.user_metadata?.owner_name || 'Store Owner',
          phone: profile?.phone || user.user_metadata?.phone || '',
          upi_vpa: profile?.upi_vpa || `${user.user_metadata?.phone || 'kirana'}@upi`,
          address: profile?.address || '',
          gst_footer_note: profile?.gst_footer_note || '',
          invite_code: profile?.invite_code,
          business_type: 'KIRANA_RETAIL',
          invoice_prefix: 'KRN',
          reset_epoch: profile?.reset_epoch || 1,
          last_wiped_at: profile?.last_wiped_at,
        });

        const existingHmf = await db.shop_profile.get(homemadeShopId);
        if (!existingHmf) {
          await db.shop_profile.put({
            id: homemadeShopId,
            shop_id: homemadeShopId,
            shop_name: 'Laxmi Vatsalya Gruh Udyog (Homemade Foods)',
            owner_name: profile?.owner_name || user.user_metadata?.owner_name || 'Store Owner',
            phone: profile?.phone || user.user_metadata?.phone || '',
            upi_vpa: profile?.upi_vpa || `${user.user_metadata?.phone || 'kirana'}@upi`,
            address: profile?.address || '',
            gst_footer_note: '100% Pure & Hygienic Homemade Konkani Delicacies! Order in advance for festivals.',
            invite_code: `HMF-${Math.floor(1000 + Math.random() * 9000)}`,
            business_type: 'HOMEMADE_FOOD',
            invoice_prefix: 'HMF',
            reset_epoch: 1,
            updated_at: new Date().toISOString(),
          });
        }

        // Bind real-time WebSocket broadcasting to canonicalShopId
        cloudSyncService.subscribeToRealtimeStoreSync(canonicalShopId);

        // Instant bidirectional synchronization on login
        cloudSyncService.syncBidirectionalNow().catch((err) => {
          console.warn('Initial syncBidirectionalNow on login skipped/failed:', err);
        });
      } catch (err) {
        console.warn('syncCanonicalSession failed to reach cloud:', err);
      }
    } else {
      if (user.user_metadata?.shop_id) {
        canonicalShopId = user.user_metadata.shop_id as string;
      } else if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('kirana_active_shop_id');
        if (stored) canonicalShopId = stored;
      }

      const kiranaShopId = getBaseKiranaShopId(canonicalShopId);
      const homemadeShopId = getHomemadeShopId(kiranaShopId);
      const activeBiz = (typeof localStorage !== 'undefined' ? localStorage.getItem('kirana_active_business_type') : null) || 'KIRANA_RETAIL';
      const activeShopId = activeBiz === 'HOMEMADE_FOOD' ? homemadeShopId : kiranaShopId;

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kirana_base_shop_id', kiranaShopId);
        localStorage.setItem('kirana_primary_shop_id', kiranaShopId);
        localStorage.setItem('kirana_homemade_shop_id', homemadeShopId);
        localStorage.setItem('kirana_active_shop_id', activeShopId);
      }

      const storeUserRecord: StoreUser = {
        id: `usr-${user.id.slice(0, 8)}`,
        user_id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.owner_name || (isOwner ? 'Store Owner' : 'Store User'),
        phone: user.user_metadata?.phone,
        role,
        shop_id: canonicalShopId,
        is_active: true,
        approval_status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.saveStoreUser(storeUserRecord);
    }

    return { canonicalShopId, role, isOwner };
  },

  /**
   * Fetches all staff members from local Dexie and Supabase cloud
   */
  async getAllStaff(): Promise<StoreUser[]> {
    let list = await db.getStoreUsers();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('store_users').select('*');
        if (data && !error && data.length > 0) {
          for (const u of data) {
            await db.saveStoreUser({
              id: u.id,
              user_id: u.user_id,
              email: u.email,
              full_name: u.full_name,
              phone: u.phone,
              role: u.role,
              shop_id: u.shop_id || 'current_shop',
              is_active: u.is_active ?? true,
              approval_status: u.is_active ? 'APPROVED' : 'PENDING',
              created_at: u.created_at || new Date().toISOString(),
              updated_at: u.updated_at,
            });
          }
          list = await db.getStoreUsers();
        }
      } catch (err) {
        console.warn('Offline fallback reading staff list:', err);
      }
    }
    return list;
  },

  /**
   * Owner approves or activates / suspends a staff member
   */
  async setStaffStatus(id: string, isActive: boolean): Promise<void> {
    const user = await db.store_users.get(id);
    if (!user) throw new Error('Staff record not found.');
    user.is_active = isActive;
    user.approval_status = isActive ? 'APPROVED' : 'PENDING';
    user.updated_at = new Date().toISOString();
    await db.saveStoreUser(user);

    if (supabase) {
      try {
        await supabase.from('store_users').upsert({
          id: user.id,
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          shop_id: user.shop_id,
          is_active: isActive,
          updated_at: user.updated_at,
        });
      } catch (err) {
        console.warn('Could not sync staff status update to cloud:', err);
      }
    }
  },

  /**
   * Owner updates staff member role (Manager, Accountant, Cashier)
   */
  async updateStaffRole(id: string, newRole: UserRole): Promise<void> {
    const user = await db.store_users.get(id);
    if (!user) throw new Error('Staff record not found.');
    user.role = newRole;
    user.updated_at = new Date().toISOString();
    await db.saveStoreUser(user);

    if (supabase) {
      try {
        await supabase.from('store_users').update({
          role: newRole,
          updated_at: user.updated_at,
        }).eq('id', id);
      } catch (err) {
        console.warn('Could not sync role change to cloud:', err);
      }
    }
  },

  /**
   * Removes a staff member from store
   */
  async deleteStaffMember(id: string): Promise<void> {
    await db.store_users.delete(id);
    if (supabase) {
      try {
        await supabase.from('store_users').delete().eq('id', id);
      } catch (err) {
        console.warn('Could not sync staff delete to cloud:', err);
      }
    }
  },

  /**
   * Resends confirmation email for unconfirmed accounts
   */
  async resendConfirmationEmail(email: string) {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });

    if (error) {
      throw error;
    }

    return true;
  },

  /**
   * Retrieves the role of the current user
   */
  async getUserRole(userId?: string, email?: string): Promise<UserRole> {
    if (userId) {
      const local = await db.getStoreUserByUserId(userId);
      if (local?.role) return local.role;
    }
    if (email) {
      const local = await db.getStoreUserByEmail(email);
      if (local?.role) return local.role;
    }
    return 'OWNER';
  },

  /**
   * Sends password reset link to user's registered email
   */
  async resetPasswordForEmail(email: string) {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Signs out user
   */
  async signOut() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('kirana_active_shop_id');
      localStorage.removeItem('kirana_guest_mode');
    }
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  /**
   * Complete local device wipe & logout:
   * Clears Supabase auth session, resets IndexedDB partitions to empty,
   * wipes localStorage & sessionStorage, and resets the app to the pristine Auth / Registration screen.
   */
  async clearAllLocalDataAndReset(): Promise<void> {
    try {
      if (supabase) {
        await supabase.auth.signOut().catch(() => {});
      }
    } catch {}

    try {
      const { kiranaDb, homemadeDb } = await import('../db/db');
      await kiranaDb.clearAllRecordsToEmpty().catch(() => {});
      await homemadeDb.clearAllRecordsToEmpty().catch(() => {});
    } catch {}

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },

  /**
   * Gets current session
   */
  async getSession(): Promise<Session | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /**
   * Subscribes to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: Session | null, user: User | null) => void) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session, session?.user ?? null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  },
};
