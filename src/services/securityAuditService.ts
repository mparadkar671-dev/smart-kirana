import { db, getActiveDb } from '../db/db';
import { ShopProfile, SecurityAuditLog } from '../types';
import { getActiveShopId, getActiveBusinessType } from '../utils/businessFirewall';

export interface VerifyPinResult {
  valid: boolean;
  isLocked: boolean;
  remainingLockoutMinutes?: number;
  remainingAttempts?: number;
  message?: string;
}

export class SecurityAuditService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly DEFAULT_PIN = '1234';

  /**
   * Fast SHA-256 hash with salt support across browser and test environments
   */
  static async hashPin(pin: string, salt: string): Promise<string> {
    const combined = `${salt}:${pin}`;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(combined);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Fallback below
      }
    }
    // Simple fast fallback hash for test/node environments
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `hash-${Math.abs(hash).toString(16)}`;
  }

  /**
   * Generates a random salt string
   */
  static generateSalt(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  /**
   * Verifies an entered manager PIN against stored salted hash or initial '1234' default.
   * Enforces 5-attempt rate limiter and 15-minute temporary lockout.
   */
  static async verifyManagerPin(
    enteredPin: string,
    actionContext?: {
      eventType?: SecurityAuditLog['event_type'];
      cashierName?: string;
      actionSummary?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<VerifyPinResult> {
    const activeDb = getActiveDb();
    const profile = await activeDb.getShopProfile();
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // 1. Check if currently locked out
    if (profile?.pin_locked_until) {
      const lockedUntilMs = new Date(profile.pin_locked_until).getTime();
      if (now < lockedUntilMs) {
        const remainingMinutes = Math.ceil((lockedUntilMs - now) / (60 * 1000));
        return {
          valid: false,
          isLocked: true,
          remainingLockoutMinutes: remainingMinutes,
          message: `Manager PIN is temporarily locked due to repeated failed attempts. Try again in ${remainingMinutes} minute(s).`,
        };
      }
    }

    // 2. Determine validity
    let isValid = false;
    if (profile?.pin_hash && profile?.pin_salt) {
      const computedHash = await this.hashPin(enteredPin, profile.pin_salt);
      isValid = computedHash === profile.pin_hash;
    } else {
      // Default initial PIN fallback
      isValid = enteredPin === this.DEFAULT_PIN;
    }

    // 3. Handle Success
    if (isValid) {
      if ((profile?.pin_failed_attempts || 0) > 0 || profile?.pin_locked_until) {
        await activeDb.shop_profile.update(profile!.id, {
          pin_failed_attempts: 0,
          pin_locked_until: undefined,
          updated_at: nowIso,
        });
      }

      // Log successful security override if context was provided
      if (actionContext?.eventType) {
        await this.logSecurityEvent({
          eventType: actionContext.eventType,
          cashierName: actionContext.cashierName || 'Cashier',
          actionSummary: actionContext.actionSummary || 'Manager PIN Override Approved',
          metadata: actionContext.metadata,
        });
      }

      return {
        valid: true,
        isLocked: false,
      };
    }

    // 4. Handle Failure (Rate limiting)
    const currentFailures = (profile?.pin_failed_attempts || 0) + 1;
    const remainingAttempts = Math.max(0, this.MAX_FAILED_ATTEMPTS - currentFailures);
    const isNowLocked = currentFailures >= this.MAX_FAILED_ATTEMPTS;
    const lockedUntil = isNowLocked ? new Date(now + this.LOCKOUT_DURATION_MS).toISOString() : undefined;

    if (profile) {
      await activeDb.shop_profile.update(profile.id, {
        pin_failed_attempts: isNowLocked ? 0 : currentFailures,
        pin_locked_until: lockedUntil,
        updated_at: nowIso,
      });
    }

    // Record audit log for failed attempt or lockout
    await this.logSecurityEvent({
      eventType: isNowLocked ? 'LOCKOUT_TRIGGERED' : 'PIN_FAILED_ATTEMPT',
      cashierName: actionContext?.cashierName || 'Cashier',
      actionSummary: isNowLocked
        ? `Security Lockout Triggered: 5 consecutive invalid PIN attempts`
        : `Invalid Manager PIN entered (Attempt ${currentFailures}/${this.MAX_FAILED_ATTEMPTS})`,
      metadata: {
        attemptNumber: currentFailures,
        isNowLocked,
        lockedUntil,
      },
    });

    if (isNowLocked) {
      return {
        valid: false,
        isLocked: true,
        remainingLockoutMinutes: 15,
        message: 'Security Alert: 5 incorrect PIN attempts. Locked out for 15 minutes.',
      };
    }

    return {
      valid: false,
      isLocked: false,
      remainingAttempts,
      message: `Invalid Security PIN. ${remainingAttempts} attempt(s) remaining before lockout.`,
    };
  }

  /**
   * Sets or updates the Store Manager PIN
   */
  static async setManagerPin(newPin: string, cashierName = 'Store Owner'): Promise<void> {
    if (!newPin || newPin.length < 4) {
      throw new Error('PIN must be at least 4 digits');
    }

    const activeDb = getActiveDb();
    const profile = await activeDb.getShopProfile();
    const salt = this.generateSalt();
    const hash = await this.hashPin(newPin, salt);
    const nowIso = new Date().toISOString();

    if (profile) {
      await activeDb.shop_profile.update(profile.id, {
        pin_hash: hash,
        pin_salt: salt,
        pin_failed_attempts: 0,
        pin_locked_until: undefined,
        updated_at: nowIso,
      });
    }

    await this.logSecurityEvent({
      eventType: 'PIN_CHANGED',
      cashierName,
      actionSummary: `Manager Security PIN was successfully updated`,
      metadata: { updated_at: nowIso },
    });
  }

  /**
   * Appends an immutable audit event to security_audit_logs
   */
  static async logSecurityEvent(params: {
    eventType: SecurityAuditLog['event_type'];
    cashierName?: string;
    actionSummary: string;
    metadata?: Record<string, unknown>;
  }): Promise<SecurityAuditLog> {
    const activeDb = getActiveDb();
    const nowIso = new Date().toISOString();

    const audit: SecurityAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: getActiveShopId(),
      business_type: getActiveBusinessType(),
      event_type: params.eventType,
      cashier_name: params.cashierName || 'Cashier',
      action_summary: params.actionSummary,
      metadata: params.metadata,
      timestamp: nowIso,
    };

    await activeDb.security_audit_logs.add(audit);
    return audit;
  }

  /**
   * Retrieves the security audit trail
   */
  static async getAuditLogs(limit = 100): Promise<SecurityAuditLog[]> {
    const activeDb = getActiveDb();
    return await activeDb.security_audit_logs
      .reverse()
      .limit(limit)
      .sortBy('timestamp');
  }
}
