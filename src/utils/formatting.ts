/**
 * Utility functions for formatting values in the BullionDesk app
 */

/**
 * Formats numbers in Indian numbering system (e.g., 10,00,000)
 * @param num - The number to format
 * @returns Formatted number string in Indian format
 */
export const formatIndianNumber = (num: number): string => {
  const numStr = Math.abs(num).toString();
  const [integerPart, decimalPart] = numStr.split('.');

  // Handle Indian numbering system
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  // Add decimal part if exists
  const result = decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;

  return num < 0 ? `-${result}` : result;
};

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
  const formattedAmount = `₹${formatIndianNumber(Math.abs(amount))}`;
  return isNegative ? `-${formattedAmount}` : formattedAmount;
};

/**
 * Custom format for Rupu pure silver weight calculation
 * Rounds up if decimal part is 0.600 or higher
 * @param weight - The weight value
 * @param touch - The touch percentage
 * @returns Formatted pure weight
 */
export const customFormatPureSilver = (weight: number, touch: number): number => {
  const pureWeight = (weight * touch) / 100;
  const decimalPart = pureWeight - Math.floor(pureWeight);
  if (decimalPart > 0.600) {
    return Math.floor(pureWeight) + 1;
  }
  return Math.floor(pureWeight);
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
 * Precise pure gold formatting function for rani - 3 digits after decimal, truncated not rounded
 * Used for gold subledger display to show actual calculated values
 * @param value - The gold weight value
 * @returns Formatted gold weight number with 3 decimal places (truncated)
 */
export const formatPureGoldPrecise = (value: number): number => {
  if (isNaN(value)) return 0;

  // Truncate to 3 decimal places (don't round)
  const truncated = Math.floor(value * 1000) / 1000;
  return truncated;
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
  return amount > 0 ? `${label}₹${formatIndianNumber(amount)}` : '₹0';
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
 * Formats date with full details for history display
 * @param dateString - The date string
 * @returns Formatted date string with time
 */
export const formatFullTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-IN', {
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
