import * as jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

/**
 * Admin and super admin tokens carry a non-empty `role`; customer tokens
 * (userLogin, same secret) never do. The same rule as the auth guard's
 * isAdminToken, kept here so this file does not depend on the guard.
 */
const hasAdminRole = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const role = (payload as { role?: unknown }).role;
  return typeof role === 'string' && role.trim() !== '';
};

/**
 * Order source tracking, backend side.
 *
 * The storefront remembers where a visitor came from in its cf_src cookie
 * (cheapfloor-frontend src/lib/cf-attribution.ts) and sends it as `source`
 * with createSalesProduct / freeSample. Those run before the CCAvenue
 * redirect, so the order row carries its source from the start.
 *
 * The values come from the browser, so they are untrusted: every string is
 * capped and stripped of control characters and angle brackets, and a bad
 * source never stops an order.
 */

export type OrderSourceInputLike = {
  channel?: string | null;
  sourceTracked?: string | null;
  firstTouchChannel?: string | null;
  firstTouchDetail?: string | null;
  lastTouchChannel?: string | null;
  lastTouchDetail?: string | null;
  firstVisit?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  touchPath?: string | null;
};

export type OrderSourceColumns = {
  channel?: string | null;
  sourceTracked?: string | null;
  firstTouchChannel?: string | null;
  firstTouchDetail?: string | null;
  lastTouchChannel?: string | null;
  lastTouchDetail?: string | null;
  firstVisit?: Date | null;
  landingPage?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  touchPath?: Prisma.InputJsonValue;
};

/** Admin-only order fields: null in every answer to a non-admin. */
export const ADMIN_ONLY_ORDER_FIELDS = [
  'channel',
  'sourceTracked',
  'firstTouchChannel',
  'firstTouchDetail',
  'lastTouchChannel',
  'lastTouchDetail',
  'firstVisit',
  'landingPage',
  'referrer',
  'gclid',
  'fbclid',
  'touchPath',
  'phoneE164',
  'gatewayStatus',
] as const;

const MAX_TOUCHES = 10;
const CLICK_ID_KEYS = [
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid',
  'ScCid',
];
const TOUCH_TEXT_FIELDS: [string, number][] = [
  ['channel', 80],
  ['detail', 200],
  ['utm_source', 100],
  ['utm_medium', 100],
  ['utm_campaign', 100],
  ['utm_content', 100],
  ['utm_term', 100],
  ['utm_matchtype', 10],
  ['referrer', 200],
  ['landingPage', 200],
  ['ts', 40],
];

export const clip = (value: unknown, max = 200): string =>
  (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const orNull = (value: unknown, max?: number) => clip(value, max) || null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A first-visit time we can believe: parseable, not before 2020, not ahead. */
const visitTime = (value: unknown): Date | null => {
  const text = clip(value, 40);
  if (!text) return null;
  const date = new Date(text);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  if (time < Date.UTC(2020, 0, 1) || time > Date.now() + 24 * 3600 * 1000) {
    return null;
  }
  return date;
};

/** The touch path as a clean JSON array, or undefined when unusable. */
const cleanTouchPath = (value: unknown): Prisma.InputJsonValue | undefined => {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.length > 20000) return undefined;
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;

  const touches = parsed
    .filter(isPlainObject)
    .slice(0, MAX_TOUCHES)
    .map((touch) => {
      const clean: Record<string, unknown> = {};
      for (const [key, max] of TOUCH_TEXT_FIELDS) {
        const text = clip(touch[key], max);
        if (text) clean[key] = text;
      }
      const clickIds: Record<string, string> = {};
      if (isPlainObject(touch.clickIds)) {
        for (const key of CLICK_ID_KEYS) {
          const text = clip(touch.clickIds[key], 200);
          if (text) clickIds[key] = text;
        }
      }
      clean.clickIds = clickIds;
      return clean;
    })
    .filter((touch) => typeof touch.channel === 'string');

  return touches.length ? (touches as Prisma.InputJsonValue) : undefined;
};

/**
 * The order columns for a source sent by the storefront. An order sent with no
 * source at all (an older storefront) gets none, so it reads as "not tracked";
 * one sent without a cookie comes as channel "Unknown", as the storefront says.
 * Never throws.
 */
export const cleanOrderSource = (
  source?: OrderSourceInputLike | null,
): OrderSourceColumns => {
  try {
    if (!isPlainObject(source)) return {};
    const channel = clip(source.channel, 80) || 'Unknown';
    const columns: OrderSourceColumns = {
      channel,
      sourceTracked: clip(source.sourceTracked, 450) || channel,
      firstTouchChannel: orNull(source.firstTouchChannel, 80),
      firstTouchDetail: orNull(source.firstTouchDetail, 200),
      lastTouchChannel: orNull(source.lastTouchChannel, 80),
      lastTouchDetail: orNull(source.lastTouchDetail, 200),
      firstVisit: visitTime(source.firstVisit),
      landingPage: orNull(source.landingPage, 200),
      referrer: orNull(source.referrer, 200),
      gclid: orNull(source.gclid, 200),
      fbclid: orNull(source.fbclid, 200),
    };
    const touchPath = cleanTouchPath(source.touchPath);
    if (touchPath !== undefined) columns.touchPath = touchPath;
    return columns;
  } catch {
    return {};
  }
};

/**
 * A UAE mobile as +9715XXXXXXXX, or null for anything else (landline,
 * foreign, malformed). The same rule must be used on the WhatsApp side when
 * matching chats to orders.
 */
export function normalisePhone(input?: string | null): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('971')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  if (digits.length !== 9 || !digits.startsWith('5')) return null;
  return `+971${digits}`;
}

/** The order with its admin-only fields set to null. */
export function hideOrderSource<T>(order: T): T {
  if (!isPlainObject(order)) return order;
  const copy: Record<string, unknown> = { ...order };
  for (const field of ADMIN_ONLY_ORDER_FIELDS) copy[field] = null;
  return copy as T;
}

export type RequestLike = {
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * True when a request on a @Public() operation carries a valid admin token.
 * Reads the token the same way the global AuthGuard does (backend cookie
 * first, then the Bearer header). Any problem means "not an admin".
 */
export function requestIsAdmin(req?: RequestLike | null): boolean {
  try {
    let token =
      req?.cookies?.admin_access_token ||
      req?.cookies?.super_admin_access_token;
    if (!token) {
      const header = req?.headers?.authorization;
      const value = Array.isArray(header) ? header[0] : header;
      if (value?.startsWith('Bearer ')) token = value.slice(7);
    }
    if (!token || !process.env.TOKEN_SECRET) return false;
    return hasAdminRole(jwt.verify(token, process.env.TOKEN_SECRET));
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Order email (team copy only)
   --------------------------------------------------------------------------- */

export type OrderSourceForEmail = {
  channel?: string | null;
  sourceTracked?: string | null;
  firstTouchDetail?: string | null;
  lastTouchDetail?: string | null;
  firstVisit?: Date | string | null;
  landingPage?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  touchPath?: unknown;
  totalPrice?: number | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ] as string,
  );

/** "02 Nov 2026, 19:14" in Dubai time; empty for a missing or bad date. */
export const formatDubaiTime = (value?: Date | string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
};

const SITE = 'https://cheapfloors.ae';

/** The detail lines, as [label, value]. Empty values are kept as "-". */
export const orderSourceLines = (
  order: OrderSourceForEmail,
): [string, string][] => {
  const clickIds: string[] = [];
  if (order.gclid) clickIds.push(`gclid=${order.gclid}`);
  if (order.fbclid) clickIds.push(`fbclid=${order.fbclid}`);
  if (Array.isArray(order.touchPath)) {
    for (const touch of order.touchPath) {
      if (!isPlainObject(touch) || !isPlainObject(touch.clickIds)) continue;
      for (const [key, value] of Object.entries(touch.clickIds)) {
        const entry = `${key}=${value}`;
        if (key !== 'gclid' && key !== 'fbclid' && !clickIds.includes(entry)) {
          clickIds.push(entry);
        }
      }
    }
  }
  const landing = order.landingPage
    ? order.landingPage.startsWith('http')
      ? order.landingPage
      : `${SITE}${order.landingPage}`
    : '';
  return [
    ['Source (Tracked)', order.sourceTracked || order.channel || ''],
    ['First touch', order.firstTouchDetail || ''],
    ['Last touch', order.lastTouchDetail || ''],
    ['First visit', formatDubaiTime(order.firstVisit)],
    ['Landing page', landing],
    [
      'Order value',
      typeof order.totalPrice === 'number'
        ? `AED ${order.totalPrice.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '',
    ],
    ['Click IDs', clickIds.join(', ')],
  ].map(([label, value]) => [label, value || '-'] as [string, string]);
};

/** The highlighted line at the top of the team's copy of the order email. */
export const orderSourceBannerHtml = (order: OrderSourceForEmail): string => {
  const tracked = !!order.channel;
  const summary = tracked
    ? order.sourceTracked || order.channel
    : 'Not tracked (no source was sent with this order)';
  return `<div style="margin: 16px auto 8px; max-width: 640px; padding: 14px 18px; border-radius: 8px; border-left: 6px solid ${tracked ? '#FEB907' : '#9aa0ac'}; background: ${tracked ? '#FFF4D1' : '#F1F2F5'}; font-family: Arial, sans-serif; color: #111;">
  <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #5b6170;">Order source${tracked ? ` &middot; ${escapeHtml(order.channel)}` : ''}</p>
  <p style="margin: 0; font-size: 17px; font-weight: bold; line-height: 1.35;">${escapeHtml(summary)}</p>
</div>`;
};

/** The full source block at the end of the team's copy. */
export const orderSourceDetailsHtml = (order: OrderSourceForEmail): string => {
  if (!order.channel) return '';
  const rows = orderSourceLines(order)
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 3px 12px 3px 0; color: #5b6170; white-space: nowrap; vertical-align: top; text-align: left;">${escapeHtml(label)}:</td><td style="padding: 3px 0; color: #111; text-align: left; overflow-wrap: anywhere;">${escapeHtml(value)}</td></tr>`,
    )
    .join('\n');
  return `<div style="margin: 20px auto; max-width: 640px; padding: 12px 16px; border: 1px solid #e4e6eb; border-radius: 8px; font-family: Arial, sans-serif; font-size: 13px;">
  <p style="margin: 0 0 8px; font-weight: bold; color: #111; text-align: left;">Order source details (team only)</p>
  <table style="border-collapse: collapse; width: 100%;">
${rows}
  </table>
</div>`;
};
