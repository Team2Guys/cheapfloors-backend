import { Injectable } from '@nestjs/common';
import { CreateBlogInput } from './dto/create-blog.input';
import { UpdateBlogInput } from './dto/update-blog.input';
import { customHttpException } from '../utils/helper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlogsService {
  constructor(private prisma: PrismaService) {}

  async create(createBlogInput: CreateBlogInput) {
    try {
      const { custom_url } = createBlogInput;

      const alreadyExistedBlog = await this.prisma.blogs.findFirst({
        where: { custom_url },
      });

      if (alreadyExistedBlog)
        return customHttpException(
          'Blog with this custom url already exists',
          'BAD_REQUEST',
        );

      const response = await this.prisma.blogs.create({
        data: { ...createBlogInput, last_editedBy: 'Admin' },
      });
      return response;
    } catch (error) {
      return customHttpException(
        `${error.message || JSON.stringify(error)}`,
        'INTERNAL_SERVER_ERROR',
      );
    }
  }

  async findAll() {
    try {
      return await this.prisma.blogs.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      customHttpException(error, 'INTERNAL_SERVER_ERROR');
    }
  }

  async findOne(customUrl: string) {
    try {
      return await this.prisma.blogs.findFirst({
        where: { custom_url: customUrl },
      });
    } catch (error) {
      customHttpException(error, 'INTERNAL_SERVER_ERROR');
    }
  }

  async update(id: number, updateBlogInput: UpdateBlogInput) {
    try {
      const blog = await this.prisma.blogs.findUnique({
        where: { id: id },
      });

      if (!blog) return customHttpException('Blog not found', 'NOT_FOUND');

      const { id: _, ...updateData } = updateBlogInput;

      const updatedBlog = await this.prisma.blogs.update({
        where: { id: id },
        data: {
          ...updateData,
          last_editedBy: 'Admin',
          updatedAt: new Date(),
        },
      });

      return updatedBlog;
    } catch (error) {
      return customHttpException(
        `${error.message || JSON.stringify(error)}`,
        'INTERNAL_SERVER_ERROR',
      );
    }
  }

  async remove(id: number) {
    try {
      const blog = await this.prisma.blogs.findUnique({
        where: { id: id },
      });

      if (!blog) return customHttpException('Blog not found', 'NOT_FOUND');

      const response = await this.prisma.blogs.delete({
        where: { id: id },
      });
      return response;
    } catch (error) {
      return customHttpException(
        `${error.message || JSON.stringify(error)}`,
        'INTERNAL_SERVER_ERROR',
      );
    }
  }
}
