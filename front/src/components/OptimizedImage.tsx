import React, { useState, useEffect, memo } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';

interface OptimizedImageProps {
  source: { uri: string };
  style?: any;
  onLoad?: () => void;
  onError?: () => void;
  placeholder?: boolean;
}

export const OptimizedImage = memo<OptimizedImageProps>(({ 
  source, 
  style, 
  onLoad, 
  onError,
  placeholder = true 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [source.uri]);

  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
    onError?.();
  };

  return (
    <View style={[styles.container, style]}>
      {loading && placeholder && (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      )}
      {error ? (
        <View style={[StyleSheet.absoluteFill, styles.errorContainer]}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.errorIcon}
            resizeMode="contain"
          />
        </View>
      ) : (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, style]}
          onLoad={handleLoad}
          onError={handleError}
          resizeMode="cover"
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorIcon: {
    width: 40,
    height: 40,
    opacity: 0.3,
  },
});