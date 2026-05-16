import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username || !password) { Alert.alert('오류', '아이디와 비밀번호를 입력해주세요'); return; }
    if (!isLogin && !name) { Alert.alert('오류', '이름을 입력해주세요'); return; }
    setLoading(true);
    try {
      if (isLogin) await login(username, password);
      else await register(username, password, name);
    } catch (e) {
      Alert.alert('오류', e.message);
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.logo}>PC방 <Text style={s.logoSub}>MONITOR</Text></Text>
          <Text style={s.sub}>PC방 멀티 핑 모니터링 시스템</Text>

          {!isLogin && (
            <TextInput style={s.input} placeholder="이름" placeholderTextColor="#64748b"
              value={name} onChangeText={setName} />
          )}
          <TextInput style={s.input} placeholder="아이디" placeholderTextColor="#64748b"
            value={username} onChangeText={setUsername} autoCapitalize="none" />
          <TextInput style={s.input} placeholder="비밀번호" placeholderTextColor="#64748b"
            value={password} onChangeText={setPassword} secureTextEntry />

          <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> :
              <Text style={s.btnTx}>{isLogin ? '로그인' : '회원가입'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.toggle} onPress={() => setIsLogin(!isLogin)}>
            <Text style={s.toggleTx}>
              {isLogin ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
              <Text style={s.toggleLink}>{isLogin ? '회원가입' : '로그인'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#0f1623', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1e3a5f' },
  logo: { fontSize: 28, fontWeight: '900', color: '#00d4ff', textAlign: 'center', marginBottom: 4 },
  logoSub: { color: '#e2e8f0' },
  sub: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#161f2e', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 8,
    color: '#e2e8f0', padding: 12, fontSize: 14, marginBottom: 12 },
  btn: { backgroundColor: '#00d4ff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnTx: { color: '#000', fontWeight: '700', fontSize: 15 },
  toggle: { marginTop: 16, alignItems: 'center' },
  toggleTx: { color: '#64748b', fontSize: 13 },
  toggleLink: { color: '#00d4ff', fontWeight: '700' },
});
