/**
 * HelloNext Mobile App Entry Point
 *
 * Initializes:
 * - Splash screen
 * - Status bar configuration
 * - Root navigator with auth flow
 * - Error boundary
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, Text } from 'react-native';

import { RootNavigator } from '@/navigation/root-navigator';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

// ============================================================
// Error Boundary
// ============================================================
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[App] Error Boundary caught:', error, errorInfo);
    // TODO: Send to Sentry
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.emoji}>⛳</Text>
          <Text style={errorStyles.title}>앗, 문제가 발생했습니다</Text>
          <Text style={errorStyles.message}>
            앱을 다시 시작해주세요.{'\n'}
            문제가 계속되면 고객센터에 문의해주세요.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// App Component
// ============================================================
export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, assets, etc.
        // await Font.loadAsync({ ... });
        // await Asset.loadAsync([ ... ]);
      } catch (e) {
        console.warn('[App] Prepare error:', e);
      } finally {
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (isReady) {
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
