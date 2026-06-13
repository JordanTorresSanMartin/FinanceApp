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
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Category } from '../../types/finance';
import { useAppTheme } from '@/theme';

export default function NewTransactionScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const router = useRouter();

  // Tipo inicial recibido desde el widget de Android (?type=gasto|ingreso)
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const initialType: 'ingreso' | 'gasto' = typeParam === 'ingreso' ? 'ingreso' : 'gasto';

  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'ingreso' | 'gasto'>(initialType);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [buttonStatus, setButtonStatus] = useState<ButtonStatus>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  // Type toggle animation
  const toggleAnim = useRef(new Animated.Value(type === 'gasto' ? 0 : 1)).current;
  const togglePos = toggleAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

  const formatAmountInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return '';
    return parseInt(digits, 10).toLocaleString('es-CL');
  };

  const toISO = (d: Date) => d.toISOString().split('T')[0];
  const setQuickDate = (offsetDays: number) => {
    Haptics.selectionAsync();
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    setTxDate(toISO(d));
  };
  const isToday = txDate === toISO(new Date());
  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const isYesterday = txDate === toISO(yesterdayDate);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCats(true);
        const { data, error } = await supabase.from('categories').select('*').order('sort_order');
        if (error) console.warn('[Categories] Supabase error:', error.message);
        else setCategories(data || []);
      } catch (e) {
        console.error('[Categories] Unexpected error:', e);
      } finally {
        setLoadingCats(false);
      }
    };
    fetchCategories();
  }, []);

  const handleTypeChange = (newType: 'ingreso' | 'gasto') => {
    Haptics.selectionAsync();
    setType(newType);
    setCategoryId(null);
    Animated.spring(toggleAnim, {
      toValue: newType === 'gasto' ? 0 : 1,
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setButtonStatus('idle');
        Alert.alert('Sesión expirada', 'Por favor inicia sesión de nuevo.');
        return;
      }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        date: txDate,
        description: description.trim(),
        category_id: categoryId,
        type,
        amount: numericAmount,
        notes: notes.trim() || null,
      });

      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setButtonStatus('success');
      await new Promise(resolve => setTimeout(resolve, 700));
      router.back();
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setButtonStatus('idle');
      Alert.alert('Error al guardar', err.message || 'Verifica tu conexión e intenta de nuevo.');
    }
  };

  const filteredCategories = categories.filter(cat => cat.type === type || cat.type === 'ambos');
  const activeColor = type === 'gasto' ? c.expense : c.income;
  const onActive = type === 'gasto' ? c.onExpense : c.onIncome;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: c.surface }]}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={({ pressed }) => [styles.headerBtn, { backgroundColor: t.elevation[3], opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close" size={24} color={c.onSurface} />
        </Pressable>

        <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Nueva transacción</Text>

        <FeedbackButton
          label="Guardar"
          successLabel="Guardado"
          status={buttonStatus}
          onPress={handleSave}
          color={activeColor}
          onColor={onActive}
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
          {/* Type toggle */}
          <View style={[styles.toggleTrack, { backgroundColor: t.elevation[2] }]}>
            <Animated.View style={[styles.toggleThumb, { left: togglePos, backgroundColor: activeColor }]} />
            <Pressable style={styles.toggleHalf} onPress={() => handleTypeChange('gasto')}>
              <Ionicons name="arrow-up-circle" size={18} color={type === 'gasto' ? onActive : c.onSurfaceVariant} />
              <Text style={[t.type.titleSmall, { color: type === 'gasto' ? onActive : c.onSurfaceVariant }]}>Gasto</Text>
            </Pressable>
            <Pressable style={styles.toggleHalf} onPress={() => handleTypeChange('ingreso')}>
              <Ionicons name="arrow-down-circle" size={18} color={type === 'ingreso' ? onActive : c.onSurfaceVariant} />
              <Text style={[t.type.titleSmall, { color: type === 'ingreso' ? onActive : c.onSurfaceVariant }]}>Ingreso</Text>
            </Pressable>
          </View>

          {/* Amount hero input */}
          <View style={[styles.amountCard, { backgroundColor: t.elevation[1] }]}>
            <Text style={[styles.amountPrefix, { color: c.onSurfaceVariant }]}>CLP</Text>
            <TextInput
              style={[styles.amountInput, { color: activeColor }]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={c.outlineVariant}
              value={amount}
              onChangeText={v => setAmount(formatAmountInput(v))}
              autoFocus
            />
          </View>

          {/* Description */}
          <View style={[styles.inputRow, { backgroundColor: t.elevation[1] }]}>
            <Ionicons name="pencil-outline" size={20} color={c.onSurfaceVariant} style={styles.inputIcon} />
            <TextInput
              style={[styles.inputField, { color: c.onSurface }]}
              placeholder="Descripción"
              placeholderTextColor={c.onSurfaceVariant}
              value={description}
              onChangeText={setDescription}
              returnKeyType="next"
            />
          </View>

          {/* Date */}
          <View style={[styles.inputRow, { backgroundColor: t.elevation[1] }]}>
            <Ionicons name="calendar-outline" size={20} color={c.onSurfaceVariant} style={styles.inputIcon} />
            <TextInput
              style={[styles.inputField, { color: c.onSurface }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={c.onSurfaceVariant}
              value={txDate}
              onChangeText={setTxDate}
            />
            <Pressable
              onPress={() => setQuickDate(0)}
              style={[styles.dateChip, { backgroundColor: isToday ? c.primary + '1F' : 'transparent', borderColor: isToday ? c.primary : c.outlineVariant }]}
            >
              <Text style={[t.type.labelMedium, { color: isToday ? c.primary : c.onSurfaceVariant }]}>Hoy</Text>
            </Pressable>
            <Pressable
              onPress={() => setQuickDate(1)}
              style={[styles.dateChip, { backgroundColor: isYesterday ? c.primary + '1F' : 'transparent', borderColor: isYesterday ? c.primary : c.outlineVariant }]}
            >
              <Text style={[t.type.labelMedium, { color: isYesterday ? c.primary : c.onSurfaceVariant }]}>Ayer</Text>
            </Pressable>
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Categoría</Text>
            {loadingCats && <ActivityIndicator size="small" color={c.primary} />}
          </View>

          {!loadingCats && filteredCategories.length === 0 && (
            <View style={[styles.emptyCats, { backgroundColor: t.elevation[1] }]}>
              <Ionicons name="folder-open-outline" size={32} color={c.onSurfaceVariant} />
              <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
                No hay categorías disponibles.{'\n'}Agrégalas desde Supabase.
              </Text>
            </View>
          )}

          <View style={styles.catsGrid}>
            {filteredCategories.map(cat => {
              const selected = categoryId === cat.id;
              const catColor = cat.color || c.primary;
              return (
                <Pressable
                  key={cat.id}
                  style={({ pressed }) => [
                    styles.catChip,
                    {
                      backgroundColor: selected ? catColor + '22' : t.elevation[1],
                      borderColor: selected ? catColor : 'transparent',
                      opacity: pressed ? 0.75 : 1,
                    }
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setCategoryId(cat.id); }}
                >
                  <View style={[styles.catChipIcon, { backgroundColor: catColor + '22' }]}>
                    <Ionicons name={getValidIcon(cat.icon)} size={22} color={catColor} />
                  </View>
                  <Text style={[t.type.labelLarge, { color: c.onSurface, maxWidth: 90 }]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={16} color={catColor} style={styles.catCheck} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Notes */}
          <View style={[styles.notesBox, { backgroundColor: t.elevation[1] }]}>
            <Ionicons name="document-text-outline" size={20} color={c.onSurfaceVariant} style={{ marginRight: 10, marginTop: 2 }} />
            <TextInput
              style={[styles.notesInput, { color: c.onSurface }]}
              placeholder="Notas (opcional)"
              placeholderTextColor={c.onSurfaceVariant}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
            />
          </View>

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
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 999,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, minWidth: 84, alignItems: 'center',
  },

  form: { padding: 20, gap: 14 },

  // Type toggle — shape full
  toggleTrack: {
    flexDirection: 'row', borderRadius: 999, padding: 4,
    height: 52, position: 'relative', overflow: 'hidden',
  },
  toggleThumb: { position: 'absolute', top: 4, bottom: 4, width: '50%', borderRadius: 999 },
  toggleHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 1 },

  amountCard: { borderRadius: 28, padding: 24, alignItems: 'center' },
  amountPrefix: { fontSize: 14, fontWeight: '600', marginBottom: 4, letterSpacing: 1 },
  amountInput: { fontSize: 52, fontWeight: '800', letterSpacing: -2, textAlign: 'center', minWidth: 120 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    paddingHorizontal: 16, height: 56,
  },
  inputIcon: { marginRight: 12 },
  inputField: { flex: 1, fontSize: 16 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, marginLeft: 6 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  catsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1.5,
  },
  catChipIcon: { width: 34, height: 34, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  catCheck: { marginLeft: 4 },

  emptyCats: { alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 20, gap: 8 },

  notesBox: { flexDirection: 'row', borderRadius: 20, padding: 16, minHeight: 96 },
  notesInput: { flex: 1, fontSize: 15, lineHeight: 22 },
});
