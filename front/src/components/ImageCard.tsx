import React, { memo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { theme } from '../styles';

interface ImageCardProps {
  image: Image;
  onPress: () => void;
  onLikePress: () => void;
  style?: ViewStyle;
}

export const ImageCard = memo<ImageCardProps>(({ 
  image, 
  onPress, 
  onLikePress, 
  style 
}) => {
  const aspectRatio = (image.width && image.height) ? image.width / image.height : 1;

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={[styles.container, style]}
      activeOpacity={0.95}
    >
      <View style={[styles.imageContainer, { aspectRatio }]}>
        <OptimizedImage source={{ uri: image.url }} style={styles.image} />
        <View style={styles.overlay}>
          <Pressable
            style={({ pressed }) => [
              styles.likeButton,
              pressed && styles.likeButtonPressed
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onLikePress();
            }}
          >
            <Ionicons
              name={image.isLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={image.isLiked ? theme.colors.error : theme.colors.text.inverse}
            />
          </Pressable>
        </View>
      </View>
      {image.title && (
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {image.title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: theme.colors.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: theme.spacing.sm,
  },
  likeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeButtonPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    transform: [{ scale: 0.95 }],
  },
  titleContainer: {
    padding: theme.spacing.sm,
  },
  title: {
    ...theme.typography.caption,
    color: theme.colors.text.primary,
    fontWeight: '500',
    lineHeight: 18,
  },
});