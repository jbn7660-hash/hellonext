/**
 * 연습 Screen
 * 스윙 촬영 및 음성 메모 녹음
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function MemberPracticeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>연습</Text>
        <View style={styles.placeholder}>
          <Text style={styles.icon}>🏌️</Text>
          <Text style={styles.description}>스윙 촬영 및 음성 메모 녹음</Text>
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
