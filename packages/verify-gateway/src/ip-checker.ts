/**
 * IP safety validation for SSRF prevention.
 *
 * Checks whether an IP address belongs to a private, reserved, or metadata
 * range that should never be reached by the verification gateway.
 */

/**
 * Parse an IPv4 address string into a 4-element tuple, or return null.
 */
function parseIpv4(ip: string): [number, number, number, number] | null {
  // Handle integer-format IPs (e.g. "2130706433" -> 127.0.0.1)
  if (/^\d+$/.test(ip)) {
    const n = Number(ip);
    if (n < 0 || n > 0xffffffff) return null;
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ];
  }

  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    // Reject octal/hex encoded octets and leading zeros (e.g. "0177", "01")
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }

  return octets as [number, number, number, number];
}

/**
 * Parse an IPv6 address string into a 16-byte Uint8Array, or return null.
 * Handles full, abbreviated (::), and IPv4-mapped (::ffff:x.x.x.x) forms.
 */
function parseIpv6(ip: string): Uint8Array | null {
  // Remove zone ID if present (e.g. %eth0)
  const zoneIdx = ip.indexOf('%');
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;

  // Check for IPv4-mapped suffix
  const lastColon = clean.lastIndexOf(':');
  const possibleIpv4 = clean.slice(lastColon + 1);
  if (possibleIpv4.includes('.')) {
    const ipv4 = parseIpv4(possibleIpv4);
    if (!ipv4) return null;
    const prefix = clean.slice(0, lastColon + 1) + '0:0';
    const bytes = parseIpv6(prefix);
    if (!bytes) return null;
    bytes[12] = ipv4[0];
    bytes[13] = ipv4[1];
    bytes[14] = ipv4[2];
    bytes[15] = ipv4[3];
    return bytes;
  }

  const halves = clean.split('::');
  if (halves.length > 2) return null;

  const result = new Uint8Array(16);

  if (halves.length === 2) {
    const left = halves[0] === '' ? [] : halves[0].split(':');
    const right = halves[1] === '' ? [] : halves[1].split(':');
    if (left.length + right.length > 8) return null;

    let pos = 0;
    for (const group of left) {
      const val = parseInt(group, 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      result[pos++] = (val >> 8) & 0xff;
      result[pos++] = val & 0xff;
    }

    pos = 16 - right.length * 2;
    for (const group of right) {
      const val = parseInt(group, 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      result[pos++] = (val >> 8) & 0xff;
      result[pos++] = val & 0xff;
    }
  } else {
    const groups = clean.split(':');
    if (groups.length !== 8) return null;
    let pos = 0;
    for (const group of groups) {
      const val = parseInt(group, 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      result[pos++] = (val >> 8) & 0xff;
      result[pos++] = val & 0xff;
    }
  }

  return result;
}

/**
 * Check if an IPv4 address (as 4-tuple) falls within a blocked range.
 */
function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;

  // 0.0.0.0/8 — "this" network
  if (a === 0) return true;

  // 10.0.0.0/8 — private
  if (a === 10) return true;

  // 127.0.0.0/8 — loopback
  if (a === 127) return true;

  // 169.254.0.0/16 — link-local / cloud metadata
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 — private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true;

  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — documentation
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;

  // 198.18.0.0/15 — benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 100.64.0.0/10 — shared address space (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 224.0.0.0/4 — multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 — reserved for future use
  if (a >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address (as 16-byte array) falls within a blocked range.
 */
function isPrivateIpv6(bytes: Uint8Array): boolean {
  // ::1 — loopback
  const isLoopback = bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
  if (isLoopback) return true;

  // :: — unspecified
  const isUnspecified = bytes.every((b) => b === 0);
  if (isUnspecified) return true;

  // fe80::/10 — link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  // fc00::/7 — unique local address
  if ((bytes[0] & 0xfe) === 0xfc) return true;

  // ff00::/8 — multicast
  if (bytes[0] === 0xff) return true;

  // ::ffff:0:0/96 — IPv4-mapped IPv6, check the mapped IPv4 part
  const isIpv4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isIpv4Mapped) {
    return isPrivateIpv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }

  // ::ffff:0:0:0/96 — IPv4-translated addresses
  const isIpv4Translated =
    bytes.slice(0, 8).every((b) => b === 0) &&
    bytes[8] === 0xff &&
    bytes[9] === 0xff &&
    bytes[10] === 0 &&
    bytes[11] === 0;
  if (isIpv4Translated) {
    return isPrivateIpv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }

  // 64:ff9b::/96 — NAT64 well-known prefix, check embedded IPv4
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0)
  ) {
    return isPrivateIpv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }

  // 2001:db8::/32 — documentation
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return true;
  }

  return false;
}

/**
 * Check if an IP address string is private, reserved, loopback, or otherwise
 * unsafe to connect to from the server.
 *
 * Supports IPv4, IPv6, IPv4-mapped IPv6 (::ffff:x.x.x.x), and integer-format IPs.
 */
export function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim();

  // Try IPv4 first (including integer format)
  const ipv4 = parseIpv4(trimmed);
  if (ipv4) return isPrivateIpv4(ipv4);

  // Try IPv6 (including IPv4-mapped forms)
  const ipv6 = parseIpv6(trimmed);
  if (ipv6) return isPrivateIpv6(ipv6);

  // If we can't parse it, treat it as unsafe
  return true;
}
