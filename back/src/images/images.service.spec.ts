import {
  Injectable, InternalServerErrorException, NotFoundException
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Image } from '../entities/image.entity';
import { CreateImageDto } from './dto/create-image.dto';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class ImagesService {
  constructor(
    @InjectRepository(Image) private imagesRepo: Repository<Image>,
  ) {}

  async create(userId: string, file: Express.Multer.File, dto: CreateImageDto) {
    try {
      const url = `${process.env.BASE_URL}/uploads/${file.filename}`;
      const image = this.imagesRepo.create({
        user: { id: userId } as any,
        title: dto.title,
        description: dto.description,
        url,
        storagePath: file.path,
      });
      return await this.imagesRepo.save(image);
    } catch {
      throw new InternalServerErrorException('Failed to save image');
    }
  }

  async findAll(page: number, limit: number) {
    const [items, total] = await this.imagesRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['user', 'likes'],
    });
    return { items, total };
  }

  async findOne(id: string) {
    const image = await this.imagesRepo.findOne({
      where: { id },
      relations: ['user', 'likes'],
    });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  async getShareLink(id: string, platform: string) {
    const image = await this.imagesRepo.findOne({ where: { id } });
    if (!image) throw new NotFoundException('Image not found');
    const encoded = encodeURIComponent(image.url);
    let url: string;
    switch (platform) {
      case 'twitter':
        url = `https://twitter.com/intent/tweet?url=${encoded}&text=${encodeURIComponent(image.title)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
        break;
      case 'line':
        url = `https://social-plugins.line.me/lineit/share?url=${encoded}`;
        break;
      default:
        throw new NotFoundException('Unsupported platform');
    }
    return { url };
  }
}
