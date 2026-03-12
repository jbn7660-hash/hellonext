/**
 * 홈 Screen
 * 오늘의 연습과 코칭 일정을 확인하세요
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function MemberHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>홈</Text>
        <View style={styles.placeholder}>
          <Text style={styles.icon}>⛳</Text>
          <Text style={styles.description}>오늘의 연습과 코칭 일정을 확인하세요</Text>
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
