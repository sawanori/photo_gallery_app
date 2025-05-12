import React, { useEffect, useState } from 'react';
import { View, FlatList, Image, Button, ActivityIndicator, Text } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { BACKEND_URL } from '@env';

// 画像アイテムの型定義
interface ImageItem {
  id: string;
  url: string;
}

export default function LikedImagesScreen() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchLikes = async () => {
    const token = await SecureStore.getItemAsync('accessToken');
    const res = await axios.get(`${BACKEND_URL}/users/me/likes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('いいね一覧APIレスポンス:', JSON.stringify(res.data));
    setImages(res.data);
  };

  const downloadAll = async () => {
    setIsDownloading(true);
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      const res = await axios.get(`${BACKEND_URL}/users/me/likes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const images = res.data;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('カメラロールへのアクセスが許可されていません');
        setIsDownloading(false);
        return;
      }
      for (const img of images) {
        const fileUri = FileSystem.documentDirectory + (img.title || img.id) + (img.url.endsWith('.png') ? '.png' : '.jpg');
        const downloaded = await FileSystem.downloadAsync(img.url, fileUri);
        const asset = await MediaLibrary.createAssetAsync(downloaded.uri);
        await MediaLibrary.createAlbumAsync('Download', asset, false);
      }
      alert('すべての画像を保存しました');
    } catch (e) {
      alert('一括保存に失敗しました');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => { fetchLikes(); }, []);

  return (
    <View style={{ flex:1, padding:8 }}>
      <Button title="一括ダウンロード" onPress={downloadAll} disabled={isDownloading} />
      {isDownloading && (
        <View style={{ alignItems: 'center', marginVertical: 12 }}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={{ marginTop: 8 }}>保存中...</Text>
        </View>
      )}
      <FlatList
        data={images}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <Image source={{ uri: item.url }} style={{ width:'100%', height:200, marginVertical:4 }} />
        )}
      />
    </View>
  );
}
