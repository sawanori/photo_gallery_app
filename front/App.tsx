import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import ImagesScreen from './src/screens/ImagesScreen';
import LikedImagesScreen from './src/screens/LikedImagesScreen';
import { BACKEND_URL } from '@env';
import { useEffect } from 'react';
import axios from 'axios';
import * as Network from 'expo-network';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const Stack = createNativeStackNavigator();

// グローバルなAxios設定
axios.defaults.timeout = 30000; // 30秒
axios.interceptors.request.use(
  async config => {
    // リクエスト前にネットワーク状態を確認
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      return Promise.reject(new Error('インターネット接続がありません'));
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default function App() {
  // 開発時の環境変数確認
  useEffect(() => {
    console.log('Backend URL:', BACKEND_URL);
    
    // ネットワーク接続テスト
    const checkConnection = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        console.log('Network state:', networkState);
        
        if (!networkState.isConnected) {
          Alert.alert('警告', 'インターネット接続がありません');
        } else if (!networkState.isInternetReachable) {
          Alert.alert('警告', 'インターネットに接続できません');
        }
      } catch (err) {
        console.error('ネットワーク確認エラー:', err);
      }
    };
    
    checkConnection();
  }, []);
  
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Images" component={ImagesScreen} />
        <Stack.Screen name="Liked"  component={LikedImagesScreen}  />
      </Stack.Navigator>
    </NavigationContainer>
  );
}