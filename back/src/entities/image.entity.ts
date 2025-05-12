import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
    ManyToOne, OneToMany
  } from 'typeorm';
  // @ts-ignore
  import { User } from './user.entity';
  // @ts-ignore
  import { Like } from './like.entity';
  
  @Entity('images')
  export class Image {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column() url: string;
    @Column() storagePath: string;
    @Column() title: string;
    @Column({ nullable: true }) description: string;
    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
    @ManyToOne(type => User, (user: User) => user.images) user: User;
    @OneToMany(type => Like, (like: Like) => like.image) likes: Like[];
  }
  