import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export const imageFileFilter = (_req, file, cb) => {
  const allowed = ['.png', '.jpg', '.jpeg', '.gif'];
  const ext = extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(new BadRequestException('Only images allowed'), false);
  }
  cb(null, true);
};

export const editFileName = (_req, file, cb) => {
  const name = file.originalname.split('.')[0];
  const fileExt = extname(file.originalname);
  const timestamp = Date.now();
  cb(null, `${name}-${timestamp}${fileExt}`);
};
