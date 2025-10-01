/**
 * Utility functions for formatting values in the BullionDesk app
 */

/**
 * Formats weight values with appropriate decimal places based on item type
 * @param weight - The weight value to format
 * @param isSilver - Whether the item is silver (shows 1 decimal) or gold (shows 3 decimals)
 * @returns Formatted weight string with 'g' suffix
 */
export const formatWeight = (weight: number, isSilver: boolean = false): string => {
  const decimals = isSilver ? 1 : 3;
  return `${weight.toFixed(decimals)}g`;
};

/**
 * Formats currency values with Indian Rupee symbol
 * @param amount - The amount to format
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
  const isNegative = amount < 0;
  const formattedAmount = `₹${Math.abs(amount).toLocaleString()}`;
  return isNegative ? `-${formattedAmount}` : formattedAmount;
};

/**
 * Money formatting function - rounds to nearest 10 with specific rules
 * @param value - The money value as string
 * @returns Formatted money string
 */
export const formatMoney = (value: string): string => {
  if (!value || value.trim() === '') return value;

  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return value;

  // If there's any fractional part > 0, round up to next integer
  let integerPart = Math.floor(num);
  const fractionalPart = num - integerPart;

  if (fractionalPart > 0) {
    integerPart += 1;
  }

  // Now round the integer part to nearest 10
  const lastDigit = integerPart % 10;
  let formattedAmount;

  if (lastDigit < 6) {
    // Round down to nearest 10
    formattedAmount = Math.floor(integerPart / 10) * 10;
  } else {
    // Round up to nearest 10
    formattedAmount = Math.floor(integerPart / 10) * 10 + 10;
  }

  return formattedAmount.toString();
};

/**
 * Pure gold formatting function for rani - 3 digits after decimal, last digit always zero
 * @param value - The gold weight value
 * @returns Formatted gold weight string
 */
export const formatPureGold = (value: number): string => {
  if (isNaN(value)) return '0.000';

  // Get 3 decimal places
  const rounded = Math.round(value * 1000) / 1000;
  const str = rounded.toFixed(3);
  const parts = str.split('.');
  const decimals = parts[1] || '000';

  // Get the last (third) decimal digit
  const lastDigit = parseInt(decimals.charAt(2) || '0');

  let newDecimals;
  if (lastDigit >= 8) {
    // Add 0.010 if last digit >= 8
    const newValue = rounded + 0.010;
    const newStr = newValue.toFixed(3);
    const newParts = newStr.split('.');
    newDecimals = (newParts[1] || '000').substring(0, 2) + '0';
    return newParts[0] + '.' + newDecimals;
  } else {
    // Make last digit zero
    newDecimals = decimals.substring(0, 2) + '0';
    return parts[0] + '.' + newDecimals;
  }
};

/**
 * Pure silver formatting function for rupu - complex rounding rules
 * @param value - The silver weight value
 * @returns Formatted silver weight number
 */
export const formatPureSilver = (value: number): number => {
  if (isNaN(value)) return 0;

  const integerPart = Math.floor(value);
  const fractionalPart = value - integerPart;

  if (fractionalPart >= 0.899) {
    // Make fractional 0 and add +1g
    return integerPart + 1;
  } else if (fractionalPart > 0.399 && fractionalPart < 0.900) {
    // Make fractional .500
    return integerPart + 0.5;
  } else {
    // Make fractional 0
    return integerPart;
  }
};

/**
 * Formats transaction amount with proper sign handling for display
 * Shows actual money received/given (amountPaid) instead of total
 * @param transaction - The transaction object
 * @returns Formatted amount string with label and currency symbol
 */
export const formatTransactionAmount = (transaction: any): string => {
  const amount = transaction.amountPaid || 0;
  // Determine if money was received (SELL) or given (PURCHASE) based on transaction.total sign
  const isReceived = transaction.total > 0;
  const label = isReceived ? 'Received' : 'Given';
  return amount > 0 ? `${label}: ₹${amount.toLocaleString()}` : '₹0';
};

/**
 * Formats date for relative display (Today, Yesterday, X days ago)
 * @param dateString - The date string
 * @returns Formatted relative date string
 */
export const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });
  }
};

/**
 * Formats date with full details for history display
 * @param dateString - The date string
 * @returns Formatted date string with time
 */
export const formatFullDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};