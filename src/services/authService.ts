import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { db } from '../db/db';
import { UserRole, StoreUser, RegisteredShop } from '../types';
import { cloudSyncService } from './cloudSyncService';
import { notificationService } from './notificationService';

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
  isJoiningExisting?: boolean;
}

export const authService = {
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

    // 2. From Supabase shop_profile
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('shop_profile')
          .select('id, shop_name, owner_name, phone, address')
          .limit(50);
        if (data && !error) {
          for (const row of data) {
            const key = (row.shop_name || '').toLowerCase().trim();
            if (key && !seen.has(key)) {
              shops.push({
                id: row.id,
                shop_name: row.shop_name,
                owner_name: row.owner_name,
                phone: row.phone,
                address: row.address,
              });
              seen.add(key);
            }
          }
        }
      } catch (err) {
        console.warn('Error fetching shops from Supabase:', err);
      }
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

    // If Owner registering a new shop, update local shop profile
    if (!isJoining) {
      try {
        await db.updateShopProfile({
          shop_name: shopData.shopName || 'My Kirana Store',
          owner_name: shopData.ownerName || 'Store Owner',
          phone: shopData.phone || '',
          upi_vpa: `${shopData.phone || 'kirana'}@upi`,
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
      shop_id: shopData.shopId || 'current_shop',
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
          shop_name: shopData.shopName,
          owner_name: shopData.ownerName,
          phone: shopData.phone,
          role: assignedRole,
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
            user_id: data.user.id,
            shop_name: shopData.shopName || 'My Kirana Store',
            owner_name: shopData.ownerName || 'Store Owner',
            phone: shopData.phone || '',
            upi_vpa: `${shopData.phone || 'kirana'}@upi`,
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
          shop_id: shopData.shopId || 'current_shop',
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
          message: `Requested access as ${assignedRole} for ${shopData.shopName}. Tap to approve permissions.`,
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
        const { data: profile } = await supabase
          .from('shop_profile')
          .select('*')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (profile) {
          await db.updateShopProfile({
            shop_name: profile.shop_name,
            owner_name: profile.owner_name,
            phone: profile.phone,
            upi_vpa: profile.upi_vpa || 'kirana@upi',
            address: profile.address || '',
            gst_footer_note: profile.gst_footer_note || '',
          });
        } else if (data.user.user_metadata) {
          const meta = data.user.user_metadata;
          if (meta.shop_name || meta.owner_name) {
            await db.updateShopProfile({
              shop_name: meta.shop_name || 'My Kirana Store',
              owner_name: meta.owner_name || 'Store Owner',
              phone: meta.phone || '',
              upi_vpa: `${meta.phone || 'kirana'}@upi`,
            });
          }
        }

        // Fetch or initialize store_user role
        const { data: storeUserData } = await supabase
          .from('store_users')
          .select('*')
          .or(`user_id.eq.${data.user.id},email.eq.${email}`)
          .maybeSingle();

        const role: UserRole =
          storeUserData?.role ||
          (data.user.user_metadata?.role as UserRole) ||
          'OWNER';

        const isActive = storeUserData?.is_active ?? true;

        const storeUserRecord: StoreUser = {
          id: storeUserData?.id || `usr-${data.user.id.slice(0, 8)}`,
          user_id: data.user.id,
          email,
          full_name:
            storeUserData?.full_name ||
            data.user.user_metadata?.owner_name ||
            'Store User',
          phone: storeUserData?.phone || data.user.user_metadata?.phone,
          role,
          shop_id: storeUserData?.shop_id || 'current_shop',
          is_active: isActive,
          approval_status: isActive ? 'APPROVED' : 'PENDING',
          created_at: storeUserData?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await db.saveStoreUser(storeUserRecord);

        if (!isActive && role !== 'OWNER') {
          throw new Error(
            `ACCESS_PENDING_APPROVAL: Your request to join this store as ${role} is awaiting approval from the store owner.`
          );
        }

        // Auto pull cloud database into Dexie in background
        cloudSyncService.pullAllFromCloud().catch((err) => {
          console.warn('Initial pull from cloud after sign in skipped/failed:', err);
        });
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
    if (!supabase) return;
    await supabase.auth.signOut();
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
