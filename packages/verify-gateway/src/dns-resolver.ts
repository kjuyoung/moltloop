/**
 * DNS resolution with SSRF safety checks.
 *
 * Resolves a hostname to IP addresses and validates that none of them
 * point to private/reserved ranges.
 *
 * Ideally we would use DNS pinning (resolve first, then connect directly
 * to the validated IP). In Deno Edge Functions the Deno.resolveDns API
 * may not be available. We attempt it first and fall back to a
 * socket-level validation approach via the standard fetch API.
 */

import { isPrivateIp } from './ip-checker';

export interface DnsResolveOk {
  ip: string;
}

export interface DnsResolveError {
  error: string;
}

export type DnsResolveResult = DnsResolveOk | DnsResolveError;

export function isError(result: DnsResolveResult): result is DnsResolveError {
  return 'error' in result;
}

/**
 * Resolve a hostname and validate that all resolved IPs are public.
 *
 * Returns the first valid public IP, or an error if resolution fails
 * or any resolved IP falls within a private/reserved range.
 */
export async function resolveAndValidate(
  hostname: string,
): Promise<DnsResolveResult> {
  // Block raw IP literals used as hostnames
  if (isIpLiteral(hostname)) {
    if (isPrivateIp(hostname)) {
      return { error: `Hostname resolves to private IP: ${hostname}` };
    }
    return { ip: hostname };
  }

  // Try Deno.resolveDns if available (Deno runtime)
  try {
    const deno = (globalThis as Record<string, unknown>)['Deno'] as
      | { resolveDns?: (name: string, type: string) => Promise<string[]> }
      | undefined;

    if (deno?.resolveDns) {
      const ips: string[] = [];

      // Resolve A (IPv4) and AAAA (IPv6) records
      const [aRecords, aaaaRecords] = await Promise.allSettled([
        deno.resolveDns(hostname, 'A'),
        deno.resolveDns(hostname, 'AAAA'),
      ]);

      if (aRecords.status === 'fulfilled') ips.push(...aRecords.value);
      if (aaaaRecords.status === 'fulfilled') ips.push(...aaaaRecords.value);

      if (ips.length === 0) {
        return { error: `DNS resolution failed for ${hostname}: no records found` };
      }

      // Check ALL resolved IPs — if any is private, reject
      for (const ip of ips) {
        if (isPrivateIp(ip)) {
          return { error: `Hostname resolves to private IP: ${ip}` };
        }
      }

      return { ip: ips[0] };
    }
  } catch {
    // Deno.resolveDns not available or failed — fall through to fallback
  }

  // Fallback: We cannot do DNS resolution directly in all environments.
  // The caller (safeFetch) will validate by using redirect: 'manual' and
  // checking the response. This is less ideal than DNS pinning but
  // provides a reasonable safety net when native DNS APIs are unavailable.
  //
  // For the fallback case, we return a sentinel so the caller knows
  // it must rely on post-connection validation.
  return { ip: '__unresolved__' };
}

/**
 * Check if a string looks like a raw IP address rather than a hostname.
 */
function isIpLiteral(hostname: string): boolean {
  // IPv4 (dotted decimal or integer form)
  if (/^\d+(\.\d+){3}$/.test(hostname)) return true;
  if (/^\d+$/.test(hostname)) return true;
  // IPv6 (contains colons)
  if (hostname.includes(':')) return true;
  return false;
}

