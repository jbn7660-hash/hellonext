/**
 * Login Screen
 *
 * Social login with Kakao (primary) and email/password.
 * Branded with HelloNext green theme.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithKakao } from '@/lib/supabase/client';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/root-navigator';

export function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const handleKakaoLogin = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await signInWithKakao();

      if (error) {
        Alert.alert('로그인 실패', error.message);
        return;
      }

      if (data?.url) {
        // Open OAuth URL in browser
        await Linking.openURL(data.url);
      }
    } catch (err) {
      Alert.alert('오류', '로그인 중 문제가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    // TODO: Implement email login flow
    Alert.alert('준비 중', '이메일 로그인은 준비 중입니다.');
  };

  const handleTestDrive = () => {
    navigation.navigate('TestDrive');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Logo & Brand */}
      <View style={styles.brandSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>⛳</Text>
        </View>
        <Text style={styles.title}>HelloNext</Text>
        <Text style={styles.subtitle}>
          AI 골프 코칭 플랫폼
        </Text>
        <Text style={styles.description}>
          프로와 회원을 연결하는{'\n'}
          스마트 골프 레슨의 시작
        </Text>
      </View>

      {/* Login Buttons */}
      <View style={styles.buttonSection}>
        {/* Kakao Login */}
        <TouchableOpacity
          style={styles.kakaoButton}
          onPress={handleKakaoLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#3C1E1E" />
          ) : (
            <>
              <Text style={styles.kakaoIcon}>💬</Text>
              <Text style={styles.kakaoText}>카카오로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Email Login */}
        <TouchableOpacity
          style={styles.emailButton}
          onPress={handleEmailLogin}
          activeOpacity={0.8}
        >
          <Text style={styles.emailText}>이메일로 로그인</Text>
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.terms}>
          시작하기를 누르면{' '}
          <Text style={styles.termsLink}>서비스 이용약관</Text>과{' '}
          <Text style={styles.termsLink}>개인정보 처리방침</Text>에 동의하게 됩니다.
        </Text>

        <View style={styles.divider} />

        {/* Test Drive (no auth) */}
        <TouchableOpacity
          style={styles.testDriveButton}
          onPress={handleTestDrive}
          activeOpacity={0.9}
        >
          <Text style={styles.testDriveIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.testDriveTitle}>테스트 드라이브</Text>
            <Text style={styles.testDriveSubtitle}>로그인 없이 바로 음성 메모 테스트</Text>
          </View>
          <Text style={styles.testDriveChevron}>›</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
  },
  brandSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    fontSize: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonSection: {
    paddingBottom: 40,
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  kakaoIcon: {
    fontSize: 20,
  },
  kakaoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3C1E1E',
  },
  emailButton: {
    backgroundColor: '#f3f4f6',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  terms: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#22c55e',
    textDecorationLine: 'underline',
  },
  divider: {
    marginVertical: 16,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  testDriveButton: {
    backgroundColor: '#ecfdf3',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  testDriveIcon: { fontSize: 18 },
  testDriveTitle: { fontSize: 15, fontWeight: '700', color: '#166534' },
  testDriveSubtitle: { fontSize: 12, color: '#166534' },
  testDriveChevron: { fontSize: 22, color: '#166534', paddingHorizontal: 4 },
});
