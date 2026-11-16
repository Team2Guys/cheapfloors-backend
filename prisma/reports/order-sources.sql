-- Order source reports (order source tracking spec, section 6 and addendum A),
-- written for the real table: Prisma model "salesProducts", camelCase columns,
-- totalPrice in whole AED, paymentStatus a boolean. Read-only.
-- $1 / $2: the period, e.g. '2026-11-01' and '2026-12-01'.

-- 1. Paid orders by last and first touch (who closed it, who found it).
--    Free samples and cancelled orders are left out, as on the dashboard.
--    Orders placed before tracking began show as Unknown.
SELECT
  COALESCE("lastTouchChannel", 'Unknown')  AS last_touch,
  COALESCE("firstTouchChannel", 'Unknown') AS first_touch,
  COUNT(*)                                 AS orders,
  SUM("totalPrice")                        AS revenue_aed
FROM "salesProducts"
WHERE "paymentStatus" = true
  AND COALESCE("isfreesample", false) = false
  AND "orderStatus" <> 'cancel'
  AND "checkoutDate" >= $1 AND "checkoutDate" < $2
GROUP BY 1, 2
ORDER BY revenue_aed DESC;

-- 2. Checkouts by channel: paid, failed at CCAvenue, or abandoned.
--    Every press of Pay creates an order row, so a customer who retried counts
--    once per attempt here (the dashboard's Abandoned page groups them).
--    failed    = CCAvenue reported Failure / Aborted / Invalid (gatewayStatus)
--    abandoned = never came back from the gateway, after 2 hours
SELECT
  COALESCE("channel", 'Unknown') AS channel,
  COUNT(*) AS attempts,
  COUNT(*) FILTER (WHERE "paymentStatus") AS paid,
  COUNT(*) FILTER (WHERE NOT "paymentStatus" AND "gatewayStatus" IS NOT NULL AND "gatewayStatus" <> 'Success') AS failed,
  COUNT(*) FILTER (WHERE NOT "paymentStatus" AND "gatewayStatus" IS NULL AND "checkoutDate" < now() - interval '2 hours') AS abandoned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE "paymentStatus") / COUNT(*), 1) AS pay_rate,
  SUM("totalPrice") FILTER (WHERE NOT "paymentStatus") AS lost_value_aed
FROM "salesProducts"
WHERE COALESCE("isfreesample", false) = false
  AND "checkoutDate" >= $1 AND "checkoutDate" < $2
GROUP BY 1
ORDER BY lost_value_aed DESC NULLS LAST;

-- 3. WhatsApp button clicks by channel (addendum B).
SELECT "channel", COUNT(*) AS clicks
FROM "WhatsAppClick"
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY 1
ORDER BY clicks DESC;
