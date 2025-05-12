import React, { useEffect, useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, Text, Button, ActivityIndicator, StyleSheet, Alert, Modal, TouchableWithoutFeedback, Share, Clipboard } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { StackNavigationProp } from '@react-navigation/stack';
import { BACKEND_URL } from '@env';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import MasonryList from '@react-native-seoul/masonry-list';
import { MaterialIcons, FontAwesome, FontAwesome5 } from '@expo/vector-icons';

type RootStackParamList = {
  Login: undefined;
  Images: undefined;
  Liked: undefined;
};

type ImagesScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Images'>;
};

// 画像アイテムの型定義
interface ImageItem {
  id: string;
  url: string;
  title: string;
  likes: Array<{user: {id: string}}>;
  width?: number;
  height?: number;
}

// 画像サイズを取得する関数
const getImageSize = async (url: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      url,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
};

// スケルトンローディング用のコンポーネント
const SkeletonImage = () => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonImage} />
    <View style={styles.skeletonTitle} />
  </View>
);

// 遅延読み込み用の画像コンポーネント
const LazyImage = ({ uri, style }: { uri: string; style: any }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <View style={style}>
      <Image
        source={{ uri }}
        style={[style, { opacity: isLoading ? 0 : 1 }]}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => setError(true)}
        resizeMode="cover"
      />
      {isLoading && !error && (
        <View style={[style, styles.loadingOverlay]}>
          <ActivityIndicator size="small" color="#0000ff" />
        </View>
      )}
      {error && (
        <View style={[style, styles.errorOverlay]}>
          <Text style={styles.errorText}>画像の読み込みに失敗しました</Text>
        </View>
      )}
    </View>
  );
};

export default function ImagesScreen({ navigation }: ImagesScreenProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [userId, setUserId] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);

  // リトライ回数の制限
  const MAX_RETRIES = 3;

  // ユーザー情報を取得
  const fetchUserInfo = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        Alert.alert('エラー', 'ログインセッションが切れています');
        navigation.navigate('Login' as any);
        return false; // 失敗
      }
      
      const res = await axios.get(`${BACKEND_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data && res.data.id) {
        setUserId(res.data.id);
        console.log('ユーザーID取得成功:', res.data.id);
        return true; // 成功
      } else {
        console.error('ユーザー情報の形式が不正:', res.data);
        return false; // 失敗
      }
    } catch (e) {
      console.error('ユーザー情報取得エラー:', e);
      return false; // 失敗
    }
  };

  // 画像一覧を取得
  const fetchImages = async (retry = false) => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        Alert.alert('エラー', 'ログインセッションが切れています');
        navigation.navigate('Login' as any);
        return;
      }
      console.log(`画像取得: ${BACKEND_URL}/images?page=${page}&limit=20`);
      const res = await axios.get(`${BACKEND_URL}/images?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('画像取得結果:', JSON.stringify(res.data));
      let imageItems = [];
      let totalCount = 0;
      if (res.data) {
        if (Array.isArray(res.data)) {
          imageItems = res.data;
        } else if (res.data.items && Array.isArray(res.data.items)) {
          imageItems = res.data.items;
          totalCount = res.data.total || 0;
        }
      }
      // 画像サイズを取得して追加
      imageItems = await Promise.all(imageItems.map(async (item: any) => {
        try {
          const { width, height } = await getImageSize(item.url);
          return {
            id: item.id || Math.random().toString(),
            url: item.url || 'https://via.placeholder.com/400',
            title: item.title || 'タイトルなし',
            description: item.description || '',
            likes: Array.isArray(item.likes) ? item.likes : [],
            width,
            height
          };
        } catch (e) {
          console.error('画像サイズ取得エラー:', e);
          return {
            id: item.id || Math.random().toString(),
            url: item.url || 'https://via.placeholder.com/400',
            title: item.title || 'タイトルなし',
            description: item.description || '',
            likes: Array.isArray(item.likes) ? item.likes : [],
            width: 400,
            height: 400
          };
        }
      }));
      if (page === 1) {
        setImages(imageItems);
      } else {
        setImages(prev => [...prev, ...imageItems]);
      }
      if (totalCount) setTotal(totalCount);
      if (imageItems.length === 0 && page > 1) {
        return;
      }
      // リトライ成功時はカウントをリセット
      if (retry) {
        setRetryCount(0);
      }
    } catch (e: any) {
      console.error('画像取得エラー:', e.response?.data || e.message);
      setError('画像の読み込みに失敗しました');
      // リトライ可能な場合
      if (retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          fetchImages(true);
        }, 1000 * retryCount); // 指数バックオフ
      }
    } finally {
      setLoading(false);
    }
  };

  // 初回レンダリング時とページ変更時に画像一覧を取得
  useEffect(() => {
    const loadData = async () => {
      try {
        setInitialLoading(true);
        // まずユーザー情報を取得
        await fetchUserInfo();
      } catch (e) {
        console.error('データ読み込みエラー:', e);
        setError('データの読み込みに失敗しました');
      } finally {
        setInitialLoading(false);
      }
    };
    
    loadData();
  }, []); // 初回マウント時のみ実行

  // userIdが設定されたら画像を取得
  useEffect(() => {
    if (userId) {
      fetchImages();
    }
  }, [userId]);

  // ページが変更された時は画像のみ再取得
  useEffect(() => {
    // 初回のuseEffectでは実行しない
    if (!initialLoading) {
      fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // いいねの切り替え
  const toggleLike = async (id: string, liked: boolean) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) return;
      
      const url = `${BACKEND_URL}/images/${id}/likes`;
      
      await axios({
        method: liked ? 'delete' : 'post',
        url,
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // いいねの状態を即時反映
      setImages(prev => 
        prev.map(img => {
          if (img.id === id) {
            if (liked) {
              // いいねを削除
              return {
                ...img,
                likes: img.likes.filter(like => like.user.id !== userId)
              };
            } else {
              // いいねを追加
              return {
                ...img,
                likes: [...img.likes, { user: { id: userId } }]
              };
            }
          }
          return img;
        })
      );
    } catch (e) {
      console.error('いいね操作エラー:', e);
      Alert.alert('エラー', 'いいねの操作に失敗しました');
    }
  };

  // 画像ダウンロード
  const downloadImage = async (url: string, title: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('権限エラー', 'カメラロールへのアクセスが許可されていません');
        return;
      }
      const fileUri = FileSystem.documentDirectory + title;
      const downloaded = await FileSystem.downloadAsync(url, fileUri);
      const asset = await MediaLibrary.createAssetAsync(downloaded.uri);
      await MediaLibrary.createAlbumAsync('Download', asset, false);
      Alert.alert('保存完了', '画像を保存しました');
    } catch (e) {
      Alert.alert('保存エラー', '画像の保存に失敗しました');
    }
  };

  // SNSシェア
  const shareToSNS = async (platform: string) => {
    if (!selectedImage) return;
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      const res = await axios.get(`${BACKEND_URL}/images/${selectedImage.id}/share?platform=${platform}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await Linking.openURL(res.data.url);
    } catch (e) {
      Alert.alert('エラー', 'シェアに失敗しました');
    }
  };

  // リンクコピー
  const copyLink = async () => {
    if (!selectedImage) return;
    await Clipboard.setStringAsync(selectedImage.url);
    Alert.alert('コピー完了', '画像リンクをコピーしました');
  };

  // 画面をプルダウンして更新
  const handleRefresh = () => {
    setPage(1);
    fetchImages();
  };

  // スケルトンローディング用のデータを生成
  const skeletonData = Array(6).fill(null).map((_, index) => ({
    id: `skeleton-${index}`,
  }));

  // エラー表示コンポーネント
  const ErrorView = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{error}</Text>
      {retryCount < MAX_RETRIES ? (
        <Button
          title="再試行"
          onPress={() => fetchImages(true)}
          color="#007AFF"
        />
      ) : (
        <Button
          title="最初から読み直す"
          onPress={() => {
            setPage(1);
            setRetryCount(0);
            fetchImages();
          }}
          color="#007AFF"
        />
      )}
    </View>
  );

  // メモリ最適化のための画像解放
  useEffect(() => {
    return () => {
      // コンポーネントのアンマウント時に画像を解放
      setImages([]);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>画像ギャラリー</Text>
        <Button title="いいね一覧" onPress={() => navigation.navigate('Liked')} />
      </View>
      
      {error && <ErrorView />}
      
      <MasonryList
        data={loading && page === 1 ? skeletonData : images}
        keyExtractor={item => item.id}
        numColumns={2}
        onEndReached={() => {
          if (images.length >= total) return;
          if (!loading) setPage(p => p + 1);
        }}
        onEndReachedThreshold={0.5}
        refreshing={loading && page === 1}
        ListFooterComponent={loading && page > 1 ? <ActivityIndicator size="large" color="#0000ff" /> : null}
        renderItem={({ item, i }: { item: unknown; i: number }) => {
          const typedItem = item as ImageItem | { id: string };
          if ('id' in typedItem && typedItem.id.startsWith('skeleton')) {
            return <SkeletonImage />;
          }

          const imageItem = typedItem as ImageItem;
          const aspectRatio = imageItem.width && imageItem.height 
            ? imageItem.width / imageItem.height 
            : 1;
          const imageStyle = { 
            width: '100%', 
            aspectRatio: aspectRatio,
            borderRadius: 8 
          };

          return (
            <TouchableOpacity
              onPress={() => { setSelectedImage(imageItem); setModalVisible(true); }}
              style={{ marginBottom: 12 }}
            >
              <LazyImage uri={imageItem.url} style={imageStyle} />
              <View style={{ position: 'absolute', top: 8, right: 8 }}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    const isLiked = imageItem.likes.some(like => like.user.id === userId);
                    toggleLike(imageItem.id, isLiked);
                  }}
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: 8,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 16 }}>
                    {imageItem.likes.some(like => like.user.id === userId) ? '❤️' : '🤍'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: 'white', fontWeight: 'bold', padding: 4, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                {imageItem.title}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>画像がありません</Text>
            </View>
          ) : null
        }
      />

      {/* モーダル */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                {selectedImage && (
                  <>
                    <Text style={styles.modalTitle}>{selectedImage.title}</Text>
                    <Image source={{ uri: selectedImage.url }} style={styles.modalImage} resizeMode="contain" />
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => downloadImage(selectedImage.url, selectedImage.title)}
                      >
                        <MaterialIcons name="file-download" size={24} color="white" />
                        <Text style={styles.iconButtonText}>保存</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => shareToSNS('twitter')}
                      >
                        <FontAwesome5 name="x-twitter" size={24} color="white" />
                        <Text style={styles.iconButtonText}>X</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => shareToSNS('facebook')}
                      >
                        <FontAwesome name="facebook" size={24} color="white" />
                        <Text style={styles.iconButtonText}>Facebook</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={copyLink}
                      >
                        <MaterialIcons name="link" size={24} color="white" />
                        <Text style={styles.iconButtonText}>リンク</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    padding: 8,
  },
  imageCard: {
    margin: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 200,
  },
  imageTitle: {
    padding: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 500,
    alignItems: 'center',
  },
  modalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalImage: {
    width: 320,
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#111',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  iconButton: {
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    minWidth: 80,
  },
  iconButtonText: {
    color: 'white',
    marginTop: 4,
    fontSize: 12,
  },
  skeletonContainer: {
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e0e0e0',
  },
  skeletonTitle: {
    height: 20,
    margin: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
  },
  errorContainer: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 8,
    borderRadius: 8,
    elevation: 2,
  },
  loadingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffebee',
  },
});
