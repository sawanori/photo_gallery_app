import { Controller, Post, Delete, Get, Param, UseGuards, Req, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LikesService } from './likes.service';

@Controller()
export class LikesController {
  constructor(private likesService: LikesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('images/:id/likes')
  likeImage(@Param('id') id: string, @Req() req) {
    return this.likesService.likeImage(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete('images/:id/likes')
  unlikeImage(@Param('id') id: string, @Req() req) {
    return this.likesService.unlikeImage(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/likes')
  getUserLikes(@Req() req) {
    return this.likesService.getUserLikes(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/likes/download')
  downloadLikes(@Req() req) {
    return this.likesService.generateDownloadLink(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me/likes/urls')
  getLikedUrls(@Req() req) {
    return this.likesService.getLikedImageUrls(req.user.userId);
  }
}
