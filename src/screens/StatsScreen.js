import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const VIEWS = [
  { key: 'day', label: '📅 일별' },
  { key: 'hourly', label: '⏰ 시간대별' },
  { key: 'month', label: '📆 월별' },
  { key: 'year', label: '🗓 연별' },
];

function pad(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function thisYear() { return String(new Date().getFullYear()); }

export default function StatsScreen() {
  const { authFetch } = useAuth();
  const [view, setView] = useState('day');
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(thisMonth());
  const [year, setYear] = useState(thisYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function query() {
    let url = '';
    if (view === 'day') url = `/api/stats2/day/${date}`;
    else if (view === 'hourly') url = `/api/stats2/hourly/${month}`;
    else if (view === 'month') url = `/api/stats2/month/${month}`;
    else url = `/api/stats2/year/${year}`;
    setLoading(true);
    try {
      const r = await authFetch(url);
      const d = await r.json();
      setData(d);
    } catch (e) { Alert.alert('오류', '조회 실패'); }
    setLoading(false);
  }

  const keys = data ? Object.keys(data).sort() : [];
  const vals = keys.map(k => data[k].n > 0 ? data[k].on / data[k].n : 0);
  const maxVal = Math.max(...vals, 1);
  const totalOn = vals.reduce((a, v) => a + v, 0);
  const avgOn = keys.length > 0 ? (totalOn / keys.length).toFixed(1) : 0;
  const maxOn = Math.max(...vals, 0).toFixed(1);
  const peakKey = keys[vals.indexOf(Math.max(...vals))] || '-';
  const peakLabel = view === 'day' || view === 'hourly' ? peakKey + '시' : view === 'month' ? peakKey?.slice(5) + '일' : peakKey;

  return (
    <View style={s.container}>
      {/* 뷰 선택 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.viewBar}>
        {VIEWS.map(v => (
          <TouchableOpacity key={v.key} style={[s.viewBtn, view === v.key && s.viewBtnOn]} onPress={() => setView(v.key)}>
            <Text style={[s.viewBtnTx, view === v.key && s.viewBtnTxOn]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll}>
        {/* 날짜 입력 */}
        <View style={s.filterSec}>
          {view === 'day' && (
            <View style={s.filterRow}>
              <Text style={s.filterLabel}>날짜</Text>
              <Text style={s.filterVal}>{date}</Text>
              <View style={s.dateNav}>
                <TouchableOpacity style={s.navBtn} onPress={() => {
                  const d = new Date(date); d.setDate(d.getDate()-1);
                  setDate(d.toISOString().slice(0,10));
                }}><Text style={s.navTx}>◀</Text></TouchableOpacity>
                <TouchableOpacity style={s.navBtn} onPress={() => {
                  const d = new Date(date); d.setDate(d.getDate()+1);
                  setDate(d.toISOString().slice(0,10));
                }}><Text style={s.navTx}>▶</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {(view === 'hourly' || view === 'month') && (
            <View style={s.filterRow}>
              <Text style={s.filterLabel}>월</Text>
              <Text style={s.filterVal}>{month}</Text>
              <View style={s.dateNav}>
                <TouchableOpacity style={s.navBtn} onPress={() => {
                  const [y,m] = month.split('-').map(Number);
                  const d = new Date(y, m-2, 1);
                  setMonth(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);
                }}><Text style={s.navTx}>◀</Text></TouchableOpacity>
                <TouchableOpacity style={s.navBtn} onPress={() => {
                  const [y,m] = month.split('-').map(Number);
                  const d = new Date(y, m, 1);
                  setMonth(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);
                }}><Text style={s.navTx}>▶</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {view === 'year' && (
            <View style={s.filterRow}>
              <Text style={s.filterLabel}>연도</Text>
              <Text style={s.filterVal}>{year}년</Text>
              <View style={s.dateNav}>
                <TouchableOpacity style={s.navBtn} onPress={() => setYear(String(parseInt(year)-1))}><Text style={s.navTx}>◀</Text></TouchableOpacity>
                <TouchableOpacity style={s.navBtn} onPress={() => setYear(String(parseInt(year)+1))}><Text style={s.navTx}>▶</Text></TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity style={s.queryBtn} onPress={query} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.queryBtnTx}>📊 조회</Text>}
          </TouchableOpacity>
        </View>

        {/* 요약 카드 */}
        {data && keys.length > 0 && (
          <>
            <View style={s.cards}>
              <View style={s.card}><Text style={s.cardLabel}>평균 온라인</Text><Text style={[s.cardVal, {color:'#ffaa00'}]}>{avgOn}명</Text></View>
              <View style={s.card}><Text style={s.cardLabel}>최대 온라인</Text><Text style={[s.cardVal, {color:'#00ff88'}]}>{maxOn}명</Text></View>
              <View style={s.card}><Text style={s.cardLabel}>피크</Text><Text style={[s.cardVal, {color:'#00d4ff',fontSize:14}]}>{peakLabel}</Text></View>
              <View style={s.card}><Text style={s.cardLabel}>데이터</Text><Text style={[s.cardVal, {color:'#00d4ff'}]}>{keys.length}건</Text></View>
            </View>

            {/* 막대 차트 */}
            <View style={s.chartSec}>
              <Text style={s.secTitle}>📊 온라인 추이</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.chart}>
                  {keys.map((k, i) => {
                    const v = vals[i];
                    const h = Math.max(2, (v / maxVal) * 120);
                    const color = v/maxVal > 0.7 ? '#00ff88' : v/maxVal > 0.4 ? '#00d4ff' : '#0066aa';
                    const label = view === 'day' || view === 'hourly' ? k+'시' : view === 'month' ? k.slice(5) : k.slice(5);
                    return (
                      <View key={k} style={s.barWrap}>
                        <Text style={s.barVal}>{v > 0 ? v.toFixed(0) : ''}</Text>
                        <View style={[s.bar, { height: h, backgroundColor: color }]} />
                        <Text style={s.barLabel}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* 상세 테이블 */}
            <View style={s.tableSec}>
              <Text style={s.secTitle}>📋 상세 데이터</Text>
              <View style={s.tableHeader}>
                <Text style={[s.th, {flex:1.5}]}>기간</Text>
                <Text style={[s.th, {flex:1}]}>평균</Text>
                <Text style={[s.th, {flex:1}]}>샘플</Text>
                <Text style={[s.th, {flex:1}]}>가동률</Text>
              </View>
              {keys.map(k => {
                const d = data[k];
                const avg = d.n > 0 ? (d.on/d.n).toFixed(1) : '-';
                const rate = d.tot > 0 ? Math.round(d.on/d.tot*100)+'%' : '-';
                const isMax = k === peakKey;
                const label = view === 'day' || view === 'hourly' ? k+'시' : view === 'month' ? k.slice(5)+'일' : k;
                return (
                  <View key={k} style={[s.tableRow, isMax && s.tableRowMax]}>
                    <Text style={[s.td, {flex:1.5, color: isMax ? '#00d4ff' : '#e2e8f0'}]}>{label}{isMax?' ⭐':''}</Text>
                    <Text style={[s.td, {flex:1, color:'#00ff88'}]}>{avg}</Text>
                    <Text style={[s.td, {flex:1, color:'#94a3b8'}]}>{d.n}</Text>
                    <Text style={[s.td, {flex:1, color:'#ffaa00'}]}>{rate}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {data && keys.length === 0 && (
          <View style={s.empty}><Text style={s.emptyIcon}>📊</Text><Text style={s.emptyTx}>해당 기간의 데이터가 없습니다</Text></View>
        )}
        {!data && <View style={s.empty}><Text style={s.emptyIcon}>📊</Text><Text style={s.emptyTx}>조건 선택 후 조회 버튼을 눌러주세요</Text></View>}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c18' },
  viewBar: { backgroundColor: '#0f1623', borderBottomWidth: 1, borderBottomColor: '#1e3a5f', paddingVertical: 8, paddingHorizontal: 10, maxHeight: 50 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e3a5f', marginRight: 6 },
  viewBtnOn: { backgroundColor: '#00d4ff22', borderColor: '#00d4ff' },
  viewBtnTx: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  viewBtnTxOn: { color: '#00d4ff' },
  scroll: { flex: 1, padding: 12 },
  filterSec: { backgroundColor: '#0f1623', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 12 },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  filterLabel: { color: '#64748b', fontSize: 12, width: 36 },
  filterVal: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', flex: 1 },
  dateNav: { flexDirection: 'row', gap: 6 },
  navBtn: { backgroundColor: '#161f2e', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#1e3a5f' },
  navTx: { color: '#00d4ff', fontSize: 12 },
  queryBtn: { backgroundColor: '#00d4ff', borderRadius: 8, padding: 10, alignItems: 'center' },
  queryBtnTx: { color: '#000', fontWeight: '700', fontSize: 13 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: { flex: 1, minWidth: '45%', backgroundColor: '#0f1623', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1e3a5f', alignItems: 'center' },
  cardLabel: { color: '#64748b', fontSize: 11, marginBottom: 4 },
  cardVal: { fontSize: 20, fontWeight: '700' },
  chartSec: { backgroundColor: '#0f1623', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e3a5f', marginBottom: 12 },
  secTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 13, marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 3 },
  barWrap: { alignItems: 'center', minWidth: 28 },
  barVal: { color: '#64748b', fontSize: 8, marginBottom: 2 },
  bar: { width: 20, borderRadius: 3 },
  barLabel: { color: '#64748b', fontSize: 8, marginTop: 4 },
  tableSec: { backgroundColor: '#0f1623', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e3a5f' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e3a5f', paddingBottom: 8, marginBottom: 4 },
  th: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0f1623' },
  tableRowMax: { backgroundColor: 'rgba(0,212,255,0.05)' },
  td: { fontSize: 12 },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTx: { color: '#64748b', fontSize: 13, textAlign: 'center' },
});
