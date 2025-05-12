// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// 機能モジュールのインポート
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ImagesModule } from './images/images.module';
import { LikesModule } from './likes/likes.module';
import { HealthModule } from './health/health.module';

// エンティティのインポート
import { User } from './entities/user.entity';
import { Image } from './entities/image.entity';
import { Like } from './entities/like.entity';

@Module({
  imports: [
    // 環境変数読み込み（グローバル）
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM の非同期設定
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'dev',
      password: process.env.DB_PASS || 'password',
      database: process.env.DB_NAME || 'photo_gallery',
      entities: [User, Image, Like],
      synchronize: true,    // 開発時のみ有効
      logging: true,        // SQL ログを出力
    }),

    // エンティティリポジトリ登録
    TypeOrmModule.forFeature([User, Image, Like]),

    // アプリ各機能モジュール
    AuthModule,   // 認証
    UsersModule,  // ユーザー管理
    ImagesModule, // 画像CRUD機能
    LikesModule,  // いいね機能
    HealthModule,
  ],
})
export class AppModule {}
