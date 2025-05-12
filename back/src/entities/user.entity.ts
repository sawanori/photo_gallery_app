import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany
  } from 'typeorm';
  // @ts-ignore
  import { Image } from './image.entity';
  // @ts-ignore
  import { Like } from './like.entity';
  
  @Entity('users')
  export class User {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ unique: true }) email: string;
    @Column() passwordHash: string;
    @Column() role: string;
    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
    
    @OneToMany(type => Image, (image: Image) => image.user)
    images: Image[];
    
    @OneToMany(type => Like, (like: Like) => like.user)
    likes: Like[];
  }
  