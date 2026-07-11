// Sprint C.17 (#17) — coarse client-subnet bucket for the per-IP quota tier.
//
// Reads x-forwarded-for (the first hop is the client; later hops are proxies)
// and masks to /24 (IPv4) / /64 (IPv6). The result is a STABLE key for a quota
// counter, not a canonical CIDR — a compressed IPv6 still yields a deterministic
// bucket. Masking balances abuse protection (one address rotation stays in one
// bucket) against over-identifying a shared NAT/carrier egress. A missing or
// unparseable header collapses to a single 'unknown' bucket (fail into ONE
// shared counter, never a per-request bypass).

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Mask a single raw IP to its /24 (v4) or /64 (v6) bucket, or 'unknown'. */
export function maskIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, '');
  const v4 = ip.match(IPV4);
  if (v4) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    return 'unknown';
  }
  if (ip.includes(':')) {
    const groups = ip.split(':');
    if (groups.length >= 3) {
      return `${groups.slice(0, 4).join(':')}::/64`;
    }
  }
  return 'unknown';
}

/** The client-subnet quota bucket for a request, from its x-forwarded-for. */
export function clientSubnet(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (!xff) return 'unknown';
  const first = xff.split(',')[0]?.trim();
  if (!first) return 'unknown';
  return maskIp(first);
}
