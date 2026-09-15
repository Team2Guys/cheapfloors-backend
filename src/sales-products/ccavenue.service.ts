import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

// CCAvenue's documented fixed IV: bytes 0x00 through 0x0f, in order. Confirmed
// against CCAvenue's own crypto.php sample (initVector = pack("C*", 0x00..0x0f)).
const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

@Injectable()
export class CCAvenueService {
  private getKey(): Buffer {
    return crypto
      .createHash('md5')
      .update(process.env.CCAVENUE_WORKING_KEY || '')
      .digest();
  }

  encrypt(plainText: string): string {
    const cipher = crypto.createCipheriv('aes-128-cbc', this.getKey(), IV);
    return cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex');
  }

  decrypt(encText: string): string {
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.getKey(), IV);
    return decipher.update(encText, 'hex', 'utf8') + decipher.final('utf8');
  }

  buildRequestParams(params: Record<string, string | number | undefined>): string {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  parseResponseParams(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of raw.split('&')) {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) continue;
      result[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
    }
    return result;
  }
}
