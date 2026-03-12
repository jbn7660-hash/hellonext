/**
 * Root Navigator
 *
 * Handles auth flow:
 * - Not authenticated → Auth screens
 * - Authenticated as Pro → Pro tab navigator
 * - Authenticated as Member → Member tab navigator
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/auth-store';

// Screens
import { LoginScreen } from '@/screens/auth/login-screen';
import { OnboardingScreen } from '@/screens/auth/onboarding-screen';
import { MemberHomeScreen } from '@/screens/member/home-screen';
import { MemberPracticeScreen } from '@/screens/member/practice-screen';
import { MemberProgressScreen } from '@/screens/member/progress-screen';
import { MemberProfileScreen } from '@/screens/member/profile-screen';
import { ProDashboardScreen } from '@/screens/pro/dashboard-screen';
import { ProMembersScreen } from '@/screens/pro/members-screen';
import { ProReportsScreen } from '@/screens/pro/reports-screen';
import { ProSettingsScreen } from '@/screens/pro/settings-screen';

// ============================================================
// Navigator Types
// ============================================================
export type AuthStackParamList = {
  Login: undefined;
  Onboarding: { provider?: string };
};

export type MemberTabParamList = {
  Home: undefined;
  Practice: undefined;
  Progress: undefined;
  Profile: undefined;
};

export type ProTabParamList = {
  Dashboard: undefined;
  Members: undefined;
  Reports: undefined;
  Settings: undefined;
};

// ============================================================
// Navigators
// ============================================================
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MemberTab = createBottomTabNavigator<MemberTabParamList>();
const ProTab = createBottomTabNavigator<ProTabParamList>();

// ============================================================
// Theme Colors
// ============================================================
const BRAND = '#22c55e';
const BRAND_DARK = '#16a34a';
const GRAY = '#9ca3af';
const BG = '#ffffff';

// ============================================================
// Auth Navigator
// ============================================================
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
    </AuthStack.Navigator>
  );
}

// ============================================================
// Member Tab Navigator
// ============================================================
function MemberNavigator() {
  return (
    <MemberTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: focused ? 'home' : 'home-outline',
            Practice: focused ? 'golf' : 'golf-outline',
            Progress: focused ? 'trending-up' : 'trending-up-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
      })}
    >
      <MemberTab.Screen
        name="Home"
        component={MemberHomeScreen}
        options={{ tabBarLabel: '홈' }}
      />
      <MemberTab.Screen
        name="Practice"
        component={MemberPracticeScreen}
        options={{ tabBarLabel: '연습' }}
      />
      <MemberTab.Screen
        name="Progress"
        component={MemberProgressScreen}
        options={{ tabBarLabel: '진도' }}
      />
      <MemberTab.Screen
        name="Profile"
        component={MemberProfileScreen}
        options={{ tabBarLabel: '프로필' }}
      />
    </MemberTab.Navigator>
  );
}

// ============================================================
// Pro Tab Navigator
// ============================================================
function ProNavigator() {
  return (
    <ProTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: focused ? 'grid' : 'grid-outline',
            Members: focused ? 'people' : 'people-outline',
            Reports: focused ? 'document-text' : 'document-text-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
      })}
    >
      <ProTab.Screen
        name="Dashboard"
        component={ProDashboardScreen}
        options={{ tabBarLabel: '대시보드' }}
      />
      <ProTab.Screen
        name="Members"
        component={ProMembersScreen}
        options={{ tabBarLabel: '회원' }}
      />
      <ProTab.Screen
        name="Reports"
        component={ProReportsScreen}
        options={{ tabBarLabel: '리포트' }}
      />
      <ProTab.Screen
        name="Settings"
        component={ProSettingsScreen}
        options={{ tabBarLabel: '설정' }}
      />
    </ProTab.Navigator>
  );
}

// ============================================================
// Root Navigator
// ============================================================
export function RootNavigator() {
  const { user, role, isLoading, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Loading state
  if (!isInitialized || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthNavigator />
      ) : role === 'pro' ? (
        <ProNavigator />
      ) : (
        <MemberNavigator />
      )}
    </NavigationContainer>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  tabBar: {
    backgroundColor: BG,
    borderTopColor: '#f3f4f6',
    borderTopWidth: 1,
    height: 85,
    paddingTop: 8,
    paddingBottom: 28,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
