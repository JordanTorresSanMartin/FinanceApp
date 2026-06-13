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

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useAppTheme();
  const c = t.colors;
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

  const toggleAnim = useRef(new Animated.Value(0)).current;
  const togglePos = toggleAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

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

  const filteredCategories = categories.filter(cat => cat.type === type || cat.type === 'ambos');
  const activeColor = type === 'gasto' ? c.expense : c.income;
  const onActive = type === 'gasto' ? c.onExpense : c.onIncome;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

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

        <Text style={[t.type.titleLarge, { color: c.onSurface }]}>Editar transacción</Text>

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
          {/* Source badge for imported transactions */}
          {source && (
            <View style={[styles.sourceBadge, { backgroundColor: c.primary + '14', borderColor: c.primary + '30' }]}>
              <Ionicons name="mail-outline" size={14} color={c.primary} />
              <Text style={[t.type.labelMedium, { color: c.primary }]}>
                Importada automáticamente desde {source}
              </Text>
            </View>
          )}

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

          {/* Amount */}
          <View style={[styles.amountCard, { backgroundColor: t.elevation[1] }]}>
            <Text style={[styles.amountPrefix, { color: c.onSurfaceVariant }]}>CLP</Text>
            <TextInput
              style={[styles.amountInput, { color: activeColor }]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={c.outlineVariant}
              value={amount}
              onChangeText={v => setAmount(formatAmountInput(v))}
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
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={[t.type.titleMedium, { color: c.onSurface }]}>Categoría</Text>
          </View>

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

          {/* Delete button */}
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: c.errorContainer, opacity: pressed || deleting ? 0.6 : 1 }
            ]}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={c.onErrorContainer} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={c.onErrorContainer} />
                <Text style={[t.type.titleSmall, { color: c.onErrorContainer }]}>Eliminar transacción</Text>
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

  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start',
  },

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

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  catsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1.5,
  },
  catChipIcon: { width: 34, height: 34, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  catCheck: { marginLeft: 4 },

  notesBox: { flexDirection: 'row', borderRadius: 20, padding: 16, minHeight: 96 },
  notesInput: { flex: 1, fontSize: 15, lineHeight: 22 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: 999, marginTop: 10,
  },
});
