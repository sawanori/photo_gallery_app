import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { theme } from '../styles';

const CARD_SPACING = 6;

interface PinterestCardProps {
  image: Image;
  onPress: () => void;
  onLikePress: () => void;
  onSavePress?: () => void;
  style?: ViewStyle;
}

export const PinterestCard = memo<PinterestCardProps>(({
  image,
  onPress,
  onLikePress,
  onSavePress,
  style
}) => {
  const aspectRatio = (image.width && image.height) ? image.width / image.height : 1;
  // Use paddingBottom trick for responsive aspect ratio on Web
  const paddingBottomPercent = (1 / aspectRatio) * 100;
  // Clamp between reasonable values
  const clampedPadding = Math.min(Math.max(paddingBottomPercent, 60), 200);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        style
      ]}
    >
      <View style={styles.imageWrapper}>
        {Platform.OS === 'web' ? (
          <View style={{ paddingBottom: `${clampedPadding}%`, position: 'relative' }}>
            <OptimizedImage
              source={{ uri: image.url }}
              style={[styles.image, styles.imageWeb] as any}
            />
          </View>
        ) : (
          <OptimizedImage
            source={{ uri: image.url }}
            style={[styles.image, { aspectRatio }]}
          />
        )}
        
        {/* Gradient overlay for better text/icon visibility */}
        <View style={styles.gradientOverlay} />
        
        {/* Action buttons */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onLikePress();
            }}
          >
            <Ionicons
              name={image.isLiked ? 'heart' : 'heart-outline'}
              size={22}
              color={image.isLiked ? '#E60023' : theme.colors.text.inverse}
            />
          </Pressable>
          
          {onSavePress && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.actionButtonPressed
              ]}
              onPress={(e) => {
                e.stopPropagation();
                onSavePress();
              }}
            >
              <Ionicons
                name="bookmark-outline"
                size={20}
                color={theme.colors.text.inverse}
              />
            </Pressable>
          )}
        </View>
      </View>
      
      {image.title && (
        <View style={styles.contentContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {image.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    backgroundColor: theme.colors.surface,
  },
  imageWeb: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  } as any,
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  actionsContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    transform: [{ scale: 0.9 }],
  },
  contentContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    ...theme.typography.caption,
    color: theme.colors.text.primary,
    fontWeight: '600',
    lineHeight: 18,
  },
});