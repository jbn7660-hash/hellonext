/**
 * 대시보드 Screen
 * 회원 현황 및 코칭 통계
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ProDashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>대시보드</Text>
        <View style={styles.placeholder}>
          <Text style={styles.icon}>📊</Text>
          <Text style={styles.description}>회원 현황 및 코칭 통계</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20 },
  header: { fontSize: 28, fontWeight: '800', color: '#1f2937', marginBottom: 20 },
  placeholder: {
    backgroundColor: '#f0fdf4', borderRadius: 16, padding: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 48, marginBottom: 12 },
  description: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
