import { BadRequestException } from '@nestjs/common';
import { WhatsAppClicksService, parseWaRef } from './whatsapp-clicks.service';

describe('WhatsAppClicksService', () => {
  let prisma: any;
  let service: WhatsAppClicksService;

  beforeEach(() => {
    prisma = { whatsAppClick: { create: jest.fn().mockResolvedValue({}) } };
    service = new WhatsAppClicksService(prisma);
  });

  it('stores a valid ref with its channel and page', async () => {
    await expect(
      service.log('GADS-spc-flooring-dubai|spc-flooring/herringbone'),
    ).resolves.toBe(true);
    expect(prisma.whatsAppClick.create).toHaveBeenCalledWith({
      data: {
        ref: 'GADS-spc-flooring-dubai|spc-flooring/herringbone',
        channel: 'GADS',
        page: 'spc-flooring/herringbone',
      },
    });
  });

  it.each([
    ['DIRECT|home', 'DIRECT', 'home'],
    ['ORG-google|collections', 'ORG', 'collections'],
    ['INSTAGRAM-ORGANIC|blogs/spc-vs-lvt', 'INSTAGRAM', 'blogs/spc-vs-lvt'],
  ])('%s -> %s / %s', (ref, channel, page) => {
    expect(parseWaRef(ref)).toEqual({ channel, page });
  });

  it.each([
    [''],
    ['no-separator'],
    ['GADS|<script>'],
    ['GADS|home|extra'],
    ['John Smith +971501234567|home'],
    [`${'A'.repeat(60)}|home`],
  ])('rejects %p and stores nothing', async (ref) => {
    await expect(service.log(ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.whatsAppClick.create).not.toHaveBeenCalled();
  });
});
