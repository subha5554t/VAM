import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SellerData, SellerDataSchema, PortfolioSeller } from './types.js';

export interface DataProvider {
  getSeller(sellerId: string): Promise<SellerData>;
  getPortfolio(): Promise<PortfolioSeller[]>;
}

export class MockSellerProvider implements DataProvider {
  private cachedData: SellerData | null = null;
  private readonly filePath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      // Resolve robustly across src, dist, and monorepo root
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const candidates = [
        path.resolve(currentDir, 'data', 'seller.mock.json'),
        path.resolve(currentDir, '..', 'src', 'data', 'seller.mock.json'),
        path.resolve(currentDir, '..', '..', 'data', 'seller.mock.json'),
        path.resolve(process.cwd(), 'data', 'seller.mock.json'),
        path.resolve(process.cwd(), '..', '..', 'data', 'seller.mock.json'),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      this.filePath = found || candidates[0];
    }
  }

  private loadData(): SellerData {
    if (this.cachedData) {
      return this.cachedData;
    }

    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Seller mock data file not found at: ${this.filePath}`);
    }

    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const json = JSON.parse(raw);
    const validated = SellerDataSchema.parse(json);
    this.cachedData = validated;
    return validated;
  }

  async getSeller(sellerId: string): Promise<SellerData> {
    const data = this.loadData();
    if (data.seller.id !== sellerId) {
      throw new Error(`Seller with id ${sellerId} not found in mock provider`);
    }
    return data;
  }

  async getPortfolio(): Promise<PortfolioSeller[]> {
    const data = this.loadData();
    return data.portfolio;
  }
}

export const defaultProvider = new MockSellerProvider();

