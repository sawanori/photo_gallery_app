import {
    Controller, Post, UseGuards, UseInterceptors,
    UploadedFile, Body, Req, Get, Param, Query
  } from '@nestjs/common';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { diskStorage } from 'multer';
  import { ImagesService } from './images.service';
  import { CreateImageDto } from './dto/create-image.dto';
  import { imageFileFilter, editFileName } from './utils/image-upload.util';
  
  @Controller('images')
  export class ImagesController {
    constructor(private imagesService: ImagesService) {}
  
    @UseGuards(JwtAuthGuard)
    @Post()
    @UseInterceptors(FileInterceptor('file', {
      storage: diskStorage({ destination: './uploads', filename: editFileName }),
      fileFilter: imageFileFilter,
    }))
    upload(
      @UploadedFile() file: Express.Multer.File,
      @Body() dto: CreateImageDto,
      @Req() req
    ) {
      return this.imagesService.create(req.user.userId, file, dto);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get()
    getAll(@Query('page') page = '1', @Query('limit') limit = '20') {
      return this.imagesService.findAll(+page, +limit);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get(':id')
    getOne(@Param('id') id: string) {
      return this.imagesService.findOne(id);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get(':id/share')
    share(
      @Param('id') id: string,
      @Query('platform') platform: string
    ) {
      return this.imagesService.getShareLink(id, platform);
    }
  
    // テストデータ作成エンドポイント（開発環境でのみ使用）
    @Get('seed/test-data')
    async seedTestData() {
      if (process.env.NODE_ENV === 'production') {
        return { message: '本番環境では使用できません' };
      }
      return this.imagesService.seedTestData();
    }
  }
  