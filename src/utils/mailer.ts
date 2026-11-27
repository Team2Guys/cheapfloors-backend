// Single shared SMTP connection for the whole backend.
//
// Every email (orders, appointments, callbacks, B2B quotes, contact form) goes
// through this file, so the mailbox login lives in one place:
//   EMAIL_USER  mailbox the backend logs in with and sends from
//   EMAIL_PASS  password of that mailbox
//   SMTP_HOST   optional, defaults to mail.blindsandcurtains.ae
//   SMTP_PORT   optional, defaults to 465 (587 is blocked on the office network)
//
// The hosting firewall blocks an IP after repeated failed SMTP logins. To stop
// one wrong password from blocking the office IP, a rejected login pauses all
// sending for AUTH_COOLDOWN_MS instead of retrying on every request.
import nodemailer from 'nodemailer';

export const AUTH_COOLDOWN_MS = 30 * 60 * 1000;

type MailSender = { sendMail: (mail: any) => Promise<any> };

let smtp: MailSender | null = null;
let authBlockedUntil = 0;

const smtpHost = () =>
  (process.env.SMTP_HOST || 'mail.blindsandcurtains.ae').trim();
const smtpPort = () => Number(process.env.SMTP_PORT) || 465;

// Created on first use, so the environment is fully loaded by then.
const getSmtp = (): MailSender => {
  if (smtp) return smtp;
  const port = smtpPort();
  const created: MailSender = nodemailer.createTransport({
    host: smtpHost(),
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  smtp = created;
  return created;
};

const isAuthError = (error: any): boolean =>
  Boolean(error) &&
  (error.code === 'EAUTH' ||
    error.responseCode === 535 ||
    error.responseCode === 534);

const sendMail = async (mail: any): Promise<any> => {
  if (Date.now() < authBlockedUntil) {
    const minutes = Math.ceil((authBlockedUntil - Date.now()) / 60000);
    throw new Error(
      `[mail] SMTP login for ${process.env.EMAIL_USER} was rejected earlier; sending is paused for ${minutes} more minute(s). Fix EMAIL_PASS and restart the server.`,
    );
  }

  try {
    return await getSmtp().sendMail(mail);
  } catch (error) {
    if (isAuthError(error)) {
      authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
      console.error(
        `[mail] SMTP login FAILED for ${process.env.EMAIL_USER} on ${smtpHost()}:${smtpPort()}. Sending is paused for ${AUTH_COOLDOWN_MS / 60000} minutes so the firewall does not block this IP. Check EMAIL_USER / EMAIL_PASS.`,
      );
    }
    throw error;
  }
};

export const transporter = { sendMail };

// Internal team inboxes for notifications. Unset ORDER_MAILn slots are
// skipped so a missing variable can't inject a literal "undefined" recipient.
export const teamRecipients = (): string =>
  [
    process.env.EMAIL_USER,
    process.env.ORDER_MAIL1,
    process.env.ORDER_MAIL2,
    process.env.ORDER_MAIL3,
  ]
    .filter(Boolean)
    .join(',');
