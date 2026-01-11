import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

interface EncryptionKeyDialogProps {
  visible: boolean;
  mode: 'setup' | 'confirm' | 'enter';
  title: string;
  message: string;
  onCancel: () => void;
  onSubmit: (key: string) => void;
}

export const EncryptionKeyDialog: React.FC<EncryptionKeyDialogProps> = ({
  visible,
  mode,
  title,
  message,
  onCancel,
  onSubmit,
}) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!key.trim()) {
      setError('Key cannot be empty');
      return;
    }
    if (mode === 'setup' && key.length < 8) {
      setError('Key must be at least 8 characters');
      return;
    }
    setError('');
    onSubmit(key);
    setKey('');
  };

  const handleCancel = () => {
    setKey('');
    setError('');
    onCancel();
  };

  const getIcon = () => {
    switch (mode) {
      case 'setup': return 'key-plus';
      case 'confirm': return 'check-decagram';
      case 'enter': return 'lock-open-outline';
      default: return 'key-outline';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <Surface style={styles.dialog}>
            
            {/* Same Line Header */}
            <View style={styles.headerContainer}>
               <View style={styles.iconBadge}>
                  <MaterialCommunityIcons name={getIcon()} size={24} color={theme.colors.primary} />
               </View>
               <Text variant="titleLarge" style={styles.title}>
                 {title}
               </Text>
            </View>
            
            <Text variant="bodyMedium" style={styles.message}>
              {message}
            </Text>

            <TextInput
              mode="outlined"
              label="Encryption Key"
              value={key}
              onChangeText={(text) => { setKey(text); setError(''); }}
              secureTextEntry
              autoFocus
              style={styles.input}
              outlineStyle={{ borderRadius: 12 }}
              activeOutlineColor={theme.colors.primary}
              error={!!error}
              onSubmitEditing={handleSubmit}
              left={<TextInput.Icon icon="key" color={theme.colors.onSurfaceVariant} 
                style={{ marginRight: -4 }}
              />}
            />

            {error ? (
              <Text variant="bodySmall" style={styles.error}>{error}</Text>
            ) : null}

            <View style={styles.buttons}>
              <Button
                mode="text"
                onPress={handleCancel}
                textColor={theme.colors.onSurfaceVariant}
                labelStyle={styles.buttonLabel}
                style={styles.button}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                style={[styles.button, styles.submitButton]}
                labelStyle={styles.buttonLabel}
              >
                {mode === 'confirm' ? 'Confirm' : 'Next'}
              </Button>
            </View>
          </Surface>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    marginHorizontal: 16,
    backgroundColor: '#FDFBFF',
    borderRadius: 28,
    padding: 24,
    elevation: 6,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconBadge: {
    padding: 8,
    borderRadius: 12,
    marginRight: 4,
  },
  title: {
    textAlign: 'left',
    fontFamily: 'Outfit_700Bold',
    color: theme.colors.onSurface,
    flexShrink: 1,
  },
  message: {
    textAlign: 'center',
    fontFamily: 'Outfit_400Regular',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 24,
    fontSize: 14,
  },
  input: {
    width: '100%',
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    fontSize: 16,
  },
  error: {
    color: theme.colors.error,
    fontFamily: 'Outfit_500Medium',
    marginBottom: 16,
    marginLeft: 4,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 100,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
  },
  buttonLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
    paddingVertical: 2,
  },
});