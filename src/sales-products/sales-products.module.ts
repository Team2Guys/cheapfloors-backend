import { Module } from '@nestjs/common';
import { SalesProductsService } from './sales-products.service';
import { SalesProductsResolver } from './sales-products.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { CCAvenueService } from './ccavenue.service';
import { CCAvenueController } from './ccavenue.controller';

@Module({
  providers: [SalesProductsResolver, SalesProductsService, CCAvenueService],
  controllers: [CCAvenueController],
  imports: [PrismaModule],
})
export class SalesProductsModule {}
