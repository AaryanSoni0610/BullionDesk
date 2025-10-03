import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView } from 'react-native';
import { TextInput, Button, Text, Surface } from 'react-native-paper';
import { theme } from '../theme';

interface InventoryInput {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
}

interface InventoryInputDialogProps {
  visible: boolean;
  title: string;
  message: string;
  inputs: InventoryInput[];
  onCancel: () => void;
  onSubmit: (values: Record<string, number>) => void;
}

export const InventoryInputDialog: React.FC<InventoryInputDialogProps> = ({
  visible,
  title,
  message,
  inputs,
  onCancel,
  onSubmit,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize values when inputs change
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    inputs.forEach(input => {
      initialValues[input.key] = input.value;
    });
    setValues(initialValues);
    setErrors({});
  }, [inputs]);

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    // Clear error when user starts typing
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const validateInputs = (): boolean => {
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    inputs.forEach(input => {
      const value = values[input.key] || '';
      const numValue = parseFloat(value);

      if (!value.trim()) {
        newErrors[input.key] = 'Required';
        hasErrors = true;
      } else if (isNaN(numValue)) {
        newErrors[input.key] = 'Must be a number';
        hasErrors = true;
      } else if (numValue < 0) {
        newErrors[input.key] = 'Must be positive';
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    return !hasErrors;
  };

  const handleSubmit = () => {
    if (!validateInputs()) {
      return;
    }

    const result: Record<string, number> = {};
    inputs.forEach(input => {
      result[input.key] = parseFloat(values[input.key]);
    });

    onSubmit(result);
  };

  const handleCancel = () => {
    setValues({});
    setErrors({});
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

          <ScrollView style={styles.inputsContainer}>
            {inputs.map((input) => (
              <View key={input.key} style={styles.inputContainer}>
                <TextInput
                  mode="outlined"
                  label={input.label}
                  value={values[input.key] || ''}
                  onChangeText={(value) => handleValueChange(input.key, value)}
                  placeholder={input.placeholder}
                  keyboardType="numeric"
                  style={styles.input}
                  error={!!errors[input.key]}
                />
                {errors[input.key] ? (
                  <Text variant="bodySmall" style={styles.error}>
                    {errors[input.key]}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>

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
              Next
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
    padding: theme.spacing.md,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    padding: theme.spacing.lg,
    borderRadius: 8,
    elevation: 6,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    color: theme.colors.onSurface,
  },
  message: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    color: theme.colors.onSurfaceVariant,
  },
  inputsContainer: {
    maxHeight: 300,
    marginBottom: theme.spacing.md,
  },
  inputContainer: {
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surface,
  },
  error: {
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  button: {
    minWidth: 80,
  },
});