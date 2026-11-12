import { describe, it, expect } from 'vitest';
import { MockSellerProvider } from './provider.js';

describe('MockSellerProvider', () => {
  const provider = new MockSellerProvider();

  it('loads and validates the mock seller data without schema errors', async () => {
    const seller = await provider.getSeller('SD-48213');
    expect(seller).toBeDefined();
    expect(seller.seller.name).toBe('Rajesh Sharma');
    expect(seller.seller.business).toBe('Sharma Home Essentials');
    expect(seller.seller.activeSkus).toBe(60);
    expect(seller.skus.length).toBe(60);
  });

  it('loads portfolio sellers', async () => {
    const portfolio = await provider.getPortfolio();
    expect(portfolio.length).toBe(6);
    const outlier = portfolio.find(p => p.sellerId === 'SD-48213');
    expect(outlier).toBeDefined();
    expect(outlier?.anomalyScore).toBe(0.91);
  });

  it('rejects unknown seller IDs', async () => {
    await expect(provider.getSeller('UNKNOWN-999')).rejects.toThrow('not found');
  });
});

