import { GoogleMerchantService } from './gcp.service';

// Mirrors the real sheet layout: SKU, physical boxes, per-box SQM, total SQM.
const SHEET_CSV = [
  'SR No,Item Name,SKU,Physical Box available in stock,Per Box SQM,Total SQM ',
  ',,,,,',
  '1,Richmond Eco - Premium Oak,EI12837,127,2.664,338.328',
  '2,Trust the total column,TOT01,100,2,150',
  '3,Blank total falls back to boxes x per box,FALL01,10,2.5,',
  '4,Accessory (pieces only),ACC01,37,,',
  '5,Listed twice but identical,DUP01,5,2,10',
  '6,Listed twice but identical,DUP01,5,2,10',
  '7,Listed twice with different stock,CONF01,5,2,10',
  '8,Listed twice with different stock,CONF01,6,2,12',
  '9,Not a number,BAD01,abc,2,',
  '10,Negative stock,NEG01,-4,2,-8',
  '11,Unknown SKU,NOPE01,1,1,1',
  ',TOTAL,,,,',
].join('\n');

const fetchResponse = (body: string, ok = true, type = 'text/csv') =>
  jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 302,
    headers: { get: () => type },
    text: async () => body,
  });

describe('GoogleMerchantService.UpdateStock (stock in SQM)', () => {
  let prisma: any;
  let service: GoogleMerchantService;

  beforeEach(() => {
    prisma = {
      products: { updateMany: jest.fn() },
      acessories: { updateMany: jest.fn() },
    };
    service = new GoogleMerchantService({} as any, prisma);
  });

  it('writes product stock from the Total SQM column and accessory stock in pieces', async () => {
    (global as any).fetch = fetchResponse(SHEET_CSV);
    // Every SKU is a product except ACC01 (an accessory) and NOPE01 (unknown)
    prisma.products.updateMany.mockImplementation(async ({ where }: any) => ({
      count: where.sku === 'ACC01' || where.sku === 'NOPE01' ? 0 : 1,
    }));
    prisma.acessories.updateMany.mockImplementation(async ({ where }: any) => ({
      count: where.sku === 'ACC01' ? 1 : 0,
    }));

    const result = await service.UpdateStock();

    const stockCalls = prisma.products.updateMany.mock.calls
      .map(([args]: any) => args)
      .filter((args: any) => 'stock' in args.data);
    const productStock = Object.fromEntries(
      stockCalls.map((args: any) => [args.where.sku, args.data.stock]),
    );
    expect(productStock).toEqual({
      EI12837: 338.33, // rounded to two decimals
      TOT01: 150, // total column wins over boxes x per box (200)
      FALL01: 25, // blank total -> 10 boxes x 2.5
      ACC01: 0, // no SQM data at all; tried as a product first
      DUP01: 10,
      NEG01: 0, // never below zero
      NOPE01: 1,
    });
    // Conflicting and invalid rows are never written
    expect(productStock).not.toHaveProperty('CONF01');
    expect(productStock).not.toHaveProperty('BAD01');
    for (const args of stockCalls)
      expect(args.data.stockUpdateDate).toBeInstanceOf(Date);

    const accessoryStock = Object.fromEntries(
      prisma.acessories.updateMany.mock.calls.map(([args]: any) => [
        args.where.sku,
        args.data.stock,
      ]),
    );
    expect(accessoryStock).toEqual({ ACC01: 37, NOPE01: 1 });

    expect(result).toEqual({
      products: 5,
      accessories: 1,
      notFound: ['NOPE01'],
      invalid: ['BAD01'],
      conflicting: ['CONF01'],
    });
  });

  it('fills in a missing SQM-per-carton from the sheet without overwriting an existing one', async () => {
    (global as any).fetch = fetchResponse(SHEET_CSV);
    prisma.products.updateMany.mockResolvedValue({ count: 1 });
    prisma.acessories.updateMany.mockResolvedValue({ count: 0 });

    await service.UpdateStock();

    expect(prisma.products.updateMany).toHaveBeenCalledWith({
      where: { sku: 'EI12837', OR: [{ boxCoverage: null }, { boxCoverage: '' }] },
      data: { boxCoverage: '2.664' },
    });
    // No per-box value on the sheet -> nothing to fill in
    const coverageSkus = prisma.products.updateMany.mock.calls
      .map(([args]: any) => args)
      .filter((args: any) => 'boxCoverage' in args.data)
      .map((args: any) => args.where.sku);
    expect(coverageSkus).not.toContain('ACC01');
  });

  it('fails instead of writing when the sheet is not readable as CSV', async () => {
    (global as any).fetch = fetchResponse('<html>sign in</html>', false, 'text/html');

    await expect(service.UpdateStock()).rejects.toThrow();
    expect(prisma.products.updateMany).not.toHaveBeenCalled();
    expect(prisma.acessories.updateMany).not.toHaveBeenCalled();
  });
});
