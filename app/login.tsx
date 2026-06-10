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
    useColorScheme,
    View
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const BG = isDark ? '#0A0A0F' : '#F4F6FB';
  const CARD = isDark ? '#1C1C1E' : '#FFFFFF';
  const TEXT = isDark ? '#F2F2F7' : '#1C1C1E';
  const TEXT2 = isDark ? '#8E8E93' : '#6C6C70';
  const BORDER = isDark ? '#2C2C2E' : '#E5E5EA';
  const BLUE = '#007AFF';

  // Fade-in animations
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
      // Navigation is handled by the root layout via session listener
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
      style={[styles.screen, { backgroundColor: BG }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Logo / Header */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: BLUE + '20' }]}>
              <Ionicons name="wallet" size={48} color={BLUE} />
            </View>
            <Text style={[styles.appName, { color: TEXT }]}>FinanceApp</Text>
            <Text style={[styles.appSubtitle, { color: TEXT2 }]}>
              {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
            </Text>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: TEXT2 }]}>Correo electrónico</Text>
              <View style={[styles.inputRow, { borderColor: BORDER, backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}>
                <Ionicons name="mail-outline" size={20} color={TEXT2} />
                <TextInput
                  style={[styles.input, { color: TEXT }]}
                  placeholder="tu@email.com"
                  placeholderTextColor={TEXT2}
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
              <Text style={[styles.label, { color: TEXT2 }]}>Contraseña</Text>
              <View style={[styles.inputRow, { borderColor: BORDER, backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}>
                <Ionicons name="lock-closed-outline" size={20} color={TEXT2} />
                <TextInput
                  style={[styles.input, { color: TEXT }]}
                  placeholder="••••••••"
                  placeholderTextColor={TEXT2}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={TEXT2} />
                </Pressable>
              </View>
            </View>

            {/* Primary Button */}
            <FeedbackButton
              label={mode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
              status={loading ? 'loading' : 'idle'}
              onPress={mode === 'login' ? handleLogin : handleRegister}
              color={BLUE}
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
              <Text style={[styles.toggleText, { color: TEXT2 }]}>
                {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={{ color: BLUE, fontWeight: '700' }}>
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
  logoCircle: {
    width: 96, height: 96, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  appName: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  appSubtitle: { fontSize: 16, marginTop: 6 },

  card: {
    borderRadius: 24, padding: 24,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 8,
    gap: 16,
  },

  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, fontSize: 16 },

  primaryBtn: {
    height: 54, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 4,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  toggleMode: { alignItems: 'center', paddingVertical: 4 },
  toggleText: { fontSize: 14 },
});
