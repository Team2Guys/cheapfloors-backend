// The shared mailer with nodemailer replaced, to check that a rejected login
// stops further login attempts instead of retrying on every email.
const smtpSend = jest.fn();
jest.mock('nodemailer', () => {
  const transport = { createTransport: () => ({ sendMail: smtpSend }) };
  return { __esModule: true, default: transport, ...transport };
});

const authError = () => Object.assign(new Error('535 Incorrect authentication data'), { code: 'EAUTH' });

describe('shared mailer: pause after a rejected SMTP login', () => {
  let transporter: { sendMail: (mail: any) => Promise<any> };
  let cooldown: number;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    smtpSend.mockReset();
    ({ transporter, AUTH_COOLDOWN_MS: cooldown } = require('./mailer'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sends normally while the login is accepted', async () => {
    smtpSend.mockResolvedValue({ response: '250 OK' });

    await transporter.sendMail({ to: 'a@example.com' });
    await transporter.sendMail({ to: 'b@example.com' });

    expect(smtpSend).toHaveBeenCalledTimes(2);
  });

  it('makes one login attempt, then refuses to try again during the pause', async () => {
    smtpSend.mockRejectedValue(authError());

    await expect(transporter.sendMail({})).rejects.toThrow('535');
    await expect(transporter.sendMail({})).rejects.toThrow('sending is paused');
    await expect(transporter.sendMail({})).rejects.toThrow('sending is paused');

    expect(smtpSend).toHaveBeenCalledTimes(1);
  });

  it('tries again once the pause is over', async () => {
    smtpSend.mockRejectedValueOnce(authError());
    await expect(transporter.sendMail({})).rejects.toThrow('535');

    jest.advanceTimersByTime(cooldown + 1000);
    smtpSend.mockResolvedValue({ response: '250 OK' });

    await expect(transporter.sendMail({})).resolves.toEqual({ response: '250 OK' });
    expect(smtpSend).toHaveBeenCalledTimes(2);
  });

  it('does not pause for errors that are not a rejected login', async () => {
    smtpSend.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));

    await expect(transporter.sendMail({})).rejects.toThrow('timeout');
    await expect(transporter.sendMail({})).rejects.toThrow('timeout');

    expect(smtpSend).toHaveBeenCalledTimes(2);
  });
});
