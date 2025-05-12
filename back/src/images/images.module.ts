import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
// @ts-ignore
import { Image } from '../entities/image.entity';
import { User } from '../entities/user.entity';
import { TestDataService } from './utils/test-data';

@Module({
  imports: [TypeOrmModule.forFeature([Image, User])],
  controllers: [ImagesController],
  providers: [ImagesService, TestDataService],
})
export class ImagesModule {}
