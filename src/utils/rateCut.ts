import { Transaction, Customer } from '../types';

export const isTransactionLocked = (
  transaction: Transaction,
  customer: Customer
): boolean => {
  if (!transaction.entries || transaction.entries.length === 0) return false;

  const transactionDate = new Date(transaction.date).getTime();

  // Check specific item types
  const hasGold999 = transaction.entries.some(e => e.itemType === 'gold999');
  const hasGold995 = transaction.entries.some(e => e.itemType === 'gold995');
  const hasSilver = transaction.entries.some(e => e.itemType === 'silver' || e.itemType === 'rani' || e.itemType === 'rupu');

  if (hasGold999 && customer.last_gold999_lock_date) {
    if (transactionDate <= customer.last_gold999_lock_date) return true;
  }

  if (hasGold995 && customer.last_gold995_lock_date) {
    if (transactionDate <= customer.last_gold995_lock_date) return true;
  }

  if (hasSilver && customer.last_silver_lock_date) {
    if (transactionDate <= customer.last_silver_lock_date) return true;
  }

  return false;
};
