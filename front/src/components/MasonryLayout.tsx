import React, { useMemo, useState, useCallback } from 'react';
import { ScrollView, View, RefreshControl, ActivityIndicator, StyleSheet, Dimensions, Platform } from 'react-native';
import { Image } from '../types';
import { theme } from '../styles';

const { width: screenWidth } = Dimensions.get('window');

interface MasonryLayoutProps {
  data: Image[];
  renderItem: (item: Image, index: number) => React.ReactElement;
  numColumns?: number;
  spacing?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  ListFooterComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  contentContainerStyle?: any;
}

export const MasonryLayout: React.FC<MasonryLayoutProps> = ({
  data,
  renderItem,
  numColumns = 2,
  spacing = 6,
  onEndReached,
  onEndReachedThreshold = 0.2,
  refreshing = false,
  onRefresh,
  ListFooterComponent,
  ListEmptyComponent,
  contentContainerStyle,
}) => {
  const [isNearEnd, setIsNearEnd] = useState(false);

  // Distribute items into columns
  const columns = useMemo(() => {
    const cols: Image[][] = Array.from({ length: numColumns }, () => []);
    const columnHeights = new Array(numColumns).fill(0);

    data.forEach((item) => {
      // Find the shortest column
      const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
      cols[shortestColumnIndex].push(item);
      
      // Update column height (estimate based on aspect ratio)
      const aspectRatio = (item.width && item.height) ? item.width / item.height : 1;
      const estimatedHeight = 200 / aspectRatio + 50; // image height + title
      columnHeights[shortestColumnIndex] += estimatedHeight;
    });

    return cols;
  }, [data, numColumns]);

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const threshold = contentSize.height * onEndReachedThreshold;
    
    if (paddingToBottom < threshold && !isNearEnd) {
      setIsNearEnd(true);
      onEndReached?.();
    } else if (paddingToBottom > threshold && isNearEnd) {
      setIsNearEnd(false);
    }
  }, [isNearEnd, onEndReached, onEndReachedThreshold]);

  if (data.length === 0 && ListEmptyComponent) {
    return (
      <View style={[styles.container, contentContainerStyle]}>
        {ListEmptyComponent}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}
      contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={
        onRefresh && Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View style={[
        styles.columnsContainer,
        { marginHorizontal: -spacing / 2 },
        Platform.OS === 'web' && styles.columnsContainerWeb
      ]}>
        {columns.map((column, columnIndex) => (
          <View
            key={columnIndex}
            style={[
              styles.column,
              {
                paddingHorizontal: spacing / 2,
              },
              Platform.OS === 'web'
                ? { width: `${100 / numColumns}%`, flexShrink: 0 } as any
                : { flex: 1 }
            ]}
          >
            {column.map((item, itemIndex) => (
              <View key={item.id} style={styles.itemContainer}>
                {renderItem(item, columnIndex * data.length + itemIndex)}
              </View>
            ))}
          </View>
        ))}
      </View>
      {ListFooterComponent}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerWeb: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  } as any,
  contentContainer: {
    flexGrow: 1,
  },
  columnsContainer: {
    flexDirection: 'row',
    paddingTop: 8,
  },
  columnsContainerWeb: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  } as any,
  column: {
    flex: 1,
  },
  itemContainer: {
    marginBottom: 12,
  },
});