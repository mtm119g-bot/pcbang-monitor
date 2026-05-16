import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, ScrollView } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useAuth } from '../context/AuthContext';

export default function MapScreen() {
  const { authFetch } = useAuth();
  const [pins, setPins] = useState([]);
  const [pinMode, setPinMode] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [pendingCoord, setPendingCoord] = useState(null);
  const [pinName, setPinName] = useState('');
  const [pinMemo, setPinMemo] = useState('');
  const [editPin, setEditPin] = useState(null);

  useEffect(() => { loadPins(); }, []);

  async function loadPins() {
    try {
      const r = await authFetch('/api/map/pins');
      const d = await r.json();
      if (Array.isArray(d)) setPins(d);
    } catch (e) {}
  }

  function onMapPress(e) {
    if (!pinMode) return;
    setPendingCoord(e.nativeEvent.coordinate);
    setPinName('');
    setPinMemo('');
    setEditPin(null);
    setEditModal(true);
  }

  async function savePin() {
    if (!pinName) { Alert.alert('오류', '업체명을 입력해주세요'); return; }
    try {
      if (editPin) {
        await authFetch(`/api/map/pins/${editPin._id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: pinName, memo: pinMemo })
        });
      } else {
        await authFetch('/api/map/pins', {
          method: 'POST',
          body: JSON.stringify({ name: pinName, memo: pinMemo, lat: pendingCoord.latitude, lng: pendingCoord.longitude })
        });
      }
      setEditModal(false);
      setPinMode(false);
      loadPins();
    } catch (e) { Alert.alert('오류', '저장 실패'); }
  }

  async function deletePin(id) {
    Alert.alert('삭제', '핀을 삭제할까요?', [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        await authFetch(`/api/map/pins/${id}`, { method: 'DELETE' });
        loadPins();
      }}
    ]);
  }

  return (
    <View style={s.container}>
      <MapView style={s.map}
        initialRegion={{ latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        onPress={onMapPress}>
        {pins.map(pin => (
          <Marker key={pin._id} coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor="#00d4ff">
            <Callout onPress={() => {
              setEditPin(pin); setPinName(pin.name); setPinMemo(pin.memo||''); setEditModal(true);
            }}>
              <View style={s.callout}>
                <Text style={s.calloutName}>{pin.name}</Text>
                {pin.memo ? <Text style={s.calloutMemo}>{pin.memo}</Text> : null}
                <Text style={s.calloutEdit}>탭하여 편집</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* 핀 모드 버튼 */}
      <View style={s.btnWrap}>
        <TouchableOpacity style={[s.pinBtn, pinMode && s.pinBtnOn]} onPress={() => setPinMode(!pinMode)}>
          <Text style={s.pinBtnTx}>{pinMode ? '📍 탭하여 핀 추가' : '📌 핀 추가 모드'}</Text>
        </TouchableOpacity>
        <Text style={s.pinCount}>총 {pins.length}개 업체</Text>
      </View>

      {/* 편집 모달 */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{editPin ? '📍 핀 편집' : '📍 새 핀 추가'}</Text>
            <TextInput style={s.input} placeholder="업체명 *" placeholderTextColor="#64748b"
              value={pinName} onChangeText={setPinName} />
            <TextInput style={[s.input, s.inputArea]} placeholder="메모 (선택)" placeholderTextColor="#64748b"
              value={pinMemo} onChangeText={setPinMemo} multiline numberOfLines={3} />
            <View style={s.modalBtns}>
              {editPin && (
                <TouchableOpacity style={s.delBtn} onPress={() => { setEditModal(false); deletePin(editPin._id); }}>
                  <Text style={s.delBtnTx}>🗑 삭제</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={s.cancelBtnTx}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={savePin}>
                <Text style={s.saveBtnTx}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  btnWrap: { position: 'absolute', bottom: 20, left: 16, right: 16, alignItems: 'center', gap: 6 },
  pinBtn: { backgroundColor: '#0f1623ee', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: '#1e3a5f' },
  pinBtnOn: { backgroundColor: '#00d4ff22', borderColor: '#00d4ff' },
  pinBtnTx: { color: '#00d4ff', fontWeight: '700', fontSize: 13 },
  pinCount: { color: '#94a3b8', fontSize: 11 },
  callout: { padding: 8, minWidth: 120 },
  calloutName: { fontWeight: '700', fontSize: 14, color: '#000', marginBottom: 2 },
  calloutMemo: { fontSize: 12, color: '#666', marginBottom: 4 },
  calloutEdit: { fontSize: 10, color: '#00aaff' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0f1623', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, borderTopWidth: 1, borderColor: '#1e3a5f' },
  modalTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, marginBottom: 16 },
  input: { backgroundColor: '#161f2e', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 8, color: '#e2e8f0', padding: 12, fontSize: 14, marginBottom: 10 },
  inputArea: { height: 80, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  delBtn: { flex: 1, backgroundColor: '#ff445520', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ff4455' },
  delBtnTx: { color: '#ff4455', fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: '#161f2e', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e3a5f' },
  cancelBtnTx: { color: '#94a3b8', fontWeight: '700' },
  saveBtn: { flex: 2, backgroundColor: '#00d4ff', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveBtnTx: { color: '#000', fontWeight: '700' },
});
