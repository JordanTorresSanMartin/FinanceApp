import { ButtonStatus, FeedbackButton } from '@/components/ui/FeedbackButton';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated, KeyboardAvoidingView, Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text, TextInput,
    useColorScheme,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Category } from '../../types/finance';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [txDate, setTxDate] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'ingreso' | 'gasto'>('gasto');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [buttonStatus, setButtonStatus] = useState<ButtonStatus>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const GREEN = '#34C759';
  const RED = '#FF3B30';
  const BLUE = '#007AFF';

  const toggleAnim = useRef(new Animated.Value(0)).current;
  const togglePos = toggleAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

  // Format with thousands separator (es-CL uses dots)
  const formatAmountInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return '';
    return parseInt(digits, 10).toLocaleString('es-CL');
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [{ data: tx, error: txError }, { data: cats }] = await Promise.all([
          supabase.from('transactions').select('*').eq('id', id).single(),
          supabase.from('categories').select('*').order('sort_order'),
        ]);
        if (txError || !tx) {
          Alert.alert('Error', 'No se encontró la transacción.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
          return;
        }
        setTxDate(tx.date);
        setDescription(tx.description);
        setType(tx.type);
        setAmount(formatAmountInput(String(Math.round(tx.amount))));
        setCategoryId(tx.category_id);
        setNotes(tx.notes || '');
        setSource(tx.source || null);
        setCategories(cats || []);
        toggleAnim.setValue(tx.type === 'gasto' ? 0 : 1);
      } catch (e) {
        console.error('[EditTx] Error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  const handleTypeChange = (t: 'ingreso' | 'gasto') => {
    Haptics.selectionAsync();
    setType(t);
    setCategoryId(null);
    Animated.spring(toggleAnim, {
      toValue: t === 'gasto' ? 0 : 1,
      useNativeDriver: false,
      tension: 120,
      friction: 10,
    }).start();
  };

  const getValidIcon = (name: string): any => {
    const map: Record<string, string> = {
      'dots-horizontal': 'ellipsis-horizontal',
      'credit-card': 'card-outline',
      'wrench': 'build-outline',
    };
    return map[name] || name || 'ellipse-outline';
  };

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa una descripción.');
      return;
    }
    const numericAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!amount || numericAmount <= 0) {
      Alert.alert('Monto inválido', 'El monto debe ser mayor a 0.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Campo requerido', 'Por favor selecciona una categoría.');
      return;
    }

    setButtonStatus('loading');
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          date: txDate,
          description: description.trim(),
          category_id: categoryId,
          type,
          amount: numericAmount,
          notes: notes.trim() || null,
        })
        .eq('id', id);

      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setButtonStatus('success');
      await new Promise(resolve => setTimeout(resolve, 600));
      router.back();
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setButtonStatus('idle');
      Alert.alert('Error al guardar', err.message || 'Verifica tu conexión e intenta de nuevo.');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar transacción',
      `¿Seguro que quieres eliminar "${description}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const { error } = await supabase.from('transactions').delete().eq('id', id);
              if (error) throw error;
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err: any) {
              setDeleting(false);
              Alert.alert('Error', err.message || 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  };

  const filteredCategories = categories.filter(c => c.type === type || c.type === 'ambos');
  const activeColor = type === 'gasto' ? RED : GREEN;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={BLUE} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: BG }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Ionicons name="close" size={24} color={TEXT} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: TEXT }]}>Editar Transacción</Text>

        <FeedbackButton
          label="Guardar"
          successLabel="Guardado"
          status={buttonStatus}
          onPress={handleSave}
          color={activeColor}
          style={styles.saveBtn}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Source badge for imported transactions */}
          {source && (
            <View style={[styles.sourceBadge, { backgroundColor: `${BLUE}14`, borderColor: `${BLUE}30` }]}>
              <Ionicons name="mail-outline" size={14} color={BLUE} />
              <Text style={[styles.sourceBadgeText, { color: BLUE }]}>
                Importada automáticamente desde {source}
              </Text>
            </View>
          )}

          {/* Type toggle */}
          <View style={[styles.toggleTrack, { backgroundColor: isDark ? '#2C2C2E' : '#E9E9EB' }]}>
            <Animated.View style={[styles.toggleThumb, { left: togglePos, backgroundColor: activeColor }]} />
            <Pressable style={styles.toggleHalf} onPress={() => handleTypeChange('gasto')}>
              <Ionicons name="arrow-up-circle" size={18} color={type === 'gasto' ? '#FFF' : TEXT2} />
              <Text style={[styles.toggleLabel, { color: type === 'gasto' ? '#FFF' : TEXT2 }]}>Gasto</Text>
            </Pressable>
            <Pressable style={styles.toggleHalf} onPress={() => handleTypeChange('ingreso')}>
              <Ionicons name="arrow-down-circle" size={18} color={type === 'ingreso' ? '#FFF' : TEXT2} />
              <Text style={[styles.toggleLabel, { color: type === 'ingreso' ? '#FFF' : TEXT2 }]}>Ingreso</Text>
            </Pressable>
          </View>

          {/* Amount */}
          <View style={[styles.amountCard, { backgroundColor: CARD }]}>
            <Text style={[styles.amountPrefix, { color: TEXT2 }]}>CLP</Text>
            <TextInput
              style={[styles.amountInput, { color: activeColor }]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={isDark ? '#3A3A3C' : '#C7C7CC'}
              value={amount}
              onChangeText={t => setAmount(formatAmountInput(t))}
            />
          </View>

          {/* Description */}
          <View style={[styles.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Ionicons name="pencil-outline" size={20} color={TEXT2} style={styles.inputIcon} />
            <TextInput
              style={[styles.inputField, { color: TEXT }]}
              placeholder="Descripción"
              placeholderTextColor={TEXT2}
              value={description}
              onChangeText={setDescription}
              returnKeyType="next"
            />
          </View>

          {/* Date */}
          <View style={[styles.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Ionicons name="calendar-outline" size={20} color={TEXT2} style={styles.inputIcon} />
            <TextInput
              style={[styles.inputField, { color: TEXT }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={TEXT2}
              value={txDate}
              onChangeText={setTxDate}
            />
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: TEXT }]}>Categoría</Text>
          </View>

          <View style={styles.catsGrid}>
            {filteredCategories.map(cat => {
              const selected = categoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  style={({ pressed }) => [
                    styles.catChip,
                    {
                      backgroundColor: selected ? `${cat.color}18` : CARD,
                      borderColor: selected ? cat.color : BORDER,
                      opacity: pressed ? 0.75 : 1,
                    }
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategoryId(cat.id);
                  }}
                >
                  <View style={[styles.catChipIcon, { backgroundColor: `${cat.color}20` }]}>
                    <Ionicons name={getValidIcon(cat.icon)} size={22} color={cat.color} />
                  </View>
                  <Text style={[styles.catChipLabel, { color: TEXT }]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={16} color={cat.color} style={styles.catCheck} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Notes */}
          <View style={[styles.notesBox, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Ionicons name="document-text-outline" size={20} color={TEXT2} style={{ marginRight: 10, marginTop: 2 }} />
            <TextInput
              style={[styles.notesInput, { color: TEXT }]}
              placeholder="Notas (opcional)"
              placeholderTextColor={TEXT2}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Delete button */}
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: `${RED}14`, borderColor: `${RED}40`, opacity: pressed || deleting ? 0.6 : 1 }
            ]}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={RED} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={RED} />
                <Text style={[styles.deleteBtnText, { color: RED }]}>Eliminar transacción</Text>
              </>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, minWidth: 80, alignItems: 'center',
  },

  form: { padding: 20, gap: 14 },

  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start',
  },
  sourceBadgeText: { fontSize: 12, fontWeight: '600' },

  toggleTrack: {
    flexDirection: 'row', borderRadius: 14, padding: 4,
    height: 52, position: 'relative', overflow: 'hidden',
  },
  toggleThumb: {
    position: 'absolute', top: 4, bottom: 4,
    width: '50%', borderRadius: 10,
  },
  toggleHalf: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, zIndex: 1,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600' },

  amountCard: {
    borderRadius: 20, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
  },
  amountPrefix: { fontSize: 14, fontWeight: '600', marginBottom: 4, letterSpacing: 1 },
  amountInput: { fontSize: 52, fontWeight: '800', letterSpacing: -2, textAlign: 'center', minWidth: 120 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  inputIcon: { marginRight: 12 },
  inputField: { flex: 1, fontSize: 16 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4, marginBottom: 4,
  },
  sectionLabel: { fontSize: 16, fontWeight: '700' },
  catsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  catChipIcon: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  catChipLabel: { fontSize: 14, fontWeight: '500', maxWidth: 90 },
  catCheck: { marginLeft: 4 },

  notesBox: {
    flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, minHeight: 90,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  notesInput: { flex: 1, fontSize: 15, lineHeight: 22 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 14, borderWidth: 1, marginTop: 10,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700' },
});
