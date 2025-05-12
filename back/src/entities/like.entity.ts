import {
    Entity, PrimaryGeneratedColumn, CreateDateColumn, 
    UpdateDateColumn, ManyToOne, JoinColumn
  } from 'typeorm';
  // @ts-ignore
  import { User } from './user.entity';
  // @ts-ignore
  import { Image } from './image.entity';
  
  @Entity('likes')
  export class Like {
    @PrimaryGeneratedColumn('uuid') id: string;
    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
    
    @ManyToOne(type => User, (user: User) => user.likes)
    @JoinColumn({ name: 'user_id' })
    user: User;
    
    @ManyToOne(type => Image, (image: Image) => image.likes)
    @JoinColumn({ name: 'image_id' })
    image: Image;
  }
  