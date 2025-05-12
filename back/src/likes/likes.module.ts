import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';
// @ts-ignore
import { Like } from '../entities/like.entity';
// @ts-ignore
import { Image } from '../entities/image.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Like, Image])],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
