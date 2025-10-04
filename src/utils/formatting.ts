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

  let integerPart = Math.floor(num);

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
 * @returns Formatted gold weight number
 */
export const formatPureGold = (value: number): number => {
  if (isNaN(value)) return 0;

  // Get 3 decimal places and set last digit to zero
  const rounded = Math.round(value * 1000) / 1000;
  const str = rounded.toFixed(3);
  const parts = str.split('.');
  const decimals = parts[1] || '000';
  
  // Make last digit zero
  const newDecimals = decimals.substring(0, 2) + '0';
  const result = parts[0] + '.' + newDecimals;
  
  return parseFloat(result);
};

/**
 * Pure silver formatting function for rupu - remove all decimal points
 * @param value - The silver weight value
 * @returns Formatted silver weight number (integer)
 */
export const formatPureSilver = (value: number): number => {
  if (isNaN(value)) return 0;

  // Simply floor to integer, removing all fractional parts
  return Math.floor(value);
};

/**
 * Formats transaction amount with proper sign handling for display
 * Shows actual money received/given (amountPaid) instead of total
 * @param transaction - The transaction object
 * @returns Formatted amount string with label and currency symbol
 */
export const formatTransactionAmount = (transaction: any): string => {
  // Check if this is a money-only transaction
  const isMoneyOnly = transaction.entries?.every((entry: any) => entry.type === 'money');
  
  let amount: number;
  let isReceived: boolean;
  
  if (isMoneyOnly) {
    // For money-only transactions, show the transaction total amount
    amount = Math.abs(transaction.total);
    isReceived = transaction.total > 0;
  } else {
    // For regular transactions, show amountPaid
    amount = transaction.amountPaid || 0;
    isReceived = transaction.total > 0;
  }
  
  const label = isReceived ? '+' : '-';
  return amount > 0 ? `${label}₹${amount.toLocaleString()}` : '₹0';
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
/**
 * Formats date with full details including seconds
 * @param dateString - The date string
 * @returns Formatted date string with time including seconds
 */
export const formatFullDateWithSeconds = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
