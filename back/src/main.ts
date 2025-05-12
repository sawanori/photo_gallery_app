// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SwaggerModule } from '@nestjs/swagger';
import * as YAML from 'yamljs';
import * as os from 'os';

import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('🚀 サーバー起動中...');
    
    // ネットワークインターフェースの情報を表示
    const networkInterfaces = os.networkInterfaces();
    console.log('📡 利用可能なネットワークインターフェース:');
    Object.keys(networkInterfaces).forEach((interfaceName) => {
      const interfaces = networkInterfaces[interfaceName];
      interfaces?.forEach((iface) => {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  - ${interfaceName}: ${iface.address}`);
        }
      });
    });
    
    // NestExpressApplication で起動
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    // CORSの設定を詳細に指定
    app.enableCors({
      origin: ['http://localhost:3001', 'exp://*', 'http://*', 'https://*'],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
      maxAge: 3600
    });

    // 静的ファイル
    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    app.useStaticAssets(join(__dirname, '..', 'downloads'), { prefix: '/downloads' });

    // Swagger
    const swaggerPath = join(__dirname, '../src/swagger.yaml');
    const swaggerDoc = YAML.load(swaggerPath);
    SwaggerModule.setup('api-docs', app, swaggerDoc);

    // —— ここからルート一覧取得ロジック —— 
    // Express アプリケーション本体を取得
    const expressApp = app.getHttpAdapter().getInstance() as any;

    if (expressApp._router && expressApp._router.stack) {
      const routes = expressApp._router.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => {
          const methods = Object.keys(layer.route.methods)
            .map(m => m.toUpperCase())
            .join(',');
          return `${methods} ${layer.route.path}`;
        });
      console.log('📚 Registered routes:\n' + routes.join('\n'));
    } else {
      console.warn('📚 Registered routes: ルーター情報が取得できませんでした');
    }
    // —— ここまで —— 

    // サーバ起動
    const port = 3000;
    const host = '0.0.0.0';  // すべてのインターフェースでリッスン
    
    // サーバー起動前に設定を確認
    console.log(`🔧 サーバー設定: host=${host}, port=${port}`);
    
    await app.listen(port, host);
    console.log(`🚀 Back-end listening on http://${host}:${port}`);
    console.log(`📖 Swagger docs at http://localhost:${port}/api-docs`);
    console.log('✅ サーバー起動完了');
  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
}

bootstrap();
