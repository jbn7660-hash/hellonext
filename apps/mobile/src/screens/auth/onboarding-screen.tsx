/**
 * Onboarding Screen
 *
 * Post-login role selection and profile setup.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

type Role = 'pro' | 'member';

export function OnboardingScreen() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { initialize } = useAuthStore();

  const handleContinue = async () => {
    if (!selectedRole) return;

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('사용자 정보를 찾을 수 없습니다.');

      const table = selectedRole === 'pro' ? 'pro_profiles' : 'member_profiles';
      const { error } = await supabase.from(table).insert({
        user_id: user.id,
        display_name: user.user_metadata?.full_name || '사용자',
      });

      if (error) throw error;

      // Re-initialize auth to pick up new role
      await initialize();
    } catch (err: any) {
      Alert.alert('오류', err.message || '프로필 생성에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>어떤 역할인가요?</Text>
        <Text style={styles.subtitle}>
          역할에 따라 맞춤 화면이 제공됩니다
        </Text>

        <View style={styles.roleCards}>
          <TouchableOpacity
            style={[styles.roleCard, selectedRole === 'pro' && styles.roleCardSelected]}
            onPress={() => setSelectedRole('pro')}
            activeOpacity={0.8}
          >
            <Text style={styles.roleIcon}>🏌️‍♂️</Text>
            <Text style={[styles.roleName, selectedRole === 'pro' && styles.roleNameSelected]}>
              골프 프로
            </Text>
            <Text style={styles.roleDesc}>
              회원 관리, 리포트 작성,{'\n'}AI 코칭 도구 활용
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, selectedRole === 'member' && styles.roleCardSelected]}
            onPress={() => setSelectedRole('member')}
            activeOpacity={0.8}
          >
            <Text style={styles.roleIcon}>🎯</Text>
            <Text style={[styles.roleName, selectedRole === 'member' && styles.roleNameSelected]}>
              회원
            </Text>
            <Text style={styles.roleDesc}>
              스윙 연습, 진도 확인,{'\n'}프로 코칭 수강
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.continueButton, !selectedRole && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!selectedRole || isLoading}
        activeOpacity={0.8}
      >
        <Text style={styles.continueText}>
          {isLoading ? '설정 중...' : '시작하기'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 24 },
  content: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#1f2937', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 40 },
  roleCards: { gap: 16 },
  roleCard: {
    backgroundColor: '#f9fafb', borderRadius: 20, padding: 24,
    borderWidth: 2, borderColor: '#f3f4f6', alignItems: 'center',
  },
  roleCardSelected: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  roleIcon: { fontSize: 40, marginBottom: 12 },
  roleName: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  roleNameSelected: { color: '#16a34a' },
  roleDesc: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  continueButton: {
    backgroundColor: '#22c55e', height: 56, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  continueButtonDisabled: { backgroundColor: '#d1d5db' },
  continueText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
