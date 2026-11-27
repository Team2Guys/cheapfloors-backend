jest.mock('../utils/helper', () => ({
  customHttpException: (error: any) => {
    throw new Error(typeof error === 'string' ? error : error?.message);
  },
  sendEmailHandler: jest.fn().mockResolvedValue(undefined),
  contactusEmail: jest.fn().mockResolvedValue(undefined),
}));

import * as jwt from 'jsonwebtoken';
import { sendEmailHandler } from '../utils/helper';
import { SalesProductsService } from './sales-products.service';
import { SalesProductsResolver } from './sales-products.resolver';
import {
  ADMIN_ONLY_ORDER_FIELDS,
  cleanOrderSource,
  hideOrderSource,
  normalisePhone,
  orderSourceBannerHtml,
  orderSourceDetailsHtml,
  orderSourceLines,
  requestIsAdmin,
} from './order-source';

const SECRET = 'order-source-spec-secret';

// What the storefront sends (cheapfloor-frontend lib/cf-attribution.ts).
const SOURCE = {
  channel: 'Google Ads',
  sourceTracked:
    'Google Ads - Campaign 999 - "spc flooring dubai" [p] (first touch: Meta Ads - Campaign "Nov Flooring")',
  firstTouchChannel: 'Meta Ads',
  firstTouchDetail: 'Meta Ads - Campaign "Nov Flooring"',
  lastTouchChannel: 'Google Ads',
  lastTouchDetail: 'Google Ads - Campaign 999 - "spc flooring dubai" [p]',
  firstVisit: '2026-11-02T15:14:00.000Z',
  landingPage: '/spc-flooring/herringbone',
  referrer: 'https://www.facebook.com/',
  gclid: 'Cj0KCQ-test',
  fbclid: 'IwAR-test',
  touchPath: JSON.stringify([
    {
      channel: 'Meta Ads',
      detail: 'Meta Ads - Campaign "Nov Flooring"',
      clickIds: { fbclid: 'IwAR-test' },
      ts: '2026-11-02T15:14:00.000Z',
    },
    {
      channel: 'Google Ads',
      detail: 'Google Ads - Campaign 999 - "spc flooring dubai" [p]',
      clickIds: { gclid: 'Cj0KCQ-test' },
      ts: '2026-11-05T09:00:00.000Z',
    },
  ]),
};

const orderInput = (extra: Record<string, unknown> = {}) =>
  ({
    firstName: 'Test',
    lastName: 'Buyer',
    email: 'buyer@example.com',
    phone: '+971 50 123 4567',
    city: 'Dubai',
    country: 'AE',
    address: 'Somewhere',
    emirate: 'Dubai',
    totalPrice: 2340,
    shipmentFee: 0,
    products: [{ id: 1, name: 'SPC', isfreeSample: false }],
    shippingMethod: { name: 'Standard Shipping' },
    ...extra,
  }) as any;

describe('cleanOrderSource', () => {
  it('maps the storefront fields onto the order columns', () => {
    const columns = cleanOrderSource(SOURCE);
    expect(columns.channel).toBe('Google Ads');
    expect(columns.firstTouchChannel).toBe('Meta Ads');
    expect(columns.lastTouchDetail).toBe(SOURCE.lastTouchDetail);
    expect(columns.firstVisit).toEqual(new Date(SOURCE.firstVisit));
    expect(columns.gclid).toBe('Cj0KCQ-test');
    expect(Array.isArray(columns.touchPath)).toBe(true);
    expect((columns.touchPath as any[]).map((t) => t.channel)).toEqual([
      'Meta Ads',
      'Google Ads',
    ]);
  });

  it('gives no columns when no source was sent (older storefront)', () => {
    expect(cleanOrderSource(undefined)).toEqual({});
    expect(cleanOrderSource(null)).toEqual({});
  });

  it('records a source sent without a cookie as Unknown', () => {
    const columns = cleanOrderSource({ sourceTracked: '' });
    expect(columns.channel).toBe('Unknown');
    expect(columns.sourceTracked).toBe('Unknown');
  });

  it('cleans untrusted values', () => {
    const columns = cleanOrderSource({
      channel: '<img src=x onerror=alert(1)>Google Ads\u0000',
      sourceTracked: 'x'.repeat(5000),
      firstVisit: 'yesterday-ish',
      touchPath: '{not json',
    });
    expect(columns.channel).not.toMatch(/[<>\u0000]/);
    expect(columns.sourceTracked!.length).toBeLessThanOrEqual(450);
    expect(columns.firstVisit).toBeNull();
    expect(columns).not.toHaveProperty('touchPath');
  });

  it('keeps at most ten touches and only known keys', () => {
    const path = Array.from({ length: 15 }, (_, i) => ({
      channel: `C${i}`,
      detail: `D${i}`,
      password: 'nope',
      clickIds: { gclid: `g${i}`, evil: 'x' },
    }));
    const touches = cleanOrderSource({ touchPath: JSON.stringify(path) })
      .touchPath as any[];
    expect(touches).toHaveLength(10);
    expect(touches[0]).not.toHaveProperty('password');
    expect(touches[0].clickIds).toEqual({ gclid: 'g0' });
  });
});

describe('normalisePhone', () => {
  it.each([
    ['+971 50 123 4567', '+971501234567'],
    ['+971501234567', '+971501234567'],
    ['00971501234567', '+971501234567'],
    ['0501234567', '+971501234567'],
    ['501234567', '+971501234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each([['+97142345678'], ['+923001234567'], ['+971 50 123'], [''], [null]])(
    'leaves %s empty',
    (input) => {
      expect(normalisePhone(input as any)).toBeNull();
    },
  );
});

describe('who sees the source fields', () => {
  const order = { orderId: 'ORD-1', totalPrice: 10, ...cleanOrderSource(SOURCE), phoneE164: '+971501234567', gatewayStatus: 'Success' };

  beforeAll(() => {
    process.env.TOKEN_SECRET = SECRET;
  });

  it('hideOrderSource blanks every admin-only field and keeps the rest', () => {
    const hidden = hideOrderSource(order) as Record<string, unknown>;
    for (const field of ADMIN_ONLY_ORDER_FIELDS) expect(hidden[field]).toBeNull();
    expect(hidden.orderId).toBe('ORD-1');
    expect(hidden.totalPrice).toBe(10);
    expect(hideOrderSource(null)).toBeNull();
  });

  it('requestIsAdmin accepts only a valid admin token', () => {
    const bearer = (payload: object, secret = SECRET) => ({
      headers: { authorization: `Bearer ${jwt.sign(payload, secret)}` },
    });
    expect(requestIsAdmin(bearer({ role: 'Admin' }))).toBe(true);
    expect(requestIsAdmin(bearer({ role: 'super_admin' }))).toBe(true);
    expect(
      requestIsAdmin({
        cookies: { admin_access_token: jwt.sign({ role: 'Admin' }, SECRET) },
      }),
    ).toBe(true);
    expect(requestIsAdmin(bearer({ id: 1, email: 'c@example.com' }))).toBe(false);
    expect(requestIsAdmin(bearer({ role: 'Admin' }, 'forged'))).toBe(false);
    expect(requestIsAdmin({ headers: {} })).toBe(false);
    expect(requestIsAdmin(undefined)).toBe(false);
  });

  it('the public Order query fills them in for admins only', async () => {
    const service = { findOne: jest.fn().mockResolvedValue(order) } as any;
    const resolver = new SalesProductsResolver(service);

    const anonymous: any = await resolver.findOne('ORD-1', { headers: {} } as any);
    expect(anonymous.channel).toBeNull();
    expect(anonymous.touchPath).toBeNull();
    expect(anonymous.orderId).toBe('ORD-1');

    const admin: any = await resolver.findOne('ORD-1', {
      headers: { authorization: `Bearer ${jwt.sign({ role: 'Admin' }, SECRET)}` },
    } as any);
    expect(admin.channel).toBe('Google Ads');
    expect(admin.gclid).toBe('Cj0KCQ-test');
  });

  it('postpaymentStatus and usersOrders never return them', async () => {
    const service = {
      findOne: jest.fn().mockResolvedValue(order),
      findOrderByMail: jest.fn().mockResolvedValue([order]),
    } as any;
    const resolver = new SalesProductsResolver(service);

    const thankYou: any = await resolver.postpaymentStatus({ orderId: 'ORD-1' } as any);
    expect(thankYou.sourceTracked).toBeNull();

    const mine: any = await resolver.OrdersMyMail({
      user: { email: 'buyer@example.com' },
    } as any);
    expect(mine[0].gclid).toBeNull();
    expect(mine[0].phoneE164).toBeNull();
  });
});

describe('SalesProductsService saves the source with the order', () => {
  let prisma: any;
  let service: SalesProductsService;

  beforeEach(() => {
    // Mirrors Prisma: create returns the row (with its id), update returns
    // the full updated row, not just the patch.
    let lastCreated: any = null;
    prisma = {
      salesProducts: {
        create: jest.fn().mockImplementation(({ data }) => {
          lastCreated = { ...data, id: 7 };
          return Promise.resolve(lastCreated);
        }),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...(lastCreated ?? {}), ...data }),
        ),
      },
      products: { update: jest.fn() },
      acessories: { update: jest.fn(), updateMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const ccavenue = {
      buildRequestParams: jest.fn().mockReturnValue('params'),
      encrypt: jest.fn().mockReturnValue('enc'),
    };
    service = new SalesProductsService(prisma, ccavenue as any);
    (sendEmailHandler as jest.Mock).mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('createSalesProduct writes the source columns and phoneE164, not `source`', async () => {
    await service.create(orderInput({ source: SOURCE }));
    const { data } = prisma.salesProducts.create.mock.calls[0][0];
    expect(data).not.toHaveProperty('source');
    expect(data.channel).toBe('Google Ads');
    expect(data.firstTouchChannel).toBe('Meta Ads');
    expect(data.touchPath).toHaveLength(2);
    expect(data.phoneE164).toBe('+971501234567');
    expect(data.checkout).toBe(true);
  });

  it('an order without a source still goes through, untracked', async () => {
    await service.create(orderInput());
    const { data } = prisma.salesProducts.create.mock.calls[0][0];
    expect(data).not.toHaveProperty('channel');
    expect(data.phoneE164).toBe('+971501234567');
  });

  it('freeSample writes the source too and emails it', async () => {
    await service.freeSample(orderInput({ source: SOURCE, phone: '+923001234567' }));
    const { data } = prisma.salesProducts.create.mock.calls[0][0];
    expect(data).not.toHaveProperty('source');
    expect(data.channel).toBe('Google Ads');
    expect(data.phoneE164).toBeNull();
    const emailed = (sendEmailHandler as jest.Mock).mock.calls[0][0];
    expect(emailed.sourceTracked).toBe(SOURCE.sourceTracked);
  });
});

describe('CCAvenue result: failed payments are not marked paid', () => {
  let prisma: any;
  let service: SalesProductsService;
  const unpaid = { orderId: 'ORD-1', email: 'b@example.com', paymentStatus: false, totalPrice: 500, products: [{ id: 7, category: 'spc', squareMeter: 10 }] };

  beforeEach(() => {
    prisma = {
      salesProducts: {
        findFirst: jest.fn().mockResolvedValue(unpaid),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...unpaid, ...data })),
      },
      products: { update: jest.fn() },
      acessories: { update: jest.fn(), updateMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    service = new SalesProductsService(prisma, {} as any);
    (sendEmailHandler as jest.Mock).mockClear();
  });

  it.each(['Failure', 'Aborted', 'Invalid'])('%s: recorded, unpaid, no stock change, no email', async (status) => {
    await service.postpaymentStatus({ orderId: 'ORD-1', success: false, gatewayStatus: status, transactionId: 't1' } as any);
    const { data } = prisma.salesProducts.update.mock.calls[0][0];
    expect(data.gatewayStatus).toBe(status);
    expect(data.success).toBe(false);
    expect(data).not.toHaveProperty('paymentStatus');
    expect(data).not.toHaveProperty('checkout');
    expect(prisma.products.update).not.toHaveBeenCalled();
    expect(sendEmailHandler).not.toHaveBeenCalled();
  });

  it('Success: paid as before, with the gateway status kept', async () => {
    await service.postpaymentStatus({ orderId: 'ORD-1', success: true, gatewayStatus: 'Success' } as any);
    const { data } = prisma.salesProducts.update.mock.calls[0][0];
    expect(data.paymentStatus).toBe(true);
    expect(data.gatewayStatus).toBe('Success');
    expect(prisma.products.update).toHaveBeenCalled();
    expect(sendEmailHandler).toHaveBeenCalledTimes(1);
  });
});

describe('order email source blocks', () => {
  const order = { ...cleanOrderSource(SOURCE), totalPrice: 2340 };

  it('banner shows the tracked source prominently, escaped', () => {
    const html = orderSourceBannerHtml({ ...order, sourceTracked: 'Referral: <b>x</b>' });
    expect(html).toContain('Order source &middot; Google Ads');
    expect(html).toContain('Referral: &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('banner says "not tracked" for an order without a source', () => {
    expect(orderSourceBannerHtml({ totalPrice: 10 })).toContain('Not tracked');
    expect(orderSourceDetailsHtml({ totalPrice: 10 })).toBe('');
  });

  it('detail lines follow the spec', () => {
    const lines = Object.fromEntries(orderSourceLines(order));
    expect(lines['Source (Tracked)']).toBe(SOURCE.sourceTracked);
    expect(lines['First touch']).toBe('Meta Ads - Campaign "Nov Flooring"');
    expect(lines['Last touch']).toBe(SOURCE.lastTouchDetail);
    expect(lines['First visit']).toBe('02 Nov 2026, 19:14'); // Dubai time
    expect(lines['Landing page']).toBe('https://cheapfloors.ae/spc-flooring/herringbone');
    expect(lines['Order value']).toBe('AED 2,340.00');
    expect(lines['Click IDs']).toBe('gclid=Cj0KCQ-test, fbclid=IwAR-test');
  });
});
