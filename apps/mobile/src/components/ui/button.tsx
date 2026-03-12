/**
 * Button Component
 *
 * Reusable button with variants: primary, secondary, outline, ghost.
 * Supports loading state with haptic feedback.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, borderRadius, fontSize, fontWeight } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  haptic = true,
  icon,
  style,
}: ButtonProps) {
  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const buttonStyle: ViewStyle[] = [
    styles.base,
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.text,
    textVariantStyles[variant],
    textSizeStyles[size],
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.white : colors.brand}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  text: {},
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.brand,
    borderRadius: borderRadius.lg,
  },
  secondary: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.lg,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
  },
};

const textVariantStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: colors.white, fontWeight: fontWeight.bold },
  secondary: { color: colors.gray700, fontWeight: fontWeight.semibold },
  outline: { color: colors.brand, fontWeight: fontWeight.semibold },
  ghost: { color: colors.gray600, fontWeight: fontWeight.medium },
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { height: 36, paddingHorizontal: 12 },
  md: { height: 48, paddingHorizontal: 16 },
  lg: { height: 56, paddingHorizontal: 24 },
};

const textSizeStyles: Record<ButtonSize, TextStyle> = {
  sm: { fontSize: fontSize.sm },
  md: { fontSize: fontSize.base },
  lg: { fontSize: fontSize.lg },
};
