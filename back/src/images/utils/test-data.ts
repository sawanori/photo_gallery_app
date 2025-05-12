import { DataSource } from 'typeorm';
import { Image } from '../../entities/image.entity';
import { User } from '../../entities/user.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// サンプル画像URL（プレースホルダー画像）
const SAMPLE_IMAGES = [
  {
    title: '山の風景',
    description: '美しい山の風景写真',
    url: 'https://picsum.photos/id/1018/1000/600',
  },
  {
    title: '海の景色',
    description: '青い海の景色',
    url: 'https://picsum.photos/id/1015/1000/600',
  },
  {
    title: '都市の夜景',
    description: '都市の美しい夜景',
    url: 'https://picsum.photos/id/1016/1000/600',
  },
  {
    title: '花のクローズアップ',
    description: '美しい花のマクロ撮影',
    url: 'https://picsum.photos/id/1021/1000/600',
  },
  {
    title: '森の小道',
    description: '静かな森の中の小道',
    url: 'https://picsum.photos/id/1023/1000/600',
  },
];

@Injectable()
export class TestDataService {
  constructor(
    @InjectRepository(Image) private imageRepository: Repository<Image>,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async seedSampleImages() {
    // 既存の画像数を確認
    const imageCount = await this.imageRepository.count();
    if (imageCount > 0) {
      console.log(`既に${imageCount}件の画像が登録されています。`);
      return;
    }

    // ユーザーを取得（存在しない場合は処理終了）
    const users = await this.userRepository.find();
    if (users.length === 0) {
      console.log('ユーザーがいません。先にユーザーを登録してください。');
      return;
    }

    // サンプル画像を登録
    for (const user of users) {
      for (const imageData of SAMPLE_IMAGES) {
        const image = new Image();
        image.title = imageData.title;
        image.description = imageData.description;
        image.url = imageData.url;
        image.storagePath = 'sample/path'; // 実際のパスは使用しない
        image.user = user;
        
        await this.imageRepository.save(image);
        console.log(`画像「${image.title}」をユーザー「${user.email}」で登録しました。`);
      }
    }

    console.log('サンプル画像の登録が完了しました。');
  }
} 