import React from 'react';
import { Tabs } from 'expo-router';
import { LayoutDashboard, Briefcase, TrendingUp, Crosshair, CircleUserRound } from 'lucide-react-native';
import { colors } from '../../src/theme';

// Tab structure mirrors the web nav groups (App.jsx NAV_GROUPS):
//   Dashboard | Portfolio (Exposures/Rosters/Combos) | Market (ADP/Rankings)
//   | Draft Day (Assistant/Arena) | Account
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface1,
          borderTopColor: colors.borderSubtle,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.surface0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="draft"
        options={{
          title: 'Draft Day',
          tabBarIcon: ({ color, size }) => <Crosshair color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size - 2} />,
        }}
      />
    </Tabs>
  );
}
