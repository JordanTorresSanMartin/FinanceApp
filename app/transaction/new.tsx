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

export default function NewTransactionScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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

  const BG = isDark ? '#0F0F0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const GREEN = '#34C759';
  const RED = '#FF3B30';
  const BLUE = '#007AFF';

  // Type toggle animation
  const toggleAnim = useRef(new Animated.Value(type === 'gasto' ? 0 : 1)).current;
  const togglePos = toggleAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

  // Format with thousands separator while typing (es-CL uses dots)
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

  // ── Fetch real categories from Supabase ──────────────────────────────────────
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCats(true);
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('sort_order');

        if (error) {
          console.warn('[Categories] Supabase error:', error.message);
        } else {
          console.log(`[Categories] Loaded ${data?.length ?? 0} categories from Supabase ✅`);
          setCategories(data || []);
        }
      } catch (e) {
        console.error('[Categories] Unexpected error:', e);
      } finally {
        setLoadingCats(false);
      }
    };

    fetchCategories();
  }, []);

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

  const filteredCategories = categories.filter(
    c => c.type === type || c.type === 'ambos'
  );

  const activeColor = type === 'gasto' ? RED : GREEN;

  return (
    <View style={[styles.screen, { backgroundColor: BG }]}>
      {/* ── Static header (outside ScrollView) ── */}
      <View style={[styles.header, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Ionicons name="close" size={24} color={TEXT} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: TEXT }]}>Nueva Transacción</Text>

        <FeedbackButton
          label="Guardar"
          successLabel="Guardado"
          status={buttonStatus}
          onPress={handleSave}
          color={activeColor}
          style={styles.saveBtn}
        />
      </View>

      {/* ── Scrollable form ── */}
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

          {/* Amount hero input */}
          <View style={[styles.amountCard, { backgroundColor: CARD }]}>
            <Text style={[styles.amountPrefix, { color: TEXT2 }]}>CLP</Text>
            <TextInput
              style={[styles.amountInput, { color: activeColor }]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={isDark ? '#3A3A3C' : '#C7C7CC'}
              value={amount}
              onChangeText={t => setAmount(formatAmountInput(t))}
              autoFocus
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
            <Pressable
              onPress={() => setQuickDate(0)}
              style={[styles.dateChip, { backgroundColor: isToday ? `${BLUE}18` : 'transparent', borderColor: isToday ? BLUE : BORDER }]}
            >
              <Text style={[styles.dateChipText, { color: isToday ? BLUE : TEXT2 }]}>Hoy</Text>
            </Pressable>
            <Pressable
              onPress={() => setQuickDate(1)}
              style={[styles.dateChip, { backgroundColor: isYesterday ? `${BLUE}18` : 'transparent', borderColor: isYesterday ? BLUE : BORDER }]}
            >
              <Text style={[styles.dateChipText, { color: isYesterday ? BLUE : TEXT2 }]}>Ayer</Text>
            </Pressable>
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: TEXT }]}>Categoría</Text>
            {loadingCats && <ActivityIndicator size="small" color={BLUE} />}
          </View>

          {!loadingCats && filteredCategories.length === 0 && (
            <View style={[styles.emptyCats, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Ionicons name="folder-open-outline" size={32} color={TEXT2} />
              <Text style={[styles.emptyCatsText, { color: TEXT2 }]}>
                No hay categorías disponibles.{'\n'}Agrégalas desde Supabase.
              </Text>
            </View>
          )}

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

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header — stays fixed outside ScrollView
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, minWidth: 80, alignItems: 'center',
  },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  form: { padding: 20, gap: 14 },

  // Type toggle
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

  // Amount
  amountCard: {
    borderRadius: 20, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
  },
  amountPrefix: { fontSize: 14, fontWeight: '600', marginBottom: 4, letterSpacing: 1 },
  amountInput: { fontSize: 52, fontWeight: '800', letterSpacing: -2, textAlign: 'center', minWidth: 120 },

  // Text inputs
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  inputIcon: { marginRight: 12 },
  inputField: { flex: 1, fontSize: 16 },
  dateChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, marginLeft: 6,
  },
  dateChipText: { fontSize: 13, fontWeight: '600' },

  // Categories
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

  // Empty state
  emptyCats: {
    alignItems: 'center', justifyContent: 'center', padding: 24,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  emptyCatsText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },

  // Notes
  notesBox: {
    flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, minHeight: 90,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  notesInput: { flex: 1, fontSize: 15, lineHeight: 22 },
});
