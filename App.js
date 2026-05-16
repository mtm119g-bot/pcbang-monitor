import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import MonitorScreen from './src/screens/MonitorScreen';
import StatsScreen from './src/screens/StatsScreen';
import MapScreen from './src/screens/MapScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubScreen from './src/screens/SubScreen';
import AdminScreen from './src/screens/AdminScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#0f1623', borderBottomColor: '#1e3a5f', borderBottomWidth: 1 },
        headerTintColor: '#e2e8f0',
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: '#0f1623', borderTopColor: '#1e3a5f', borderTopWidth: 1 },
        tabBarActiveTintColor: '#00d4ff',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            '모니터': 'radio',
            '통계': 'bar-chart',
            '지도': 'map',
            '설정': 'settings',
            '구독': 'card',
            '관리자': 'shield',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}>
      <Tab.Screen name="모니터" component={MonitorScreen} />
      <Tab.Screen name="통계" component={StatsScreen} />
      <Tab.Screen name="지도" component={MapScreen} />
      <Tab.Screen name="설정" component={SettingsScreen} />
      <Tab.Screen name="구독" component={SubScreen} />
      {isAdmin && <Tab.Screen name="관리자" component={AdminScreen} />}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080c18', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor="#080c18" />
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
