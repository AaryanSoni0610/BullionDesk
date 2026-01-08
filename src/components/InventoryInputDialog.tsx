import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface, RadioButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  allowDefaults?: boolean;
  disableRequiredValidation?: boolean;
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
  allowDefaults = false,
  disableRequiredValidation = false,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [currentSelectKey, setCurrentSelectKey] = useState<string>('');
  const [currentSelectOptions, setCurrentSelectOptions] = useState<Array<{ label: string; value: string }>>([]);

  // Initialize values when inputs change
  useEffect(() => {
    if (visible) {
      setValues(prevValues => {
        const newValues = { ...prevValues };
        const newOriginalValues: Record<string, string> = {};
        inputs.forEach(input => {
          // Initialize if key doesn't exist or is empty
          if (!(input.key in newValues) || newValues[input.key] === '') {
            newValues[input.key] = input.value || '';
          }
          newOriginalValues[input.key] = input.value || '';
        });
        setOriginalValues(newOriginalValues);
        return newValues;
      });
      setErrors({});
    }
  }, [inputs, visible]);

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleRadioChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    if (onRadioChange) onRadioChange(key, value);
  };

  const openSelectModal = (key: string, options: Array<{ label: string; value: string }>) => {
    setCurrentSelectKey(key);
    setCurrentSelectOptions(options);
    setSelectModalVisible(true);
  };

  const handleSelectOption = (value: string) => {
    setValues(prev => ({ ...prev, [currentSelectKey]: value }));
    setSelectModalVisible(false);
    if (errors[currentSelectKey]) setErrors(prev => ({ ...prev, [currentSelectKey]: '' }));
  };

  const hasValuesChanged = (): boolean => {
    return inputs.some(input => {
      const currentValue = values[input.key] || '';
      const originalValue = originalValues[input.key] || '';
      return currentValue !== originalValue;
    });
  };

  const validateInputs = (): boolean => {
    if (allowDefaults) return true;
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    inputs.forEach(input => {
      const value = values[input.key] || '';
      if (input.type === 'text' || !input.type) {
        if (input.keyboardType === 'numeric') {
          if (value.trim()) {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
              newErrors[input.key] = 'Must be a number';
              hasErrors = true;
            }
          } else if (!disableRequiredValidation) {
            newErrors[input.key] = 'Required';
            hasErrors = true;
          }
        } else {
          if (!value.trim() && !disableRequiredValidation) {
            newErrors[input.key] = 'Required';
            hasErrors = true;
          }
        }
      } else {
        if (!value.trim() && !disableRequiredValidation) {
          newErrors[input.key] = 'Required';
          hasErrors = true;
        }
      }
    });

    if (requireAtLeastOneNumeric && !hasErrors) {
      const hasAtLeastOneNumeric = inputs.some(input => {
        if ((input.type === 'text' || !input.type) && input.keyboardType === 'numeric') {
          const value = values[input.key] || '';
          if (!value.trim()) return false;
          const numValue = parseFloat(value);
          return !isNaN(numValue) && numValue !== 0;
        }
        return false;
      });

      if (!hasAtLeastOneNumeric) {
        const firstNumericInput = inputs.find(input => 
          (input.type === 'text' || !input.type) && input.keyboardType === 'numeric'
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
    if (!validateInputs()) return;
    const result: Record<string, any> = {};
    inputs.forEach(input => {
      if ((input.type === 'text' || !input.type) && input.keyboardType === 'numeric') {
        const value = values[input.key] || '';
        if (value.trim() === '') {
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
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <Surface style={styles.dialog}>
            
            {/* Same Line Header */}
            <View style={styles.headerContainer}>
                <View style={styles.iconBadge}>
                   <MaterialCommunityIcons name="pencil-box-outline" size={24} color={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={styles.title}>
                  {title}
                </Text>
            </View>
            
            <Text variant="bodyMedium" style={styles.message}>
              {message}
            </Text>

            <ScrollView style={styles.inputsScroll} showsVerticalScrollIndicator={false}>
              {inputs.map((input) => {
                if (input.type === 'radio' && input.options) {
                  return (
                    <View key={input.key} style={styles.inputContainer}>
                      <Text variant="bodyMedium" style={styles.radioLabel}>
                        {input.label}
                      </Text>
                      <RadioButton.Group
                        onValueChange={(value) => handleRadioChange(input.key, value)}
                        value={values[input.key] || ''}
                      >
                        <View style={styles.radioGroupHorizontal}>
                          {input.options.map((option) => (
                            <View key={option.value} style={styles.radioOptionHorizontal}>
                              <RadioButton value={option.value} color={theme.colors.primary} />
                              <Text style={styles.radioText}>{option.label}</Text>
                            </View>
                          ))}
                        </View>
                      </RadioButton.Group>
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.errorText}>
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
                        <Text style={[
                            styles.selectButtonText, 
                            !selectedOption && {color: theme.colors.onSurfaceVariant}
                        ]}>
                          {selectedOption ? selectedOption.label : input.label}
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.onSurfaceVariant} />
                      </TouchableOpacity>
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.errorText}>
                          {errors[input.key]}
                        </Text>
                      ) : null}
                    </View>
                  );
                } else {
                  // Default to Text Input (handles type='text' or undefined)
                  return (
                    <View key={input.key} style={styles.inputContainer}>
                      <TextInput
                        mode="outlined"
                        label={input.label}
                        value={values[input.key] || ''}
                        onChangeText={(value) => handleValueChange(input.key, value)}
                        placeholder={input.placeholder}
                        keyboardType={input.keyboardType || 'default'}
                        style={styles.textInput}
                        outlineStyle={{ borderRadius: 12 }}
                        activeOutlineColor={theme.colors.primary}
                        error={!!errors[input.key]}
                      />
                      {errors[input.key] ? (
                        <Text variant="bodySmall" style={styles.errorText}>
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
                textColor={theme.colors.onSurfaceVariant}
                style={styles.button}
                labelStyle={styles.buttonLabel}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                style={[styles.button, styles.submitButton]}
                labelStyle={styles.buttonLabel}
                disabled={!allowDefaults && !hasValuesChanged()}
              >
                Next
              </Button>
            </View>
          </Surface>
        </KeyboardAvoidingView>
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
                  {values[currentSelectKey] === option.value && (
                      <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.selectModalButtons}>
              <Button
                mode="text"
                onPress={() => setSelectModalVisible(false)}
                textColor={theme.colors.onSurfaceVariant}
              >
                Close
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 28,
    elevation: 6,
    backgroundColor: '#FDFBFF',
    maxHeight: '80%',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconBadge: {
    padding: 8,
    borderRadius: 12,
    marginRight: 4,
  },
  title: {
    textAlign: 'left',
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_700Bold',
    flexShrink: 1,
  },
  message: {
    textAlign: 'center',
    marginBottom: 20,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_400Regular',
  },
  inputsScroll: {
    marginBottom: 16,
    flexGrow: 0, // IMPORTANT: Prevents ScrollView from taking 0 height if items are few
  },
  inputContainer: {
    marginBottom: 12,
    width: '100%', // Ensure container takes full width
  },
  textInput: {
    backgroundColor: '#FFFFFF', // Ensure visible background
    fontSize: 16,
    minHeight: 56, // Ensure visible height
  },
  errorText: {
    color: theme.colors.error,
    marginTop: 4,
    marginLeft: 4,
    fontFamily: 'Outfit_500Medium',
  },
  radioLabel: {
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_500Medium',
    marginBottom: 8,
  },
  radioGroupHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    padding: 4,
  },
  radioOptionHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  radioText: {
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_500Medium',
    marginLeft: 4,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderColor: theme.colors.outline,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF', // Ensure visible background
    padding: 16,
    minHeight: 56,
  },
  selectButtonText: {
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  selectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  selectModalDialog: {
    width: '100%',
    maxWidth: 320,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FDFBFF',
    maxHeight: 400,
  },
  selectModalTitle: {
    textAlign: 'center',
    marginBottom: 16,
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_700Bold',
  },
  selectOptionsContainer: {
    maxHeight: 250,
  },
  selectOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  selectOptionText: {
    color: theme.colors.onSurface,
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
  },
  selectModalButtons: {
    alignItems: 'center',
    marginTop: 16,
  },
});