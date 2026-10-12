jest.mock('../utils/helper', () => ({
  customHttpException: (error: any) => {
    throw new Error(typeof error === 'string' ? error : error?.message);
  },
  sendEmailHandler: jest.fn().mockResolvedValue(undefined),
  contactusEmail: jest.fn().mockResolvedValue(undefined),
}));

import { SalesProductsService } from './sales-products.service';

const paidOrder = () => ({
  orderId: 'ORD-1',
  email: 'buyer@example.com',
  paymentStatus: false,
  totalPrice: 500,
  products: [
    // flooring: stock is in SQM, so the ordered area is what gets deducted
    { id: 7, category: 'richmond', squareMeter: 12.5, requiredBoxes: 7 },
    // accessory: stock is in pieces
    { id: 3, category: 'Accessories', squareMeter: 3, requiredBoxes: 3 },
  ],
});

describe('SalesProductsService.postpaymentStatus stock deduction (SQM)', () => {
  let prisma: any;
  let service: SalesProductsService;

  beforeEach(() => {
    prisma = {
      salesProducts: {
        findFirst: jest.fn().mockResolvedValue(paidOrder()),
        update: jest.fn().mockResolvedValue({ ...paidOrder(), paymentStatus: true }),
      },
      products: { update: jest.fn().mockResolvedValue({}) },
      acessories: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new SalesProductsService(prisma, {} as any);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('deducts the ordered SQM from flooring stock and pieces from accessory stock', async () => {
    await service.postpaymentStatus({ orderId: 'ORD-1', amount: '500' } as any);

    expect(prisma.products.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { stock: { decrement: 12.5 } },
    });
    // Flooring stock is clamped at zero and rounded to two decimals in SQL
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [sql, id] = prisma.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain('ROUND(GREATEST("stock", 0)::numeric, 2)');
    expect(id).toBe(7);

    expect(prisma.acessories.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { stock: { decrement: 3 } },
    });
    expect(prisma.acessories.updateMany).toHaveBeenCalledWith({
      where: { id: 3, stock: { lt: 0 } },
      data: { stock: 0 },
    });
    expect(prisma.products.update).toHaveBeenCalledTimes(1);
  });

  it('never deducts a negative or non-numeric area', async () => {
    const order = paidOrder();
    order.products = [
      { id: 7, category: 'richmond', squareMeter: -4, requiredBoxes: 1 },
      { id: 8, category: 'polar', squareMeter: 'n/a' as any, requiredBoxes: 1 },
    ];
    prisma.salesProducts.findFirst.mockResolvedValue(order);

    await service.postpaymentStatus({ orderId: 'ORD-1' } as any);

    for (const [args] of prisma.products.update.mock.calls)
      expect(args.data.stock.decrement).toBe(0);
  });

  it('leaves stock alone for free-sample orders and already-paid orders', async () => {
    const sample = paidOrder();
    sample.products = [
      { id: 7, category: 'richmond', squareMeter: 1, requiredBoxes: 1, isfreeSample: true } as any,
    ];
    prisma.salesProducts.findFirst.mockResolvedValueOnce(sample);
    await service.postpaymentStatus({ orderId: 'ORD-1' } as any);

    prisma.salesProducts.findFirst.mockResolvedValueOnce({ ...paidOrder(), paymentStatus: true });
    await service.postpaymentStatus({ orderId: 'ORD-1' } as any);

    expect(prisma.products.update).not.toHaveBeenCalled();
    expect(prisma.acessories.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
