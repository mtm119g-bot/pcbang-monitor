import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function MonitorScreen() {
  const { authFetch } = useAuth();
  const [bizList, setBizList] = useState([]);
  const [results, setResults] = useState({});
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoInterval, setAutoInterval] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    loadData();
    loadAutoScan();
    startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling() {
    pollRef.current = setInterval(fetchResults, 10000);
  }

  async function loadData() {
    try {
      const r = await authFetch('/api/biz');
      const list = await r.json();
      if (Array.isArray(list)) setBizList(list);
      fetchResults();
    } catch (e) {}
  }

  async function loadAutoScan() {
    try {
      const r = await authFetch('/api/auto-scan');
      const d = await r.json();
      setAutoInterval(d.intervalMs || 0);
    } catch (e) {}
  }

  async function fetchResults() {
    try {
      const r = await authFetch('/api/results');
      const d = await r.json();
      if (d && d.results) {
        setResults(d.results);
        setLastScan(d.lastScan);
      }
    } catch (e) {}
  }

  async function requestScan() {
    setScanning(true);
    try {
      await authFetch('/api/scan', { method: 'POST' });
      setTimeout(fetchResults, 3000);
      setTimeout(fetchResults, 8000);
    } catch (e) { Alert.alert('오류', '스캔 요청 실패'); }
    setTimeout(() => setScanning(false), 5000);
  }

  async function setAutoScan(ms) {
    try {
      await authFetch('/api/auto-scan', { method: 'POST', body: JSON.stringify({ intervalMs: ms }) });
      setAutoInterval(ms);
    } catch (e) {}
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchResults();
    setRefreshing(false);
  }

  const allIPs = Object.values(results);
  const onCount = allIPs.filter(r => r.status === 'online' || r.status === 'warn').length;
  const totalCount = allIPs.length;

  function getBizResults(bizId) {
    return Object.values(results).filter(r => String(r.bizId) === String(bizId));
  }

  return (
    <View style={s.container}>
      {/* 헤더 상태 */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerTitle}>모니터</Text>
          <Text style={s.headerSub}>
            <Text style={s.onCount}>{onCount}</Text>
            <Text style={s.totalCount}>/{totalCount}</Text>
          </Text>
        </View>
        <TouchableOpacity style={[s.scanBtn, scanning && s.scanBtnActive]} onPress={requestScan} disabled={scanning}>
          {scanning ? <ActivityIndicator size="small" color="#000" /> :
            <Text style={s.scanBtnTx}>🔍 스캔</Text>}
        </TouchableOpacity>
      </View>

      {/* 자동스캔 버튼 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.autoBar}>
        {[
          { label: 'OFF', ms: 0 },
          { label: '30분', ms: 1800000 },
          { label: '1시간', ms: 3600000 },
          { label: '2시간', ms: 7200000 },
        ].map(item => (
          <TouchableOpacity key={item.ms} style={[s.autoBtn, autoInterval === item.ms && s.autoBtnOn]}
            onPress={() => setAutoScan(item.ms)}>
            <Text style={[s.autoBtnTx, autoInterval === item.ms && s.autoBtnTxOn]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        {lastScan && <Text style={s.lastScanTx}>마지막: {new Date(lastScan).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})}</Text>}
      </ScrollView>

      {/* 업체별 패널 */}
      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d4ff" />}>
        {bizList.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyIcon}>📡</Text><Text style={s.emptyTx}>설정 탭에서 업체와 IP를 추가해주세요</Text></View>
        ) : (
          bizList.map(biz => {
            const bizResults = getBizResults(biz._id);
            const bon = bizResults.filter(r => r.status === 'online' || r.status === 'warn').length;
            const boff = bizResults.filter(r => r.status === 'offline').length;
            const rate = bizResults.length ? Math.round(bon / bizResults.length * 100) : 0;
            const rateColor = rate >= 80 ? '#00ff88' : rate >= 50 ? '#ffaa00' : '#ff4455';
            return (
              <View key={biz._id} style={s.panel}>
                <View style={s.panelHeader}>
                  <View style={s.panelLeft}>
                    <View style={[s.dot, { backgroundColor: biz.color || '#00d4ff' }]} />
                    <Text style={s.panelName}>{biz.name}</Text>
                  </View>
                  <View style={s.panelStats}>
                    <Text style={s.statOn}>{bon}온</Text>
                    <Text style={s.statOff}>{boff}오프</Text>
                    <Text style={[s.statRate, { color: rateColor }]}>{rate}%</Text>
                  </View>
                </View>
                <View style={s.rateBar}>
                  <View style={[s.rateBarFill, { width: `${rate}%`, backgroundColor: rateColor }]} />
                </View>
                {bizResults.length === 0 ? (
                  <Text style={s.noIP}>IP 없음 - 설정 탭에서 IP를 입력해주세요</Text>
                ) : (
                  <View style={s.ipGrid}>
                    {bizResults.slice(0, 50).map((r, i) => {
                      const color = r.status === 'online' ? '#00ff88' : r.status === 'warn' ? '#ffaa00' : r.status === 'offline' ? '#ff4455' : '#1e3a5f';
                      return (
                        <View key={i} style={[s.ipCell, { borderColor: color }]}>
                          <View style={[s.ipDot, { backgroundColor: color }]} />
                          <Text style={s.ipTx}>{r.ip.split('.').pop()}</Text>
                          {r.ping !== null && <Text style={s.ipPing}>{r.ping}ms</Text>}
                        </View>
                      );
                    })}
                    {bizResults.length > 50 && <Text style={s.more}>+{bizResults.length - 50}개 더</Text>}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#0f1623', borderBottomWidth: 1, borderBottomColor: '#1e3a5f' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#00d4ff' },
  headerSub: { fontSize: 14 },
  onCount: { color: '#00ff88', fontWeight: '700', fontSize: 16 },
  totalCount: { color: '#94a3b8' },
  scanBtn: { backgroundColor: '#00d4ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  scanBtnActive: { backgroundColor: '#0099bb' },
  scanBtnTx: { color: '#000', fontWeight: '700', fontSize: 13 },
  autoBar: { backgroundColor: '#0f1623', borderBottomWidth: 1, borderBottomColor: '#1e3a5f', paddingVertical: 6, paddingHorizontal: 10, maxHeight: 44 },
  autoBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#1e3a5f', marginRight: 6 },
  autoBtnOn: { borderColor: '#00ff88', backgroundColor: 'rgba(0,255,136,0.1)' },
  autoBtnTx: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  autoBtnTxOn: { color: '#00ff88' },
  lastScanTx: { color: '#64748b', fontSize: 11, alignSelf: 'center', marginLeft: 8 },
  scroll: { flex: 1 },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTx: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  panel: { margin: 10, marginBottom: 0, backgroundColor: '#0f1623', borderRadius: 12, borderWidth: 1, borderColor: '#1e3a5f', overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  panelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  panelName: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  panelStats: { flexDirection: 'row', gap: 8 },
  statOn: { color: '#00ff88', fontSize: 12, fontWeight: '700' },
  statOff: { color: '#ff4455', fontSize: 12, fontWeight: '700' },
  statRate: { fontSize: 14, fontWeight: '700' },
  rateBar: { height: 3, backgroundColor: '#161f2e', marginHorizontal: 12 },
  rateBarFill: { height: 3, borderRadius: 2 },
  noIP: { color: '#64748b', fontSize: 12, padding: 12, textAlign: 'center' },
  ipGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 4 },
  ipCell: { borderWidth: 1, borderRadius: 4, padding: 4, minWidth: 52, alignItems: 'center' },
  ipDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  ipTx: { color: '#e2e8f0', fontSize: 10 },
  ipPing: { color: '#64748b', fontSize: 9 },
  more: { color: '#64748b', fontSize: 11, padding: 8 },
});
