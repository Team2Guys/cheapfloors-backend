// One-off check of the website's mail login.
// Run from the backend folder:   node scripts/test-mail.js
// Sends ONE email from the site mailbox to itself, using the same server,
// port and login as src/utils/mailer.ts.
try {
  require('dotenv').config();
} catch (error) {
  console.log('dotenv not found; using variables already set in this terminal.');
}
const nodemailer = require('nodemailer');

const host = (process.env.SMTP_HOST || 'mail.blindsandcurtains.ae').trim();
const port = Number(process.env.SMTP_PORT) || 465;
const mailbox = (process.env.EMAIL_USER || '').trim();

(async () => {
  console.log(`Server   : ${host}:${port}`);
  console.log(`Login as : ${mailbox}`);
  if (!mailbox || !process.env.EMAIL_PASS) {
    console.log('RESULT   : FAIL - EMAIL_USER / EMAIL_PASS is not set in .env (no login was attempted)');
    process.exitCode = 1;
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: mailbox, pass: process.env.EMAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    const info = await transporter.sendMail({
      from: { name: 'Cheapfloors mail test', address: mailbox },
      to: mailbox,
      subject: `Mail test ${new Date().toISOString()}`,
      text: 'If you can read this in the inbox, the website mail login works.',
    });
    console.log('RESULT   : PASS - server accepted the email');
    console.log(`Reply    : ${info.response}`);
    console.log(`Now check the inbox of ${mailbox}.`);
  } catch (error) {
    const authFailed = error.code === 'EAUTH' || error.responseCode === 535;
    console.log(`RESULT   : FAIL - ${authFailed ? 'wrong EMAIL_USER / EMAIL_PASS' : 'could not reach or use the mail server'}`);
    console.log(`Detail   : ${error.code || ''} ${error.message}`);
    if (authFailed) console.log('Do NOT run this again until the password is fixed (repeated failures block the IP).');
    process.exitCode = 1;
  }
})();
