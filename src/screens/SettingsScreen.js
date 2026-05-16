import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#00d4ff','#00ff88','#ffaa00','#ff4455','#cc44ff','#ff8844','#44ffcc','#ff44cc'];

export default function SettingsScreen() {
  const { authFetch, user, logout } = useAuth();
  const [bizList, setBizList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadBiz(); }, []);

  async function loadBiz() {
    setLoading(true);
    try {
      const r = await authFetch('/api/biz');
      const d = await r.json();
      if (Array.isArray(d)) setBizList(d.map(b => ({ ...b, ipRange: b.ipRange || '' })));
    } catch (e) {}
    setLoading(false);
  }

  function updateBiz(id, field, value) {
    setBizList(prev => prev.map(b => b._id === id ? { ...b, [field]: value } : b));
  }

  async function saveBiz() {
    setSaving(true);
    try {
      const list = bizList.map(b => ({ _id: b._id, name: b.name, color: b.color, ipRange: b.ipRange }));
      const r = await authFetch('/api/biz', { method: 'POST', body: JSON.stringify({ bizList: list }) });
      const d = await r.json();
      if (d.ok) Alert.alert('✅', '저장되었습니다');
      else Alert.alert('오류', d.error || '저장 실패');
    } catch (e) { Alert.alert('오류', '저장 실패'); }
    setSaving(false);
  }

  function addBiz() {
    if (bizList.length >= (user?.maxBiz || 3)) {
      Alert.alert('한도 초과', `현재 등급에서 최대 ${user?.maxBiz || 3}개까지 가능합니다`);
      return;
    }
    const color = COLORS[bizList.length % COLORS.length];
    setBizList(prev => [...prev, { _id: 'new_' + Date.now(), name: '새 업체', color, ipRange: '' }]);
  }

  function removeBiz(id) {
    Alert.alert('삭제', '업체를 삭제할까요?', [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: () => setBizList(prev => prev.filter(b => b._id !== id)) }
    ]);
  }

  return (
    <ScrollView style={s.container}>
      {/* 내 정보 */}
      <View style={s.sec}>
        <Text style={s.secTitle}>👤 내 정보</Text>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>아이디</Text>
          <Text style={s.infoVal}>{user?.username}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>이름</Text>
          <Text style={s.infoVal}>{user?.name}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>등급</Text>
          <Text style={[s.infoVal, { color: '#00d4ff' }]}>
            {user?.grade === 1 ? 'Free (3개)' : user?.grade === 2 ? 'Basic (10개)' : user?.grade >= 3 ? 'Pro (무제한)' : '-'}
          </Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={() => Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
          { text: '취소' }, { text: '로그아웃', style: 'destructive', onPress: logout }
        ])}>
          <Text style={s.logoutTx}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 업체 설정 */}
      <View style={s.sec}>
        <View style={s.secHeader}>
          <Text style={s.secTitle}>🏢 업체 설정</Text>
          <Text style={s.bizCount}>{bizList.length}/{user?.maxBiz || 3}개</Text>
        </View>

        {loading ? <ActivityIndicator color="#00d4ff" style={{ padding: 20 }} /> : (
          <>
            {bizList.map((biz, idx) => (
              <View key={biz._id} style={s.bizItem}>
                <View style={s.bizHeader}>
                  <Text style={s.bizNum}>{idx + 1}</Text>
                  <View style={[s.colorDot, { backgroundColor: biz.color }]} />
                  <TextInput style={s.bizNameInput} value={biz.name}
                    onChangeText={v => updateBiz(biz._id, 'name', v)}
                    placeholder="업체명" placeholderTextColor="#64748b" />
                  <TouchableOpacity onPress={() => removeBiz(biz._id)}>
                    <Text style={s.delBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                {/* 색상 선택 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.colorRow}>
                  {COLORS.map(c => (
                    <TouchableOpacity key={c} style={[s.colorOption, biz.color === c && s.colorSelected, { backgroundColor: c }]}
                      onPress={() => updateBiz(biz._id, 'color', c)} />
                  ))}
                </ScrollView>
                {/* IP 입력 */}
                <TextInput style={s.ipInput} value={biz.ipRange}
                  onChangeText={v => updateBiz(biz._id, 'ipRange', v)}
                  placeholder="IP 범위 (예: 192.168.0.1~50)" placeholderTextColor="#64748b"
                  multiline numberOfLines={2} />
              </View>
            ))}

            <TouchableOpacity style={s.addBtn} onPress={addBiz}>
              <Text style={s.addBtnTx}>+ 업체 추가</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.saveBtn} onPress={saveBiz} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" size="small" /> :
                <Text style={s.saveBtnTx}>💾 저장</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18', padding: 12 },
  sec: { backgroundColor: '#0f1623', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 12 },
  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  secTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 14, marginBottom: 14 },
  bizCount: { color: '#64748b', fontSize: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#161f2e' },
  infoLabel: { color: '#64748b', fontSize: 13 },
  infoVal: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  logoutBtn: { marginTop: 14, backgroundColor: '#ff445520', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ff4455' },
  logoutTx: { color: '#ff4455', fontWeight: '700' },
  bizItem: { backgroundColor: '#161f2e', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1e3a5f' },
  bizHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bizNum: { color: '#64748b', fontSize: 12, width: 16 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  bizNameInput: { flex: 1, color: '#e2e8f0', fontSize: 14, fontWeight: '700', padding: 0 },
  delBtn: { color: '#ff4455', fontSize: 16, padding: 4 },
  colorRow: { marginBottom: 8 },
  colorOption: { width: 24, height: 24, borderRadius: 12, marginRight: 8, opacity: 0.7 },
  colorSelected: { opacity: 1, borderWidth: 2, borderColor: '#fff' },
  ipInput: { backgroundColor: '#0f1623', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12 },
  addBtn: { borderWidth: 1, borderColor: '#00d4ff', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 10 },
  addBtnTx: { color: '#00d4ff', fontWeight: '700' },
  saveBtn: { backgroundColor: '#00d4ff', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveBtnTx: { color: '#000', fontWeight: '700', fontSize: 14 },
});
