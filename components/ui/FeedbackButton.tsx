import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

export type ButtonStatus = 'idle' | 'loading' | 'success';

type FeedbackButtonProps = {
  label: string;
  onPress: () => void;
  status?: ButtonStatus;
  disabled?: boolean;
  color?: string;
  /** Color del texto/ícono sobre el botón (MD3 "on-" role). Default blanco. */
  onColor?: string;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  successLabel?: string;
};

export function FeedbackButton({
  label,
  onPress,
  status = 'idle',
  disabled = false,
  color = '#007AFF',
  onColor = '#FFFFFF',
  style,
  textStyle,
  successLabel,
}: FeedbackButtonProps) {
  const isBusy = status === 'loading' || status === 'success';
  const isDisabled = disabled || isBusy;

  const handlePress = async () => {
    if (isDisabled) return;
    await Haptics.selectionAsync();
    onPress();
  };

  const buttonContent = () => {
    if (status === 'loading') {
      return <ActivityIndicator color={onColor} size="small" />;
    }

    if (status === 'success') {
      return (
        <View style={styles.successContent}>
          <Ionicons name="checkmark-circle" size={18} color={onColor} style={styles.successIcon} />
          <Text style={[styles.label, { color: onColor }, textStyle]}>{successLabel ?? 'Guardado'}</Text>
        </View>
      );
    }

    return <Text style={[styles.label, { color: onColor }, textStyle]}>{label}</Text>;
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color, opacity: pressed || isDisabled ? 0.75 : 1 },
        style,
      ]}
    >
      {buttonContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
    fontSize: 15,
  },
  successContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successIcon: {
    marginRight: 6,
  },
});
