import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text, Surface, RadioButton } from 'react-native-paper';
import { theme } from '../theme';

interface InventoryInput {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'radio' | 'select';
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  options?: Array<{ label: string; value: string }>;
}

interface InventoryInputDialogProps {
  visible: boolean;
  title: string;
  message: string;
  inputs: InventoryInput[];
  onCancel: () => void;
  onSubmit: (values: Record<string, any>) => void;
  onRadioChange?: (key: string, value: string) => void;
  requireAtLeastOneNumeric?: boolean;
  allowDefaults?: boolean; // New prop to allow proceeding with default values
}

export const InventoryInputDialog: React.FC<InventoryInputDialogProps> = ({
  visible,
  title,
  message,
  inputs,
  onCancel,
  onSubmit,
  onRadioChange,
  requireAtLeastOneNumeric = false,
  allowDefaults = false, // Default to false to maintain existing behavior
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [currentSelectKey, setCurrentSelectKey] = useState<string>('');
  const [currentSelectOptions, setCurrentSelectOptions] = useState<Array<{ label: string; value: string }>>([]);

  // Initialize values when inputs change, but preserve existing values
  useEffect(() => {
    setValues(prevValues => {
      const newValues = { ...prevValues };
      const newOriginalValues: Record<string, string> = {};
      inputs.forEach(input => {
        // Only set default value if this input doesn't already have a value
        if (!(input.key in newValues) || newValues[input.key] === '') {
          newValues[input.key] = input.value;
        }
        newOriginalValues[input.key] = input.value;
      });
      setOriginalValues(newOriginalValues);
      return newValues;
    });
    setErrors({});
  }, [inputs]);

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    // Clear error when user starts typing
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleRadioChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
    if (onRadioChange) {
      onRadioChange(key, value);
    }
  };

  const openSelectModal = (key: string, options: Array<{ label: string; value: string }>) => {
    setCurrentSelectKey(key);
    setCurrentSelectOptions(options);
    setSelectModalVisible(true);
  };

  const handleSelectOption = (value: string) => {
    setValues(prev => ({ ...prev, [currentSelectKey]: value }));
    setSelectModalVisible(false);
    if (errors[currentSelectKey]) {
      setErrors(prev => ({ ...prev, [currentSelectKey]: '' }));
    }
  };

  const hasValuesChanged = (): boolean => {
    return inputs.some(input => {
      const currentValue = values[input.key] || '';
      const originalValue = originalValues[input.key] || '';
      return currentValue !== originalValue;
    });
  };

  const validateInputs = (): boolean => {
    // Skip validation if allowDefaults is enabled
    if (allowDefaults) {
      return true;
    }

    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    inputs.forEach(input => {
      const value = values[input.key] || '';

      if (input.type === 'text') {
        if (input.keyboardType === 'numeric') {
          // Numeric validation for price inputs
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
        } else {
          // Text validation for name inputs
          if (!value.trim()) {
            newErrors[input.key] = 'Required';
            hasErrors = true;
          }
        }
      } else {
        // For radio and select inputs
        if (!value.trim()) {
          newErrors[input.key] = 'Required';
          hasErrors = true;
        }
      }
    });

    // Check if at least one numeric field has a value when required
    if (requireAtLeastOneNumeric) {
      const hasAtLeastOneNumeric = inputs.some(input => {
        if (input.type === 'text' && input.keyboardType === 'numeric') {
          const value = values[input.key] || '';
          const numValue = parseFloat(value);
          return !isNaN(numValue) && numValue !== 0;
        }
        return false;
      });

      if (!hasAtLeastOneNumeric) {
        // Add error to the first numeric field
        const firstNumericInput = inputs.find(input => 
          input.type === 'text' && input.keyboardType === 'numeric'
        );
        if (firstNumericInput) {
          newErrors[firstNumericInput.key] = 'At least one field must have a value';
          hasErrors = true;
        }
      }
    }

    setErrors(newErrors);
    return !hasErrors;
  };

  const handleSubmit = () => {
    if (!validateInputs()) {
      return;
    }

    const result: Record<string, any> = {};
    inputs.forEach(input => {
      if (input.type === 'text' && input.keyboardType === 'numeric') {
        const value = values[input.key] || '';
        if (value.trim() === '') {
          // Use default value of 0 when allowDefaults is enabled and field is empty
          result[input.key] = 0;
        } else {
          result[input.key] = parseFloat(value);
        }
      } else {
        result[input.key] = values[input.key];
      }
    });

    onSubmit(result);
  };

  const handleCancel = () => {
    setValues({});
    setErrors({});
    onCancel();
  };

  return (
    <>
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
              {inputs.map((input) => {
                if (input.type === 'radio' && input.options) {
                  return (
                    <View key={input.key} style={styles.inputContainer}>
                      <Text variant="bodyLarge" style={styles.radioLabel}>
                        {input.label}
                      </Text>
                      <RadioButton.Group
                        onValueChange={(value) => handleRadioChange(input.key, value)}
                        value={values[input.key] || ''}
                      >
                        <View style={styles.radioGroupHorizontal}>
                          {input.options.map((option) => (
                            <View key={option.value} style={styles.radioOptionHorizontal}>
                              <RadioButton value={option.value} />
                              <Text style={styles.radioText}>{option.label}</Text>
                            </View>
                          ))}
                        </View>
                      </RadioButton.Group>
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.error}>
                          {errors[input.key]}
                        </Text>
                      ) : null}
                    </View>
                  );
                } else if (input.type === 'select' && input.options) {
                  const selectedOption = input.options.find(opt => opt.value === values[input.key]);
                  return (
                    <View key={input.key} style={styles.inputContainer}>
                      <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => openSelectModal(input.key, input.options!)}
                      >
                        <Text style={styles.selectButtonText}>
                          {selectedOption ? selectedOption.label : input.label}
                        </Text>
                      </TouchableOpacity>
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.error}>
                          {errors[input.key]}
                        </Text>
                      ) : null}
                    </View>
                  );
                } else {
                  // Default text input
                  return (
                    <View key={input.key} style={styles.inputContainer}>
                      <TextInput
                        mode="outlined"
                        label={input.label}
                        value={values[input.key] || ''}
                        onChangeText={(value) => handleValueChange(input.key, value)}
                        placeholder={input.placeholder}
                        keyboardType={input.keyboardType || 'default'}
                        style={styles.input}
                        error={!!errors[input.key]}
                      />
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.error}>
                          {errors[input.key]}
                        </Text>
                      ) : null}
                    </View>
                  );
                }
              })}
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
                disabled={!allowDefaults && !hasValuesChanged()}
              >
                Next
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Select Options Modal */}
      <Modal
        visible={selectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectModalVisible(false)}
      >
        <View style={styles.selectModalOverlay}>
          <Surface style={styles.selectModalDialog}>
            <Text variant="titleMedium" style={styles.selectModalTitle}>
              Select Option
            </Text>
            <ScrollView style={styles.selectOptionsContainer}>
              {currentSelectOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.selectOption}
                  onPress={() => handleSelectOption(option.value)}
                >
                  <Text style={styles.selectOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.selectModalButtons}>
              <Button
                mode="text"
                onPress={() => setSelectModalVisible(false)}
                style={styles.button}
              >
                Cancel
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>
    </>
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
  radioLabel: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
    marginBottom: theme.spacing.sm,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  radioGroupHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.sm,
  },
  radioOptionHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.sm,
  },
  radioText: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
    marginLeft: theme.spacing.sm,
  },
  selectButton: {
    borderColor: theme.colors.outline,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    justifyContent: 'center',
  },
  selectButtonText: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
    fontSize: 16,
  },
  selectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  selectModalDialog: {
    width: '100%',
    maxWidth: 350,
    padding: theme.spacing.lg,
    borderRadius: 8,
    maxHeight: 400,
  },
  selectModalTitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_500Medium',
  },
  selectOptionsContainer: {
    maxHeight: 250,
  },
  selectOption: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  selectOptionText: {
    color: theme.colors.onSurface,
    fontFamily: 'Roboto_400Regular',
    fontSize: 16,
  },
  selectModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.md,
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