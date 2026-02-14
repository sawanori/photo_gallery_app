import { Alert } from 'react-native';

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleError = (error: unknown, context?: string): string => {
  console.error(`Error in ${context || 'Unknown context'}:`, error);

  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.message.includes('Network')) {
      return 'ネットワークエラー: インターネット接続を確認してください';
    }
    if (error.message.includes('401') || error.message.includes('認証')) {
      return '認証エラー: ログインし直してください';
    }
    if (error.message.includes('timeout')) {
      return '接続タイムアウト: しばらく待ってから再試行してください';
    }
    return error.message;
  }

  return 'エラーが発生しました';
};

export const showErrorAlert = (
  error: unknown,
  title: string = 'エラー',
  onDismiss?: () => void
) => {
  const message = handleError(error);
  Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }]);
};

export const showSuccessAlert = (
  message: string,
  title: string = '完了',
  onDismiss?: () => void
) => {
  Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }]);
};