import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsResolver } from './blogs.resolver';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  providers: [BlogsResolver, BlogsService],
  imports: [PrismaModule],
})
export class BlogsModule {}
