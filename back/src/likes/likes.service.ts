import {
    Injectable, ConflictException, NotFoundException, InternalServerErrorException
  } from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Repository } from 'typeorm';
  import { Like } from '../entities/like.entity';
  import { Image } from '../entities/image.entity';
  import * as fs from 'fs';
  import * as archiver from 'archiver';
  import { join } from 'path';
  
  @Injectable()
  export class LikesService {
    constructor(
      @InjectRepository(Like) private likesRepo: Repository<Like>,
      @InjectRepository(Image) private imagesRepo: Repository<Image>,
    ) {}
  
    async likeImage(userId: string, imageId: string) {
      const image = await this.imagesRepo.findOne({ where: { id: imageId } });
      if (!image) throw new NotFoundException('Image not found');
      const exists = await this.likesRepo.findOne({
        where: { user: { id: userId } as any, image: { id: imageId } as any },
      });
      if (exists) throw new ConflictException('Already liked');
      const like = this.likesRepo.create({ user: { id: userId } as any, image: { id: imageId } as any });
      return this.likesRepo.save(like);
    }
  
    async unlikeImage(userId: string, imageId: string) {
      const res = await this.likesRepo.delete({
        user: { id: userId } as any,
        image: { id: imageId } as any,
      });
      if (res.affected === 0) throw new NotFoundException('Like not found');
    }
  
    async getUserLikes(userId: string) {
      const likes = await this.likesRepo.find({
        where: { user: { id: userId } as any },
        relations: ['image'],
        order: { createdAt: 'DESC' },
      });
      return likes.map(l => l.image);
    }
  
    async generateDownloadLink(userId: string) {
      // ZIP 作成ロジック
      const likes = await this.likesRepo.find({ where: { user: { id: userId } as any }, relations: ['image'] });
      if (!likes.length) throw new NotFoundException('No likes');
      const zipName = `likes-${userId}-${Date.now()}.zip`;
      const zipPath = join('downloads', zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(output);
      for (const like of likes) {
        archive.file(like.image.storagePath, { name: like.image.storagePath.split('/').pop() || 'image.jpg' });
      }
      await archive.finalize();
      await new Promise<void>((res, rej) => {
        output.on('close', () => res());
        archive.on('error', e => rej(new InternalServerErrorException(e)));
      });
      return { url: `${process.env.BASE_URL}/downloads/${zipName}` };
    }
  
    async getLikedImageUrls(userId: string) {
      const likes = await this.likesRepo.find({ where: { user: { id: userId } as any }, relations: ['image'] });
      return likes.map(l => l.image.url);
    }
  }
  