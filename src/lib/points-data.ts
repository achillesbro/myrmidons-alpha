// src/lib/points-data.ts
// Utilities for fetching and processing points data from vault-computation-cli output

export interface UserPointsEntry {
  chainId: string;
  vault: string;
  wallet: string;
  points: number;
}

export interface EcosystemPointsEntry {
  protocolKey: string;
  protocolName: string;
  points: number | null;
  tag?: string;
}

export interface ProtocolReward {
  name: string;
  value: string | null;
  icon?: string;
  tag?: string;
  protocolKey: string;
}

/**
 * Fetch user's total points from totals.json
 * @param walletAddress - User's wallet address
 * @param vaultAddress - Vault address
 * @returns User's total points or null if not found
 */
export async function fetchUserPoints(
  walletAddress: string,
  vaultAddress: string
): Promise<number | null> {
  try {
    const response = await fetch('/points/totals.json');
    if (!response.ok) {
      console.warn('[Points] totals.json not found or not accessible');
      return null;
    }

    const data: UserPointsEntry[] = await response.json();
    
    // Find matching entry (case-insensitive address comparison)
    const entry = data.find(
      (entry) =>
        entry.wallet.toLowerCase() === walletAddress.toLowerCase() &&
        entry.vault.toLowerCase() === vaultAddress.toLowerCase()
    );

    return entry ? entry.points : null;
  } catch (error) {
    console.error('[Points] Error fetching user points:', error);
    return null;
  }
}

/**
 * Fetch all user points from totals.json
 * @returns Array of all user points entries
 */
export async function fetchAllUserPoints(): Promise<UserPointsEntry[]> {
  try {
    const response = await fetch('/points/totals.json');
    if (!response.ok) {
      console.warn('[Points] totals.json not found or not accessible');
      return [];
    }

    const data: UserPointsEntry[] = await response.json();
    return data;
  } catch (error) {
    console.error('[Points] Error fetching all user points:', error);
    return [];
  }
}

/**
 * Calculate total vault points (sum of all user points for a vault)
 * @param vaultAddress - Vault address
 * @returns Total points for the vault
 */
export async function fetchVaultTotalPoints(
  vaultAddress: string
): Promise<number> {
  try {
    const allPoints = await fetchAllUserPoints();
    const vaultPoints = allPoints
      .filter(
        (entry) => entry.vault.toLowerCase() === vaultAddress.toLowerCase()
      )
      .reduce((sum, entry) => sum + entry.points, 0);
    return vaultPoints;
  } catch (error) {
    console.error('[Points] Error calculating vault total points:', error);
    return 0;
  }
}

/**
 * Fetch ecosystem points configuration
 * @returns Array of ecosystem points entries
 */
export async function fetchEcosystemPoints(): Promise<EcosystemPointsEntry[]> {
  try {
    const response = await fetch('/points/ecosystem-points.json');
    if (!response.ok) {
      console.warn('[Points] ecosystem-points.json not found or not accessible');
      return [];
    }

    const data: EcosystemPointsEntry[] = await response.json();
    return data;
  } catch (error) {
    console.error('[Points] Error fetching ecosystem points:', error);
    return [];
  }
}

