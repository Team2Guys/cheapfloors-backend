import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppClicksResolver } from './whatsapp-clicks.resolver';
import { WhatsAppClicksService } from './whatsapp-clicks.service';

// Storefront WhatsApp click log (order source tracking, addendum B).
@Module({
  providers: [WhatsAppClicksResolver, WhatsAppClicksService],
  imports: [PrismaModule],
})
export class WhatsAppClicksModule {}
