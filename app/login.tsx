import { FeedbackButton } from '@/components/ui/FeedbackButton';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView, Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text, TextInput,
    View
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '@/theme';

export default function LoginScreen() {
  const t = useAppTheme();
  const c = t.colors;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos requeridos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error al iniciar sesión', err.message || 'Verifica tu correo y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos requeridos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Contraseña muy corta', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      Alert.alert('¡Registro exitoso!', 'Revisa tu correo para confirmar tu cuenta.');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error al registrarse', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Logo / Header */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: c.primaryContainer }]}>
              <Ionicons name="wallet" size={48} color={c.onPrimaryContainer} />
            </View>
            <Text style={[t.type.displaySmall, { color: c.onSurface, fontWeight: '700' }]}>FinanceApp</Text>
            <Text style={[t.type.bodyLarge, { color: c.onSurfaceVariant, marginTop: 6 }]}>
              {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
            </Text>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: t.elevation[1] }]}>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[t.type.labelLarge, { color: c.onSurfaceVariant }]}>Correo electrónico</Text>
              <View style={[styles.inputRow, { backgroundColor: t.elevation[3] }]}>
                <Ionicons name="mail-outline" size={20} color={c.onSurfaceVariant} />
                <TextInput
                  style={[styles.input, { color: c.onSurface }]}
                  placeholder="tu@email.com"
                  placeholderTextColor={c.onSurfaceVariant}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={[t.type.labelLarge, { color: c.onSurfaceVariant }]}>Contraseña</Text>
              <View style={[styles.inputRow, { backgroundColor: t.elevation[3] }]}>
                <Ionicons name="lock-closed-outline" size={20} color={c.onSurfaceVariant} />
                <TextInput
                  style={[styles.input, { color: c.onSurface }]}
                  placeholder="••••••••"
                  placeholderTextColor={c.onSurfaceVariant}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.onSurfaceVariant} />
                </Pressable>
              </View>
            </View>

            {/* Primary Button */}
            <FeedbackButton
              label={mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              status={loading ? 'loading' : 'idle'}
              onPress={mode === 'login' ? handleLogin : handleRegister}
              color={c.primary}
              onColor={c.onPrimary}
              style={styles.primaryBtn}
              textStyle={styles.primaryBtnText}
            />

            {/* Toggle mode */}
            <Pressable
              style={styles.toggleMode}
              onPress={() => {
                Haptics.selectionAsync();
                setMode(m => m === 'login' ? 'register' : 'login');
              }}
            >
              <Text style={[t.type.bodyMedium, { color: c.onSurfaceVariant }]}>
                {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={{ color: c.primary, fontWeight: '700' }}>
                  {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoContainer: { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 96, height: 96, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },

  card: { borderRadius: 28, padding: 24, gap: 16 },

  fieldGroup: { gap: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, paddingHorizontal: 14, height: 56,
  },
  input: { flex: 1, fontSize: 16 },

  primaryBtn: { height: 56, borderRadius: 999, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 17, fontWeight: '700' },

  toggleMode: { alignItems: 'center', paddingVertical: 4 },
});
