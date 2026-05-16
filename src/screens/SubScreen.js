import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';

const PLANS = {
  basic: { monthly: 9900, yearly: 94800 },
  pro:   { monthly: 100000, yearly: 960000 },
};

export default function SubScreen() {
  const { authFetch, user } = useAuth();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState('monthly');
  const [payUrl, setPayUrl] = useState(null);

  useEffect(() => { loadSub(); }, []);

  async function loadSub() {
    setLoading(true);
    try {
      const r = await authFetch('/api/sub/me');
      const d = await r.json();
      setSub(d.sub || null);
    } catch (e) {}
    setLoading(false);
  }

  async function cancelSub() {
    Alert.alert('구독 취소', '구독을 취소하시겠습니까?\n만료일까지는 계속 이용 가능합니다.', [
      { text: '아니오' },
      { text: '취소하기', style: 'destructive', onPress: async () => {
        await authFetch('/api/sub/cancel', { method: 'POST' });
        loadSub();
      }}
    ]);
  }

  function getPrice(plan) {
    const p = PLANS[plan][cycle];
    return p.toLocaleString() + '원';
  }

  function getMonthlyPrice(plan) {
    if (cycle === 'yearly') {
      return plan === 'basic' ? '7,900원/월' : '80,000원/월';
    }
    return plan === 'basic' ? '9,900원/월' : '100,000원/월';
  }

  // 토스페이먼츠는 WebView로 결제
  function startPayment(plan) {
    Alert.alert('준비 중', '앱 내 결제는 준비 중입니다.\n웹에서 결제해 주세요.');
  }

  if (payUrl) {
    return (
      <View style={{ flex: 1 }}>
        <WebView source={{ uri: payUrl }} style={{ flex: 1 }}
          onNavigationStateChange={nav => {
            if (nav.url.includes('payment/success') || nav.url.includes('paymentKey')) {
              setPayUrl(null);
              loadSub();
            }
            if (nav.url.includes('payment/fail')) {
              setPayUrl(null);
              Alert.alert('결제 취소', '결제가 취소되었습니다.');
            }
          }} />
        <TouchableOpacity style={s.closeWebview} onPress={() => setPayUrl(null)}>
          <Text style={s.closeWebviewTx}>✕ 닫기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      {/* 현재 구독 상태 */}
      <View style={s.sec}>
        <Text style={s.secTitle}>📋 현재 구독 상태</Text>
        {loading ? <ActivityIndicator color="#00d4ff" /> : (
          sub ? (
            <View>
              <View style={s.subBadge}>
                <Text style={[s.subBadgeTx, { color: sub.plan === 'pro' ? '#00d4ff' : '#ffaa00' }]}>
                  {sub.plan === 'pro' ? '👑 Pro' : '⭐ Basic'}
                </Text>
                <Text style={s.subCycle}>{sub.cycle === 'yearly' ? '연간' : '월간'} 구독 중</Text>
              </View>
              <Text style={s.expireTx}>만료일: {new Date(sub.expireAt).toLocaleDateString('ko-KR')}</Text>
              <TouchableOpacity style={s.cancelBtn} onPress={cancelSub}>
                <Text style={s.cancelBtnTx}>구독 취소</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.freeBadge}>
              <Text style={s.freeTx}>🆓 Free 플랜 사용 중</Text>
            </View>
          )
        )}
      </View>

      {/* 주기 선택 */}
      <View style={s.cycleRow}>
        <TouchableOpacity style={[s.cycleBtn, cycle === 'monthly' && s.cycleBtnOn]} onPress={() => setCycle('monthly')}>
          <Text style={[s.cycleTx, cycle === 'monthly' && s.cycleTxOn]}>월간</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cycleBtn, cycle === 'yearly' && s.cycleBtnOn]} onPress={() => setCycle('yearly')}>
          <Text style={[s.cycleTx, cycle === 'yearly' && s.cycleTxOn]}>연간 <Text style={s.discount}>20%↓</Text></Text>
        </TouchableOpacity>
      </View>

      {/* Free 플랜 */}
      <View style={s.planCard}>
        <View style={s.planHeader}>
          <Text style={s.planName}>🆓 Free</Text>
          <Text style={s.planPrice}>무료</Text>
        </View>
        <Text style={s.planDesc}>업체 3개 · 기본 기능</Text>
      </View>

      {/* Basic 플랜 */}
      <View style={[s.planCard, { borderColor: '#ffaa00' }]}>
        <View style={s.planHeader}>
          <Text style={[s.planName, { color: '#ffaa00' }]}>⭐ Basic</Text>
          <View>
            <Text style={[s.planPrice, { color: '#ffaa00' }]}>{getPrice('basic')}</Text>
            {cycle === 'yearly' && <Text style={s.planMonthly}>{getMonthlyPrice('basic')}</Text>}
          </View>
        </View>
        <Text style={s.planDesc}>업체 10개 · 자동스캔 · 통계</Text>
        <TouchableOpacity style={[s.payBtn, { backgroundColor: '#ffaa00' }]} onPress={() => startPayment('basic')}>
          <Text style={s.payBtnTx}>Basic 구독하기</Text>
        </TouchableOpacity>
      </View>

      {/* Pro 플랜 */}
      <View style={[s.planCard, { borderColor: '#00d4ff', borderWidth: 2 }]}>
        <View style={s.bestBadge}><Text style={s.bestTx}>BEST</Text></View>
        <View style={s.planHeader}>
          <Text style={[s.planName, { color: '#00d4ff' }]}>👑 Pro</Text>
          <View>
            <Text style={[s.planPrice, { color: '#00d4ff' }]}>{getPrice('pro')}</Text>
            {cycle === 'yearly' && <Text style={s.planMonthly}>{getMonthlyPrice('pro')}</Text>}
          </View>
        </View>
        <Text style={s.planDesc}>업체 무제한 · 모든 기능 · 우선 지원</Text>
        <TouchableOpacity style={[s.payBtn, { backgroundColor: '#00d4ff' }]} onPress={() => startPayment('pro')}>
          <Text style={s.payBtnTx}>Pro 구독하기</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.notice}>💡 결제는 웹(PC)에서 진행해 주세요</Text>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18', padding: 12 },
  sec: { backgroundColor: '#0f1623', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 12 },
  secTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 14, marginBottom: 12 },
  subBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  subBadgeTx: { fontWeight: '700', fontSize: 16 },
  subCycle: { color: '#94a3b8', fontSize: 12 },
  expireTx: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  cancelBtn: { borderWidth: 1, borderColor: '#ff4455', borderRadius: 8, padding: 10, alignItems: 'center' },
  cancelBtnTx: { color: '#ff4455', fontWeight: '700' },
  freeBadge: { backgroundColor: '#161f2e', borderRadius: 8, padding: 12 },
  freeTx: { color: '#94a3b8', fontSize: 13 },
  cycleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  cycleBtn: { flex: 1, backgroundColor: '#0f1623', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1e3a5f' },
  cycleBtnOn: { backgroundColor: '#00d4ff22', borderColor: '#00d4ff' },
  cycleTx: { color: '#64748b', fontWeight: '700' },
  cycleTxOn: { color: '#00d4ff' },
  discount: { color: '#00ff88', fontSize: 11 },
  planCard: { backgroundColor: '#0f1623', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 10, position: 'relative' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planName: { fontSize: 16, fontWeight: '700', color: '#e2e8f0' },
  planPrice: { fontSize: 20, fontWeight: '700', color: '#e2e8f0', textAlign: 'right' },
  planMonthly: { color: '#64748b', fontSize: 11, textAlign: 'right' },
  planDesc: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  payBtn: { borderRadius: 8, padding: 12, alignItems: 'center' },
  payBtnTx: { color: '#000', fontWeight: '700', fontSize: 14 },
  bestBadge: { position: 'absolute', top: -10, alignSelf: 'center', backgroundColor: '#00d4ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2 },
  bestTx: { color: '#000', fontSize: 10, fontWeight: '700' },
  notice: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 8 },
  closeWebview: { backgroundColor: '#0f1623', padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e3a5f' },
  closeWebviewTx: { color: '#ff4455', fontWeight: '700' },
});
