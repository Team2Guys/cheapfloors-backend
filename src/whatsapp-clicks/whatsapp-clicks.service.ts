import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The ref a storefront WhatsApp button adds to its message,
 * "<source code>|<page code>", e.g. "GADS-spc-flooring-dubai|spc-flooring/herringbone"
 * (cheapfloor-frontend src/lib/cf-whatsapp.ts). Nothing else is accepted, so
 * the log can never hold personal data or markup.
 */
export const WA_REF = /^[A-Za-z0-9-]{1,48}\|[A-Za-z0-9/-]{1,48}$/;

/** "GADS-spc-flooring-dubai|spc-flooring" -> { channel: "GADS", page: "spc-flooring" } */
export const parseWaRef = (ref: string) => {
  const [code, page] = ref.split('|');
  return { channel: code.split('-')[0].toUpperCase(), page };
};

@Injectable()
export class WhatsAppClicksService {
  constructor(private prisma: PrismaService) {}

  async log(ref: string): Promise<boolean> {
    const value = typeof ref === 'string' ? ref.trim() : '';
    if (!WA_REF.test(value)) {
      throw new BadRequestException('Invalid WhatsApp ref');
    }
    const { channel, page } = parseWaRef(value);
    await this.prisma.whatsAppClick.create({
      data: { ref: value, channel, page },
    });
    return true;
  }
}
