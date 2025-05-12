import { IsString, IsOptional } from 'class-validator';

export class CreateImageDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
}
