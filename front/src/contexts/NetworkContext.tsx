import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { Alert } from 'react-native';

interface NetworkContextType {
  isConnected: boolean;
  networkType: Network.NetworkStateType | null;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [networkType, setNetworkType] = useState<Network.NetworkStateType | null>(null);
  const isMountedRef = useRef(true);
  const hasShownAlertRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    const checkNetworkStatus = async () => {
      try {
        const state = await Network.getNetworkStateAsync();

        if (!isMountedRef.current) return;

        setIsConnected(state.isConnected ?? false);
        setNetworkType(state.type);

        if (!state.isConnected && !hasShownAlertRef.current) {
          hasShownAlertRef.current = true;
          Alert.alert(
            'ネットワークエラー',
            'インターネット接続がありません。接続を確認してください。'
          );
        } else if (state.isConnected) {
          hasShownAlertRef.current = false;
        }
      } catch (error) {
        // Network check failed silently
      }
    };

    checkNetworkStatus();

    const interval = setInterval(checkNetworkStatus, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  const value: NetworkContextType = {
    isConnected,
    networkType,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
