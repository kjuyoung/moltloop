import { describe, it, expect } from 'vitest';
import { isPrivateIp } from '../ip-checker';

describe('isPrivateIp', () => {
  it('should detect 127.x.x.x as private', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
  });

  it('should detect 10.x.x.x as private', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
  });

  it('should detect 172.16.x.x as private', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true);
  });

  it('should NOT detect 172.15.x.x as private', () => {
    expect(isPrivateIp('172.15.0.1')).toBe(false);
  });

  it('should detect 192.168.x.x as private', () => {
    expect(isPrivateIp('192.168.0.1')).toBe(true);
  });

  it('should NOT detect public IPs as private', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });

  it('should detect 0.0.0.0 as private', () => {
    expect(isPrivateIp('0.0.0.0')).toBe(true);
  });

  it('should detect ::1 (IPv6 loopback) as private', () => {
    expect(isPrivateIp('::1')).toBe(true);
  });
});
