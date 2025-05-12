import {
    Injectable, InternalServerErrorException, NotFoundException
  } from '@nestjs/common';
  import { Repository } from 'typeorm';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Image } from '../entities/image.entity';
  import { CreateImageDto } from './dto/create-image.dto';
  import { TestDataService } from './utils/test-data';
  import * as fs from 'fs';
  import { join } from 'path';
  
  @Injectable()
  export class ImagesService {
    constructor(
      @InjectRepository(Image) private imagesRepo: Repository<Image>,
      private testDataService: TestDataService,
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
        relations: ['user', 'likes', 'likes.user'],
      });
      return { items, total };
    }
  
    async findOne(id: string) {
      const image = await this.imagesRepo.findOne({
        where: { id },
        relations: ['user', 'likes', 'likes.user'],
      });
      if (!image) throw new NotFoundException('Image not found');
      return image;
    }
  
    async getShareLink(id: string, platform: string) {
      // 単純化した実装 - 実際のアプリではプラットフォーム固有のシェアリンク生成が必要
      const shareBaseUrl = process.env.FRONTEND_URL || 'http://localhost:19006';
      const shareUrl = `${shareBaseUrl}/share?id=${id}&platform=${platform}`;
      return { url: shareUrl };
    }
  
    // テスト用の画像データを生成
    async seedTestData() {
      try {
        await this.testDataService.seedSampleImages();
        return { success: true, message: 'テスト用の画像データを生成しました' };
      } catch (error) {
        console.error('テストデータ生成エラー:', error);
        throw new InternalServerErrorException('テストデータの生成に失敗しました');
      }
    }
  }
  