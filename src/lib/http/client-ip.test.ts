// Sprint C.17 (#17) — derive a coarse, STABLE client-subnet bucket from
// x-forwarded-for for the per-IP quota tier. Masked to /24 (v4) / /64 (v6) so
// one abuser can't trivially rotate a single address to dodge the limit, while
// not over-identifying a shared NAT down to one visitor (Cloudflare-style abuse
// bucketing, not per-user tracking).

import { describe, expect, it } from 'vitest';
import { clientSubnet, maskIp } from './client-ip';

function xff(value: string | null): Headers {
  const h = new Headers();
  if (value !== null) h.set('x-forwarded-for', value);
  return h;
}

describe('clientSubnet (#17)', () => {
  it('masks IPv4 to a /24 bucket', () => {
    expect(clientSubnet(xff('203.0.113.5'))).toBe('203.0.113.0/24');
  });

  it('uses the FIRST hop of a multi-hop x-forwarded-for', () => {
    expect(clientSubnet(xff('203.0.113.5, 70.41.3.18, 150.172.238.178'))).toBe(
      '203.0.113.0/24',
    );
  });

  it('masks IPv6 to a /64 bucket', () => {
    expect(clientSubnet(xff('2001:db8:85a3:8d3:1319:8a2e:370:7348'))).toBe(
      '2001:db8:85a3:8d3::/64',
    );
  });

  it('returns a stable "unknown" bucket for a missing or garbage header', () => {
    expect(clientSubnet(xff(null))).toBe('unknown');
    expect(clientSubnet(xff(''))).toBe('unknown');
    expect(clientSubnet(xff('not-an-ip'))).toBe('unknown');
    expect(clientSubnet(xff('999.1.1.1'))).toBe('unknown'); // out-of-range octet
  });

  it('maskIp is stable: same input → same bucket', () => {
    expect(maskIp('203.0.113.5')).toBe(maskIp('203.0.113.9'));
  });
});
