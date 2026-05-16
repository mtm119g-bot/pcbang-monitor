import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useAuth } from '../context/AuthContext';

const GRADE_LABELS = { 1: 'Free', 2: 'Basic', 3: 'Pro', 4: '관리자' };
const GRADE_COLORS = { 1: '#64748b', 2: '#ffaa00', 3: '#00d4ff', 4: '#ff44cc' };

export default function AdminScreen() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [ur, sr] = await Promise.all([
        authFetch('/api/admin/users'),
        authFetch('/api/admin/stats'),
      ]);
      const ud = await ur.json();
      const sd = await sr.json();
      if (Array.isArray(ud)) setUsers(ud);
      if (!sd.error) setStats(sd);
    } catch (e) {}
    setLoading(false);
  }

  async function changeGrade(userId, grade) {
    Alert.alert('등급 변경', `${GRADE_LABELS[grade]}(${grade}등급)으로 변경할까요?`, [
      { text: '취소' },
      { text: '변경', onPress: async () => {
        await authFetch(`/api/admin/users/${userId}/grade`, { method: 'PUT', body: JSON.stringify({ grade }) });
        loadData();
      }}
    ]);
  }

  async function toggleUser(userId, isActive) {
    Alert.alert(isActive ? '계정 정지' : '계정 활성화', `계정을 ${isActive ? '정지' : '활성화'}할까요?`, [
      { text: '취소' },
      { text: '확인', onPress: async () => {
        await authFetch(`/api/admin/users/${userId}/toggle`, { method: 'PUT' });
        loadData();
      }}
    ]);
  }

  async function deleteUser(userId, name) {
    Alert.alert('회원 삭제', `${name}님을 삭제할까요?\n모든 데이터가 삭제됩니다.`, [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        loadData();
      }}
    ]);
  }

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={s.container}>
      {/* 통계 카드 */}
      {stats && (
        <View style={s.cards}>
          <View style={s.card}><Text style={s.cardLabel}>전체 회원</Text><Text style={[s.cardVal,{color:'#00d4ff'}]}>{stats.totalUsers}명</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>활성 회원</Text><Text style={[s.cardVal,{color:'#00ff88'}]}>{stats.activeUsers}명</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>자동스캔 중</Text><Text style={[s.cardVal,{color:'#ffaa00'}]}>{stats.autoScanUsers}개</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>총 업체</Text><Text style={[s.cardVal,{color:'#cc44ff'}]}>{stats.totalBiz}개</Text></View>
        </View>
      )}

      {/* 검색 */}
      <View style={s.searchWrap}>
        <TextInput style={s.searchInput} placeholder="아이디/이름 검색" placeholderTextColor="#64748b"
          value={search} onChangeText={setSearch} />
        <TouchableOpacity style={s.refreshBtn} onPress={loadData}>
          <Text style={s.refreshTx}>🔄</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color="#00d4ff" style={{ padding: 30 }} /> : (
        filtered.map(u => (
          <View key={u._id} style={s.userCard}>
            <View style={s.userHeader}>
              <View style={[s.gradeBadge, { backgroundColor: GRADE_COLORS[u.grade] + '22', borderColor: GRADE_COLORS[u.grade] }]}>
                <Text style={[s.gradeTx, { color: GRADE_COLORS[u.grade] }]}>{GRADE_LABELS[u.grade]}</Text>
              </View>
              <View style={s.userInfo}>
                <Text style={s.userName}>{u.name}</Text>
                <Text style={s.userId}>@{u.username}</Text>
              </View>
              <View style={[s.statusDot, { backgroundColor: u.isActive ? '#00ff88' : '#ff4455' }]} />
            </View>

            <View style={s.userMeta}>
              <Text style={s.metaTx}>업체 {u.bizCount}개</Text>
              <Text style={s.metaTx}>자동스캔 {u.autoScan ? 'ON' : 'OFF'}</Text>
              <Text style={s.metaTx}>한도 {u.maxBiz}개</Text>
            </View>

            {/* 등급 변경 */}
            <View style={s.gradeRow}>
              {[1,2,3,4].map(g => (
                <TouchableOpacity key={g} style={[s.gradeBtn, u.grade === g && { backgroundColor: GRADE_COLORS[g]+'33', borderColor: GRADE_COLORS[g] }]}
                  onPress={() => changeGrade(u._id, g)}>
                  <Text style={[s.gradeBtnTx, u.grade === g && { color: GRADE_COLORS[g] }]}>{g}등급</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 액션 버튼 */}
            <View style={s.actionRow}>
              <TouchableOpacity style={[s.actionBtn, { borderColor: u.isActive ? '#ffaa00' : '#00ff88' }]}
                onPress={() => toggleUser(u._id, u.isActive)}>
                <Text style={[s.actionBtnTx, { color: u.isActive ? '#ffaa00' : '#00ff88' }]}>
                  {u.isActive ? '정지' : '활성화'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { borderColor: '#ff4455' }]}
                onPress={() => deleteUser(u._id, u.name)}>
                <Text style={[s.actionBtnTx, { color: '#ff4455' }]}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18', padding: 12 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: { flex: 1, minWidth: '45%', backgroundColor: '#0f1623', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1e3a5f', alignItems: 'center' },
  cardLabel: { color: '#64748b', fontSize: 11, marginBottom: 4 },
  cardVal: { fontSize: 22, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: '#0f1623', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 8, color: '#e2e8f0', padding: 10, fontSize: 13 },
  refreshBtn: { backgroundColor: '#0f1623', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e3a5f', justifyContent: 'center' },
  refreshTx: { fontSize: 16 },
  userCard: { backgroundColor: '#0f1623', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 8 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  gradeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  gradeTx: { fontSize: 11, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  userId: { color: '#64748b', fontSize: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  userMeta: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metaTx: { color: '#64748b', fontSize: 11 },
  gradeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  gradeBtn: { flex: 1, borderRadius: 6, padding: 6, alignItems: 'center', borderWidth: 1, borderColor: '#1e3a5f', backgroundColor: '#161f2e' },
  gradeBtnTx: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 6, padding: 8, alignItems: 'center', borderWidth: 1, backgroundColor: '#161f2e' },
  actionBtnTx: { fontSize: 12, fontWeight: '700' },
});
