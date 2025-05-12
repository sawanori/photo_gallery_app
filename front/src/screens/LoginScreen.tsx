import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { StackNavigationProp } from '@react-navigation/stack';
import { BACKEND_URL } from '@env';
import * as Network from 'expo-network';

type RootStackParamList = {
  Login: undefined;
  Images: undefined;
};

type LoginScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async () => {
    try {
      setError('');
      const endpoint = isLogin ? 'login' : 'register';
      
      // ネットワーク状態を確認
      const networkState = await Network.getNetworkStateAsync();
      console.log('Network state:', networkState);
      
      if (!networkState.isConnected) {
        setError('インターネット接続がありません');
        return;
      }
      
      // デバッグ用ログ出力
      console.log('環境変数:', BACKEND_URL);
      const apiUrl = `${BACKEND_URL}/auth/${endpoint}`;
      console.log('リクエストURL:', apiUrl);
      console.log('リクエストデータ:', { email, password });
      
      // axios設定を追加 - タイムアウトを60秒に延長
      const res = await axios.post(apiUrl, 
        { email, password },
        { 
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000, // 60秒タイムアウト
          timeoutErrorMessage: 'リクエストがタイムアウトしました。ネットワーク接続を確認してください。'
        }
      );
      
      console.log('レスポンス:', res.data);
      
      await SecureStore.setItemAsync('accessToken', res.data.accessToken);
      navigation.replace('Images' as any);
    } catch (e: any) {
      // 詳細なエラーログを出力
      if (e.isAxiosError) {
        console.error('認証エラー詳細:',
          e.message,
          e.response?.status,
          e.response?.data,
          e.code,
          e.request?._response
        );
        
        if (e.code === 'ECONNABORTED') {
          setError('接続がタイムアウトしました。ネットワークを確認してください。');
        } else if (e.response) {
          // サーバーからのレスポンスがある場合
          setError(`${isLogin ? 'ログイン' : '登録'}失敗: ${e.response.data?.message || e.message}`);
        } else if (e.request) {
          // リクエストは送信されたがレスポンスがない場合
          setError('サーバーに接続できませんでした。ネットワークを確認してください。');
        } else {
          // その他のエラー
          setError(`${isLogin ? 'ログイン' : '登録'}失敗: ${e.message}`);
        }
      } else {
        // AxiosError以外のエラー
        console.error('認証エラー詳細:', e);
        setError(`${isLogin ? 'ログイン' : '登録'}失敗: ${e.message || '不明なエラー'}`);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isLogin ? 'ログイン' : '新規登録'}</Text>
      
      <TextInput 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      
      <TextInput 
        placeholder="Password" 
        secureTextEntry 
        value={password} 
        onChangeText={setPassword} 
        style={styles.input} 
      />
      
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      
      <Button title={isLogin ? "ログイン" : "登録"} onPress={handleAuth} />
      
      <Text 
        style={styles.switchText} 
        onPress={() => setIsLogin(!isLogin)}
      >
        {isLogin ? "アカウントを作成する" : "既存アカウントでログイン"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center'
  },
  input: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 6,
    backgroundColor: 'white'
  },
  errorText: {
    color: 'red',
    marginBottom: 12
  },
  switchText: {
    marginTop: 20,
    color: 'blue',
    textAlign: 'center'
  }
});
