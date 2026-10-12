jest.mock('../utils/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
jest.mock('../utils/helper', () => ({
  customHttpException: (error: any) => {
    throw new Error(typeof error === 'string' ? error : error?.message);
  },
}));

import { ProductsService } from './products.service';

describe('ProductsService stock is stored as SQM', () => {
  let prisma: any;
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      products: {
        create: jest.fn(async ({ data }: any) => ({ id: 1, custom_url: 'oak', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 1, custom_url: 'oak', ...data })),
      },
    };
    service = new ProductsService(prisma);
  });

  it('create keeps fractional SQM, rounded to two decimals', async () => {
    await service.create({ name: 'Oak', stock: 255.2749, category: 1, subcategory: 2 } as any);

    expect(prisma.products.create.mock.calls[0][0].data.stock).toBe(255.27);
  });

  it('create clamps negative stock to zero', async () => {
    await service.create({ name: 'Oak', stock: -3.5, category: 1, subcategory: 2 } as any);

    expect(prisma.products.create.mock.calls[0][0].data.stock).toBe(0);
  });

  it('update keeps decimals and clamps negatives', async () => {
    await service.update(1, { id: 1, stock: 12.346 } as any);
    await service.update(1, { id: 1, stock: -1 } as any);

    expect(prisma.products.update.mock.calls[0][0].data.stock).toBe(12.35);
    expect(prisma.products.update.mock.calls[1][0].data.stock).toBe(0);
  });

  it('update does not touch stock when it is not part of the input', async () => {
    await service.update(1, { id: 1, name: 'Renamed' } as any);

    expect(prisma.products.update.mock.calls[0][0].data).not.toHaveProperty('stock');
  });
});
