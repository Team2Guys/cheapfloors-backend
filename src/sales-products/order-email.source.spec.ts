// The real order email handler, with nodemailer replaced, to check that the
// source reaches the team's copy only.
const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => {
  const transport = { createTransport: () => ({ sendMail }) };
  return { __esModule: true, default: transport, ...transport };
});

import { sendEmailHandler } from '../utils/helper';

const order = {
  orderId: 'ORD-1',
  firstName: 'Test',
  lastName: 'Buyer',
  email: 'buyer@example.com',
  phone: '+971501234567',
  address: 'Somewhere',
  emirate: 'Dubai',
  city: 'Dubai',
  country: 'AE',
  totalPrice: 2340,
  shipmentFee: 0,
  products: [],
  shippingMethod: { name: 'Standard Shipping' },
  transactionDate: new Date('2026-11-16T10:00:00Z'),
  channel: 'Google Ads',
  sourceTracked: 'Google Ads - Campaign 999 - "spc flooring dubai" [p]',
  lastTouchDetail: 'Google Ads - Campaign 999 - "spc flooring dubai" [p]',
  gclid: 'Cj0KCQ-test',
};

const sent = () =>
  sendMail.mock.calls.map(([mail]) => ({ to: mail.to, html: mail.html as string }));

describe('order email: source in the team copy only', () => {
  beforeEach(() => {
    sendMail.mockClear();
    process.env.EMAIL_USER = 'orders@cheapfloors.test';
  });

  it('new order: highlighted source near the top and details at the end for the team', async () => {
    await sendEmailHandler(order as any, 'buyer@example.com');
    const [team, customer] = sent();

    expect(team.to).toContain('orders@cheapfloors.test');
    const banner = team.html.indexOf('Order source &middot; Google Ads');
    expect(banner).toBeGreaterThan(-1);
    // Above the order content, right under the order number.
    expect(banner).toBeLessThan(team.html.indexOf('Order Confirmation</h1>'));
    expect(team.html).toContain('Order source details (team only)');
    expect(team.html).toContain('gclid=Cj0KCQ-test');

    expect(customer.to).toBe('buyer@example.com');
    expect(customer.html).not.toContain('Order source');
    expect(customer.html).not.toContain('Cj0KCQ-test');
  });

  it('an order placed before tracking says so in the team copy', async () => {
    const { channel, sourceTracked, lastTouchDetail, gclid, ...untracked } = order;
    await sendEmailHandler(untracked as any, 'buyer@example.com');
    const [team] = sent();
    expect(team.html).toContain('Not tracked');
    expect(team.html).not.toContain('Order source details');
  });

  it('shipped and delivered updates carry no source', async () => {
    await sendEmailHandler({ ...order, deliveryDate: new Date() } as any, 'buyer@example.com', 'shipped');
    for (const mail of sent()) expect(mail.html).not.toContain('Order source');
  });
});
