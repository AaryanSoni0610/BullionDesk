import React, { useState } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { TextInput, Button, Text, Surface } from 'react-native-paper';
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <Surface style={styles.dialog}>
          <Text variant="titleLarge" style={styles.title}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>

          <TextInput
            mode="outlined"
            label="Encryption Key"
            value={key}
            onChangeText={(text) => {
              setKey(text);
              setError('');
            }}
            secureTextEntry
            autoFocus
            style={styles.input}
            error={!!error}
            onSubmitEditing={handleSubmit}
          />

          {error ? (
            <Text variant="bodySmall" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            <Button
              mode="text"
              onPress={handleCancel}
              style={styles.button}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmit}
              style={styles.button}
            >
              {mode === 'confirm' ? 'Confirm' : 'Submit'}
            </Button>
          </View>
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    elevation: 8,
  },
  title: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  message: {
    marginBottom: 20,
    color: theme.colors.onSurfaceVariant,
  },
  input: {
    marginBottom: 8,
  },
  error: {
    color: theme.colors.error,
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  button: {
    minWidth: 80,
  },
});
