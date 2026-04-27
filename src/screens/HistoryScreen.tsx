import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  FlatList, 
  TouchableOpacity,
  BackHandler,
  TextInput,
  RefreshControl,
  Modal,
  Pressable,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import ThermalPrinterModule from 'react-native-thermal-printer';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Text,
  Divider,
  ActivityIndicator,
  Surface,
  Button
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { theme } from '../theme';
import { formatTransactionAmount, formatFullDate, formatPureGoldPrecise, formatPureGold, formatPureSilver, customFormatPureSilver, formatMoney, formatIndianNumber, formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transaction.service';
import { RateCutService, RateCutRecord } from '../services/rateCut.service';
import { Transaction } from '../types';
import { useAppContext } from '../context/AppContext';
import CustomAlert from '../components/CustomAlert';

// ─── Module-level pure helpers (stable references → no needless re-renders) ───

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const getItemDisplayName = (entry: any): string => {
  if (entry.type === 'money') return 'Money';
  const typeMap: Record<string, string> = {
    gold999: 'Gold 999', gold995: 'Gold 995', rani: 'Rani', silver: 'Silver', rupu: 'Rupu', money: 'Money',
  };
  return typeMap[entry.itemType] || entry.itemType;
};


const getAmountColor = (transaction: Transaction) => {
  const isMoneyOnly = transaction.entries.length === 1 && transaction.entries[0].type === 'money';
  if (isMoneyOnly) {
    return transaction.amountPaid > 0 ? theme.colors.sellColor : theme.colors.primary;
  }
  return transaction.total > 0 ? theme.colors.sellColor : theme.colors.primary;
};

const getEntryDisplayDataModule = (entry: any): { line1: string; line2: string } => {
  const isMetalOnly = entry.metalOnly;
  const isRaniRupa = ['rani', 'rupu'].includes(entry.itemType);
  const isGoldSilver = !isRaniRupa && entry.type !== 'money';

  if (entry.metalOnly && entry.stock_id && entry.type === 'sell') {
    const weight = entry.weight || 0;
    const touch = entry.touch || 100;
    const cut = entry.cut || 0;
    let effectiveTouch = touch;
    let fixedDigits = 0;
    let formattedPure = 0;
    if (entry.itemType === 'rani') {
      effectiveTouch = touch - cut;
      fixedDigits = 3;
      formattedPure = formatPureGoldPrecise((weight * effectiveTouch) / 100);
    } else if (entry.itemType === 'rupu') {
      fixedDigits = 0;
      formattedPure = customFormatPureSilver(weight, touch);
    } else if (entry.itemType.includes('gold')) {
      effectiveTouch = entry.itemType === 'gold999' ? touch - cut : touch;
      fixedDigits = 3;
      formattedPure = formatPureGoldPrecise((weight * effectiveTouch) / 100);
    } else {
      fixedDigits = 0;
      formattedPure = customFormatPureSilver(weight, touch);
    }
    const touchDisplay = cut > 0 ? `${touch.toFixed(2)}-${Math.abs(cut).toFixed(2)}` : effectiveTouch.toFixed(2);
    return { line1: `${weight.toFixed(fixedDigits)}g : ${touchDisplay}% : ${formattedPure.toFixed(fixedDigits)}g`, line2: '' };
  }

  let line1 = '';
  let line2 = '';
  if (isRaniRupa) {
    const weight = entry.weight || 0;
    const touch = entry.touch || 100;
    const cut = entry.cut || 0;
    const effectiveTouch = entry.itemType === 'rani' ? Math.max(0, touch - cut) : touch;
    const pureWeight = (weight * effectiveTouch) / 100;
    let formattedPure = 0;
    if (entry.itemType === 'rani') {
      formattedPure = entry.type === 'sell' ? formatPureGoldPrecise(pureWeight) : formatPureGold(pureWeight);
    } else {
      formattedPure = entry.type === 'sell' ? customFormatPureSilver(weight, touch) : formatPureSilver(pureWeight);
    }
    const fixedDigits = entry.itemType === 'rani' ? 3 : 0;
    const touchDisplay = (entry.itemType === 'rani' && cut > 0) ? `${touch.toFixed(2)}-${Math.abs(cut).toFixed(2)}` : effectiveTouch.toFixed(2);
    line1 = `${weight.toFixed(fixedDigits)}g : ${touchDisplay}% : ${formattedPure.toFixed(fixedDigits)}g`;
    if (!isMetalOnly && entry.price && entry.price > 0) {
      line2 = `${formatCurrency(entry.price)} (${formatCurrency(entry.subtotal || 0)})`;
    }
  } else if (isGoldSilver) {
    const isGold = entry.itemType.includes('gold');
    const weightStr = `${(entry.weight || 0).toFixed(isGold ? 3 : 1)}g`;
    if (!isMetalOnly && entry.price && entry.price > 0) {
      line1 = `${weightStr} : ${formatCurrency(entry.price)}`;
      line2 = `(${formatCurrency(entry.subtotal || 0)})`;
    } else {
      line1 = weightStr;
    }
  } else if (entry.type === 'money') {
    line1 = `₹${formatIndianNumber(Math.abs(entry.amount || 0))}`;
  }
  return { line1, line2 };
};

// ─────────────────────────────────────────────────────────────────────────────

type TransactionCardProps = {
  transaction: Transaction;
  hideActions?: boolean;
  allowFontScaling?: boolean;
  isPrint?: boolean;
  onDelete: (t: Transaction) => void;
  onShare: (t: Transaction) => void;
  onEdit: (id: string) => void;
};

const TransactionCard = React.memo<TransactionCardProps>(({ transaction, hideActions = false, allowFontScaling = true, isPrint = false, onDelete, onShare, onEdit }) => {
  const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
  const isAllMetalOnly = transaction.entries.length > 0 && transaction.entries.every(entry => entry.metalOnly === true);
  const isRaniRupaSellTransaction = transaction.entries.some(e => e.stock_id && e.metalOnly && e.type === 'sell');

  const processedEntries = transaction.entries.map((entry, index) => {
    let displayName = getItemDisplayName(entry);
    if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
      const type = entry.itemType;
      const count = transaction.entries.filter(e => e.itemType === type).length;
      if (count > 1) {
        const itemIndex = transaction.entries.slice(0, index).filter(e => e.itemType === type).length + 1;
        displayName = `${displayName} ${itemIndex}`;
      }
    } else if (entry.stock_id && entry.metalOnly && entry.type === 'sell') {
      displayName = entry.itemType === 'gold999' || entry.itemType === 'gold995' ? 'Rani' : 'Rupu';
    } else if (entry.type === 'money' && entry.createdAt) {
      const date = new Date(entry.createdAt);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      const hour12 = hours % 12 || 12;
      displayName = `Money (${day}/${month} ${hour12}:${minutes} ${ampm})`;
    }
    return { ...entry, displayName };
  });

  const raniRupaEntries = processedEntries.filter(e => e.stock_id && e.metalOnly && e.type === 'sell');

  const groupedRaniRupa = raniRupaEntries.reduce((acc, entry) => {
    let groupKey = entry.itemType;
    if (entry.itemType === 'rani') groupKey = (entry.cut || 0) > 0 ? 'gold999' : 'gold995';
    else if (entry.itemType === 'rupu') groupKey = 'silver';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(entry);
    return acc;
  }, {} as Record<string, typeof processedEntries>);

  const isAllRupu = transaction.entries.length > 1 && transaction.entries.every(e => e.itemType === 'rupu');
  let customRupuSummaryLine: string | null = null;
  if (isAllRupu) {
    const isPurchase = transaction.entries.some(e => e.type === 'purchase');
    const isSell = transaction.entries.some(e => e.type === 'sell');
    let showCustomSummary = false;
    if (isPurchase) {
      const allPriceZero = transaction.entries.every(e => !e.price || e.price === 0);
      const firstMetalOnly = transaction.entries[0].metalOnly;
      if (allPriceZero || firstMetalOnly) showCustomSummary = true;
    } else if (isSell) {
      if (transaction.entries.every(e => (e.touch || 0) >= 98)) showCustomSummary = true;
    }
    if (showCustomSummary) {
      const totalW = transaction.entries.reduce((sum, e) => sum + (e.weight || 0), 0);
      const totalP = transaction.entries.reduce((sum, e) => sum + customFormatPureSilver(e.weight || 0, e.touch || 100), 0);
      const avgT = totalW > 0 ? (totalP / totalW) * 100 : 0;
      customRupuSummaryLine = `${totalW.toFixed(0)}g : ${avgT.toFixed(2)}% : ${totalP.toFixed(0)}g`;
    }
  }

  let transactionBalanceLabel = 'Settled';
  let transactionBalanceColor = theme.colors.primary;
  if (isMetalOnly) {
    const metalItems: string[] = [];
    processedEntries.forEach(entry => {
      if (entry.metalOnly) {
        const itemName = entry.displayName;
        const weight = entry.weight || 0;
        const isGold = entry.itemType.includes('gold') || entry.itemType === 'rani';
        const formattedWeight = isGold ? weight.toFixed(3) : Math.floor(weight);
        const label = entry.type === 'sell' ? 'Debt' : 'Balance';
        metalItems.push(`${label}: ${itemName} ${formattedWeight}g`);
      }
    });
    if (metalItems.length > 0) {
      transactionBalanceLabel = metalItems.join(', ');
      const isDebt = metalItems.some(item => item.startsWith('Debt'));
      const isBalance = metalItems.some(item => item.startsWith('Balance'));
      if (isDebt) transactionBalanceColor = theme.colors.debtColor;
      else if (isBalance) transactionBalanceColor = theme.colors.success;
    }
  } else {
    const transactionRemaining = transaction.amountPaid - transaction.total;
    const hasRemainingBalance = Math.abs(transactionRemaining) >= 1;
    const isMoneyOnly = !transaction.entries || transaction.entries.length === 0;
    if (hasRemainingBalance) {
      if (!isMoneyOnly) {
        const isDebt = transactionRemaining < 0;
        transactionBalanceLabel = `${isDebt ? 'Debt' : 'Balance'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
        transactionBalanceColor = isDebt ? theme.colors.debtColor : theme.colors.success;
      } else {
        const isBalance = transaction.amountPaid > 0;
        transactionBalanceLabel = `${isBalance ? 'Balance' : 'Debt'}: ₹${formatIndianNumber(Math.abs(transactionRemaining))}`;
        transactionBalanceColor = isBalance ? theme.colors.success : theme.colors.debtColor;
      }
    } else {
      transactionBalanceColor = theme.colors.primary;
    }
  }

  return (
    <View style={[
      styles.historyCard,
      hideActions && {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#cccccc',
        paddingVertical: 10,
        ...(isPrint ? { paddingLeft: 8, paddingRight: 90 } : { paddingHorizontal: 10 }),
        marginBottom: 0,
        margin: 0,
        elevation: 0,
        shadowOpacity: 0,
        width: 576,
      }
    ]}>
      {!hideActions && (
        <View style={styles.cardTopActions}>
          <View style={styles.actionPill}>
            <TouchableOpacity
              style={[styles.iconBtn, styles.btnDelete]}
              onPress={() => onDelete(transaction)}
            >
              <Icon name="delete" size={20} color={theme.colors.error} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, styles.btnShare]} onPress={() => onShare(transaction)}>
              <Icon name="share-variant" size={20} color={theme.colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.btnEdit, isAllMetalOnly && styles.disabledButton]}
              onPress={() => !isAllMetalOnly && onEdit(transaction.id)}
              disabled={isAllMetalOnly}
            >
              <Icon name="pencil" size={20} color={isAllMetalOnly ? theme.colors.onSurfaceDisabled : theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.cardHeader}>
        <View style={styles.infoBlock}>
          <Text allowFontScaling={allowFontScaling} style={[styles.customerName, hideActions && { color: '#000000', fontSize: 26 }]}>
            {transaction.customerName}
          </Text>
          <Text allowFontScaling={allowFontScaling} style={[styles.transactionDate, hideActions && { color: '#000000', fontSize: 18 }]}>
            {formatFullDate(transaction.date)}
          </Text>
        </View>
        <View style={styles.amountBlock}>
          {!isMetalOnly && (
            <Text
              allowFontScaling={allowFontScaling}
              style={[styles.mainAmount, { color: hideActions ? '#000000' : getAmountColor(transaction), fontSize: hideActions ? 26 : 18 }]}
            >
              {formatTransactionAmount(transaction)}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.receiptSection, hideActions && { backgroundColor: '#FFFFFF', borderRadius: 6, borderWidth: 1, borderColor: '#e8e8e8', paddingVertical: 7, paddingHorizontal: 2 }]}>
        {processedEntries.map((entry, index) => (
          <View key={index} style={[styles.entryWrapper, hideActions && { marginBottom: 3 }]}>
            {(() => {
              const isMoneyGive = entry.type === 'money' && entry.moneyType === 'give';
              const isMoneyReceive = entry.type === 'money' && entry.moneyType === 'receive';
              const isSell = entry.type === 'sell' || isMoneyGive;
              const isPurchase = entry.type === 'purchase' || isMoneyReceive;
              const iconName = isSell ? 'arrow-top-right' : isPurchase ? 'arrow-bottom-left' : 'cash';
              const iconColor = hideActions ? '#000000' : (isSell ? theme.colors.success : isPurchase ? theme.colors.primary : '#F57C00');
              const iconStyle = hideActions ? styles.iconPrint : (isSell ? styles.iconSell : isPurchase ? styles.iconPurchase : styles.iconMoney);
              const { line1, line2 } = getEntryDisplayDataModule(entry);
              return (
                <>
                  <View style={styles.receiptRow}>
                    <View style={styles.itemNameRow}>
                      <View style={[styles.iconBox, iconStyle, hideActions && { width: 20, height: 20, marginRight: 4, borderRadius: 0 }]}>
                        <Icon name={iconName} size={hideActions ? 23 : 14} color={iconColor} />
                      </View>
                      <Text allowFontScaling={allowFontScaling} style={[styles.itemNameText, hideActions && { fontSize: 23, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>
                        {entry.displayName}
                      </Text>
                    </View>
                    <Text allowFontScaling={allowFontScaling} style={[styles.itemVal, hideActions && { fontSize: 23, color: '#000000' }]}>
                      {line1}
                    </Text>
                  </View>
                  {line2 !== '' && (
                    <View style={[styles.receiptRow, { marginTop: -4 }]}>
                      <View />
                      <Text allowFontScaling={allowFontScaling} style={[styles.itemVal, { fontSize: hideActions ? 21 : 13, opacity: hideActions ? 1 : 0.8, color: hideActions ? '#000000' : undefined }]}>
                        {line2}
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        ))}

        {(raniRupaEntries.length > 0 || customRupuSummaryLine) && <Divider style={[styles.divider, { marginVertical: 2 }]} />}

        {Object.entries(groupedRaniRupa).map(([itemType, entries]) => {
          const sumPure = entries.reduce((sum, e) => {
            const weight = e.weight || 0; const touch = e.touch || 100;
            if (itemType === 'rupu') return sum + customFormatPureSilver(weight, touch);
            return sum + formatPureGoldPrecise(weight * touch / 100);
          }, 0);
          const sumDebt = entries.reduce((sum, e) => {
            const weight = e.weight || 0; const touch = e.touch || 100; const cut = e.cut || 0;
            if (itemType === 'rupu') return sum + customFormatPureSilver(weight, touch);
            return sum + formatPureGoldPrecise(weight * (touch - cut) / 100);
          }, 0);
          const hasCut = entries.some(e => (e.cut || 0) > 0);
          const displayType = itemType === 'gold999' ? 'Pure Gold 999' : itemType === 'gold995' ? 'Pure Gold 995' : 'Pure Silver';
          const decimals = itemType === 'silver' ? 0 : 3;
          const firstCut = entries[0].cut || 0;
          const summaryLine = hasCut && itemType === 'gold999' ? `${sumPure.toFixed(decimals)}g : ${sumDebt.toFixed(3)}g (-${Math.abs(firstCut).toFixed(2)})` : `${sumPure.toFixed(decimals)}g`;
          if (itemType === 'silver' && customRupuSummaryLine) return null;
          return (
            <View key={`summary-${itemType}`} style={[styles.entryWrapper, hideActions && { marginBottom: 3 }]}>
              <View style={styles.receiptRow}>
                <View style={styles.itemNameRow}>
                  <View style={[styles.iconBox, hideActions ? styles.iconPrint : styles.iconPurchase, hideActions && { width: 20, height: 20, marginRight: 4, borderRadius: 0 }]}>
                    <Icon name="minus" size={14} color={hideActions ? '#000000' : theme.colors.onSurfaceVariant} />
                  </View>
                  <Text allowFontScaling={allowFontScaling} style={[styles.itemNameText, hideActions && { fontSize: 23, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>
                    {displayType}
                  </Text>
                </View>
                <Text allowFontScaling={allowFontScaling} style={[styles.itemVal, hideActions && { fontSize: 23, color: '#000000' }]}>
                  {summaryLine}
                </Text>
              </View>
            </View>
          );
        })}

        {customRupuSummaryLine && (
          <View style={[styles.entryWrapper, hideActions && { marginBottom: 3 }]}>
            <View style={styles.receiptRow}>
              <View style={styles.itemNameRow}>
                <View style={[styles.iconBox, hideActions ? styles.iconPrint : styles.iconPurchase, hideActions && { width: 20, height: 20, marginRight: 4, borderRadius: 0 }]}>
                  <Icon name="minus" size={14} color={hideActions ? '#000000' : theme.colors.onSurfaceVariant} />
                </View>
                <Text allowFontScaling={allowFontScaling} style={[styles.itemNameText, hideActions && { fontSize: 23, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>
                  Pure Silver
                </Text>
              </View>
              <Text allowFontScaling={allowFontScaling} style={[styles.itemVal, hideActions && { fontSize: 23, color: '#000000' }]}>
                {customRupuSummaryLine}
              </Text>
            </View>
          </View>
        )}

        {!isMetalOnly && processedEntries.length > 0 &&
          (hideActions ? <View style={{ height: 1, backgroundColor: '#cccccc', marginVertical: 5 }} /> : <Divider style={styles.divider} />)
        }

        {!isMetalOnly && (
          processedEntries.length === 0 ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, hideActions && { fontSize: 22, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>Money-Only</Text>
            </View>
          ) : (
            <View style={[styles.totalRow, hideActions && { paddingHorizontal: 5 }]}>
              <Text style={[styles.totalLabel, hideActions && { fontSize: 22, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>Total</Text>
              <Text style={[styles.totalAmount, hideActions && { fontSize: 25, color: '#000000', fontFamily: 'Outfit_700Bold' }]}>
                ₹{formatIndianNumber(Math.abs(transaction.total))}
              </Text>
            </View>
          )
        )}

        {!isMetalOnly &&
          (hideActions ? <View style={{ height: 1, backgroundColor: '#cccccc', marginVertical: 5 }} /> : <Divider style={styles.divider} />)
        }

        {!isMetalOnly && (
          <View style={[styles.receiptRow, styles.footerRow, hideActions && { paddingHorizontal: 5 }]}>
            <Text style={[styles.footerLabel, hideActions && { fontSize: 20, color: '#000000', fontFamily: 'Outfit_600SemiBold' }]}>
              {transaction.amountPaid > 0 ? 'Received' : 'Given'}:
            </Text>
            <Text style={[styles.footerAmount, { color: hideActions ? '#000000' : (transaction.amountPaid >= 0 ? theme.colors.success : theme.colors.primary) }, hideActions && { fontSize: 22, fontFamily: 'Outfit_600SemiBold' }]}>
              {' '}{transaction.amountPaid >= 0 ? '+' : '-'}₹{formatIndianNumber(Math.abs(transaction.amountPaid))}
            </Text>
            <View style={{ flex: 1 }} />
            <View>
              <Text style={[styles.balanceLabel, { color: hideActions ? '#000000' : transactionBalanceColor }, hideActions && { fontSize: 15, fontFamily: 'Outfit_600SemiBold' }]}>
                {transactionBalanceLabel}
              </Text>
            </View>
          </View>
        )}
      </View>

      {transaction.note && transaction.note.trim() !== '' && (
        <View style={[styles.noteRow, hideActions && { marginTop: 6, paddingTop: 6, borderTopColor: '#cccccc', borderTopWidth: 1 }]}>
          <Text style={[styles.noteLabel, hideActions && { fontSize: 22, color: '#444444', fontFamily: 'Outfit_600SemiBold' }]}>NOTE</Text>
          <Text style={[styles.noteText, hideActions && { fontSize: 22, color: '#000000', marginLeft: 6, fontFamily: 'Outfit_400Regular' }]}>{transaction.note}</Text>
        </View>
      )}

      {hideActions && !isRaniRupaSellTransaction && transaction.customerCurrentBalance && (() => {
        const customerBalance = transaction.customerCurrentBalance;
        const balances: string[] = [];
        const debts: string[] = [];
        if (customerBalance.balance && Math.abs(customerBalance.balance) >= 1) {
          if (customerBalance.balance > 0) balances.push(`₹${formatIndianNumber(customerBalance.balance)}`);
          else debts.push(`₹${formatIndianNumber(Math.abs(customerBalance.balance))}`);
        }
        if (customerBalance.gold999 && Math.abs(customerBalance.gold999) >= 0.001) {
          if (customerBalance.gold999 > 0) balances.push(`Gold 999 ${customerBalance.gold999.toFixed(3)}g`);
          else debts.push(`Gold 999 ${Math.abs(customerBalance.gold999).toFixed(3)}g`);
        }
        if (customerBalance.gold995 && Math.abs(customerBalance.gold995) >= 0.001) {
          if (customerBalance.gold995 > 0) balances.push(`Gold 995 ${customerBalance.gold995.toFixed(3)}g`);
          else debts.push(`Gold 995 ${Math.abs(customerBalance.gold995).toFixed(3)}g`);
        }
        if (customerBalance.silver && Math.abs(customerBalance.silver) >= 1) {
          if (customerBalance.silver > 0) balances.push(`Silver ${Math.abs(customerBalance.silver).toFixed(0)}g`);
          else debts.push(`Silver ${Math.abs(customerBalance.silver).toFixed(0)}g`);
        }
        const hasMoneyBalance = customerBalance.balance && Math.abs(customerBalance.balance) >= 1;
        const hasGold999Balance = customerBalance.gold999 && Math.abs(customerBalance.gold999) >= 0.001;
        const hasGold995Balance = customerBalance.gold995 && Math.abs(customerBalance.gold995) >= 0.001;
        const hasSilverBalance = customerBalance.silver && Math.abs(customerBalance.silver) >= 1;
        const hasAnyBalanceOrDebt = Boolean(hasMoneyBalance || hasGold999Balance || hasGold995Balance || hasSilverBalance);
        return hasAnyBalanceOrDebt ? (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: hideActions ? '#cccccc' : 'rgba(0,0,0,0.05)' }}>
            {balances.length > 0 && (
              <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 20, color: hideActions ? '#000000' : theme.colors.success, marginBottom: debts.length > 0 ? 4 : 0 }}>
                Balance: {balances.join(', ')}
              </Text>
            )}
            {debts.length > 0 && (
              <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 20, color: hideActions ? '#000000' : theme.colors.debtColor }}>
                Debt: {debts.join(', ')}
              </Text>
            )}
          </View>
        ) : null;
      })()}
    </View>
  );
});

// Filter Options
const ITEM_FILTER_OPTIONS = [
  { label: 'Gold 999', value: 'gold999' },
  { label: 'Gold 995', value: 'gold995' },
  { label: 'Rani', value: 'rani' },
  { label: 'Silver', value: 'silver' },
  { label: 'Rupu', value: 'rupu' },
  { label: 'Money Only', value: 'money' },
];

export const HistoryScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [itemFilters, setItemFilters] = useState<string[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'today' | 'last7days' | 'last30days' | 'custom'>('today');
  const [error, setError] = useState<string | null>(null);
  const { navigateToSettings, loadTransactionForEdit } = useAppContext();
  const navigation = useNavigation();
  
  // State for sharing
  const [sharingTransactionId, setSharingTransactionId] = useState<string | null>(null);
  const shareableCardRef = useRef<View>(null);
  
  // Date Picker States
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [previousFilter, setPreviousFilter] = useState<'today' | 'last7days' | 'last30days'>('today');
  
  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<any[]>([]);
  
  // Export State
  const [showExportDatePicker, setShowExportDatePicker] = useState(false);
  const [exportDate, setExportDate] = useState<Date>(new Date());
  
  // Enhanced Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'capturing' | 'generating' | 'cleaning'>('idle');
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  
  // Printing State
  const [isPrinting, setIsPrinting] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 200;
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pageOffsetRef = useRef(0);
  const dateRangeRef = useRef({ startDate: '', endDate: '' });
  // Prevents applyFilters useEffect from re-running after loadMore (it already updates filteredTransactions directly)
  const skipNextApplyFiltersRef = useRef(false);
  // Prevents loadTransactions from firing after a filter switch that reuses in-memory data
  const skipNextLoadRef = useRef(false);
  // Session cache: accumulates fetched transactions within a focus session.
  // Cleared on screen focus so new transactions from other screens are picked up.
  const txStoreRef = useRef<{
    data: Transaction[];
    coveredStart: string;  // requested startDate when this store was built
    coveredEnd: string;    // requested endDate when this store was built
    fullyLoaded: boolean;  // true = no more DB pages exist for this range
  } | null>(null);


  const formatDate = (date: Date) => formatDateLabel(date);

  const handleDeleteTransaction = async (transaction: Transaction) => {
    setAlertTitle('Delete Transaction');
    setAlertMessage(`Are you sure you want to delete this transaction?\n\nCustomer: ${transaction.customerName}\nDate: ${formatFullDate(transaction.date)}\n\nThis action cannot be undone and will reverse all inventory changes.`);
    setAlertButtons([
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await TransactionService.deleteTransaction(transaction.id);
            if (result) {
              await loadTransactions(true);
              setAlertTitle('Success');
              setAlertMessage('Transaction deleted successfully');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            } else {
              setAlertTitle('Error');
              setAlertMessage('Failed to delete transaction');
              setAlertButtons([{ text: 'OK' }]);
              setAlertVisible(true);
            }
          } catch (error) {
            setAlertTitle('Error');
            setAlertMessage(error instanceof Error ? error.message : 'Failed to delete transaction');
            setAlertButtons([{ text: 'OK' }]);
            setAlertVisible(true);
          }
        },
      },
    ]);
    setAlertVisible(true);
  };

  // Request Bluetooth permissions for Android
  const requestBluetoothPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    
    try {
      const apiLevel = Platform.Version;
      
      if (apiLevel >= 31) {
        // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
        const scanGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: 'Bluetooth Scan Permission',
            message: 'This app needs Bluetooth scan permission to find printers.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        const connectGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'Bluetooth Connect Permission',
            message: 'This app needs Bluetooth connect permission to connect to printers.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return scanGranted === PermissionsAndroid.RESULTS.GRANTED && 
               connectGranted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android 11 and below
        const fineLocationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs location permission to scan for Bluetooth devices.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return fineLocationGranted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.error('Error requesting Bluetooth permissions:', err);
      return false;
    }
  };

  // Connect to a printer (Bluetooth must be paired at OS level)
  const connectToPrinter = async (printerAddress: string): Promise<boolean> => {
    try {
      // For Bluetooth, connection is handled during print
      // Just store the address for later use
      setConnectedPrinter(printerAddress);
      return true;
    } catch (error) {
      console.error('Error connecting to printer:', error);
      return false;
    }
  };

  // Print image to thermal printer - chunked approach to prevent height-based scaling
  const printImage = async (imageUri: string | any): Promise<void> => {
    try {
      let uri: string = typeof imageUri === 'string' ? imageUri : imageUri?.uri;
      if (!uri) throw new Error('Invalid URI');

      const { width, height } = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const Image = require('react-native').Image;
          Image.getSize(uri, (w: number, h: number) => resolve({ width: w, height: h }), reject);
        }
      );

      const { default: ImageEditor } = require('@react-native-community/image-editor');

      const CHUNK_HEIGHT = 256; // ← was 400, must be ≤256 or library rescales the chunk
      const numChunks = Math.ceil(height / CHUNK_HEIGHT);
      const chunkUrisToDelete: string[] = [];
      let combinedPayload = '';

      for (let i = 0; i < numChunks; i++) {
        const offsetY = i * CHUNK_HEIGHT;
        const currentChunkHeight = Math.min(CHUNK_HEIGHT, height - offsetY);

        const chunkResult = await ImageEditor.cropImage(uri, {
          offset: { x: 0, y: offsetY },
          size: { width, height: currentChunkHeight },
        });

        const chunkUri = typeof chunkResult === 'string' ? chunkResult : chunkResult.uri;
        chunkUrisToDelete.push(chunkUri);

        const base64 = await FileSystem.readAsStringAsync(chunkUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // \n after </img> is required by the parser — it is NOT a paper feed
        combinedPayload += `[C]<img>data:image/png;base64,${base64}</img>\n`;
      }

      // Single call = single job = no hardware end-of-job gap between chunks
      await ThermalPrinterModule.printBluetooth({
        payload: combinedPayload,
        printerWidthMM: 80,
        printerNbrCharactersPerLine: 48,
        mmFeedPaper: 0,  // ← suppress the default 20mm auto-feed at job end
        autoCut: false,
      });

      // Intentional paper feed after the full image is done
      await ThermalPrinterModule.printBluetooth({
        payload: '[L]\n[L]\n[L]\n',
        printerWidthMM: 80,
        printerNbrCharactersPerLine: 48,
        mmFeedPaper: 20,
        autoCut: false,
      });

      for (const chunkUri of chunkUrisToDelete) {
        try { await FileSystem.deleteAsync(chunkUri, { idempotent: true }); } catch (e) {}
      }
    } catch (error) {
      console.error('Print execution failed:', error);
      throw error;
    }
  };

  // Handle the share/print action choice
  const handleShareOrPrintTransaction = (transaction: Transaction) => {
    setAlertTitle('Share or Print');
    setAlertMessage('Would you like to share this transaction as an image or print it to your thermal printer?');
    setAlertButtons([
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Share',
        onPress: () => performShare(transaction),
      },
      {
        text: 'Print',
        onPress: () => handlePrintTransaction(transaction),
      },
    ]);
    setAlertVisible(true);
  };

  // Original share functionality
  const performShare = async (transaction: Transaction) => {
    try {
      setSharingTransactionId(transaction.id);
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!shareableCardRef.current) {
        setSharingTransactionId(null);
        return;
      }
      const uri = await captureRef(shareableCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        setAlertTitle('Error');
        setAlertMessage('Sharing is not available');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        setSharingTransactionId(null);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Transaction - ${transaction.customerName}` });
      setSharingTransactionId(null);
    } catch (error) {
      setSharingTransactionId(null);
    }
  };

  // Handle print transaction
  const handlePrintTransaction = async (transaction: Transaction) => {
    try {
      // Request Bluetooth permissions first
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        setAlertTitle('Permission Required');
        setAlertMessage('Bluetooth permissions are required to print. Please enable them in settings.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }

      setIsPrinting(true);

      // Hardcoded printer MAC address
      const printerAddress = '00:1B:10:73:14:45';

      // If already connected to the printer, use it directly
      if (connectedPrinter === printerAddress) {
        await performPrint(transaction);
        return;
      }

      // Try to connect to the hardcoded printer
      try {
        await connectToPrinter(printerAddress);
        await performPrint(transaction);
      } catch (connectError) {
        console.error('Failed to connect to printer:', connectError);
        setAlertTitle('Printer Connection Failed');
        setAlertMessage('Could not connect to the thermal printer. Please ensure the printer is paired and powered on.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
      }
    } catch (error) {
      console.error('Print error:', error);
      setAlertTitle('Print Error');
      setAlertMessage(error instanceof Error ? error.message : 'Failed to initialize printing');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } finally {
      setIsPrinting(false);
    }
  };

  // Perform the actual printing
  const performPrint = async (transaction: Transaction) => {
    try {
      setSharingTransactionId(transaction.id);
      // Increased delay to ensure the hidden view renders fully
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (!shareableCardRef.current) {
        throw new Error('Could not capture transaction card');
      }
      
      // Capture at fixed dot-density for 80mm printer (400 dots for safe width)
      // Fixed width prevents printer driver from auto-scaling based on aspect ratio
      const uri = await captureRef(shareableCardRef, { 
        format: 'png', 
        quality: 1, 
        result: 'tmpfile',
        width: 576, // Native dot width for 80mm / 203 DPI printer — prevents upscaling
      });
      
      // Print the image
      await printImage(uri);
      
      setSharingTransactionId(null);
      setIsPrinting(false);
      
      setAlertTitle('Print Success');
      setAlertMessage('Transaction printed successfully!');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } catch (error) {
      setSharingTransactionId(null);
      setIsPrinting(false);
      throw error;
    }
  };

  // Legacy function name for compatibility (now shows dialog)
  const handleShareTransaction = (transaction: Transaction) => {
    handleShareOrPrintTransaction(transaction);
  };

  // --- EXPORT LOGIC ---
  const handleExportDateChange = (event: any, selectedDate?: Date) => {
    setShowExportDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setExportDate(selectedDate);
      performExport(selectedDate);
    }
  };

  const performExport = async (date: Date) => {
    setIsExporting(true);
    setExportStatus('generating');
    try {
      const start = new Date(date); start.setHours(0,0,0,0);
      const end = new Date(date); end.setHours(23,59,59,999);
      
      // Only fetch transactions created on this date (not those with ledger activity on this date)
      const txs = await TransactionService.getTransactionsByDateRange(start.toISOString(), end.toISOString());
      const validTxs = txs.filter(t =>
        t.customerName.toLowerCase() !== 'adjust' &&
        !(t.entries.length === 1 && t.entries[0].type === 'money')
      );

      // Fetch rate cuts for this date (cut_date is stored as unix ms)
      const rateCuts = await RateCutService.getRateCutsByDateRange(start.getTime(), end.getTime());
      
      if (validTxs.length === 0 && rateCuts.length === 0) {
        setIsExporting(false);
        setAlertTitle('No Data');
        setAlertMessage('No transactions or rate cuts found for this date.');
        setAlertButtons([{ text: 'OK' }]);
        setAlertVisible(true);
        return;
      }
      
      generatePDFDirectly(validTxs, date, rateCuts);
    } catch (e) {
      setIsExporting(false);
      console.error(e);
      setAlertTitle('Error');
      setAlertMessage('Failed to prepare export.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    }
  };

  const generateTransactionCardHTML = (transaction: Transaction) => {
    const isMetalOnly = transaction.entries.some(entry => entry.metalOnly === true);
    
    // Preprocess entries to add numbered labels for Rani/Rupa when multiple
    const processedEntries = transaction.entries.map((entry, index) => {
      let displayName = getItemDisplayName(entry);
      if (entry.itemType === 'rani' || entry.itemType === 'rupu') {
        const type = entry.itemType;
        const count = transaction.entries.filter(e => e.itemType === type).length;
        if (count > 1) {
          const itemIndex = transaction.entries.slice(0, index).filter(e => e.itemType === type).length + 1;
          displayName = `${displayName} ${itemIndex}`;
        }
      } else if (entry.stock_id && entry.metalOnly && entry.type === 'sell') {
        // For Rani/Rupa sell entries, show as Rani or Rupu
        displayName = entry.itemType === 'gold999' || entry.itemType === 'gold995' ? 'Rani' : 'Rupu';
      } else if (entry.type === 'money' && entry.createdAt) {
        // Format date as DD/MM HH:MM am/pm
        const date = new Date(entry.createdAt);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        displayName = `Money (${day}/${month} ${hour12}:${minutes} ${ampm})`;
      }
      return { ...entry, displayName };
    });

    // Separate Rani/Rupa sell entries (metal-only with stock_id)
    const raniRupaEntries = processedEntries.filter(e => e.stock_id && e.metalOnly && e.type === 'sell');

    // Group Rani/Rupa entries by itemType for summary
    const groupedRaniRupa = raniRupaEntries.reduce((acc, entry) => {
      let groupKey = entry.itemType;
      // Map to metal types for summary
      if (entry.itemType === 'rani') {
          groupKey = (entry.cut || 0) > 0 ? 'gold999' : 'gold995';
      } else if (entry.itemType === 'rupu') {
          groupKey = 'silver';
      }
      
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(entry);
      return acc;
    }, {} as Record<string, typeof processedEntries>);

    // Custom Rupu Summary Logic
    const isAllRupu = transaction.entries.length > 1 && transaction.entries.every(e => e.itemType === 'rupu');
    let customRupuSummaryLine: string | null = null;
    
    if (isAllRupu) {
      const isPurchase = transaction.entries.some(e => e.type === 'purchase');
      const isSell = transaction.entries.some(e => e.type === 'sell');
      let showCustomSummary = false;
      
      if (isPurchase) {
        const allPriceZero = transaction.entries.every(e => !e.price || e.price === 0);
        const firstMetalOnly = transaction.entries[0].metalOnly;
        if (allPriceZero || firstMetalOnly) {
          showCustomSummary = true;
        }
      } else if (isSell) {
        const allTouchHigh = transaction.entries.every(e => (e.touch || 0) >= 98);
        if (allTouchHigh) {
          showCustomSummary = true;
        }
      }

      if (showCustomSummary) {
        const totalW = transaction.entries.reduce((sum, e) => sum + (e.weight || 0), 0);
        // Assuming customFormatPureSilver is available globally or imported
        const totalP = transaction.entries.reduce((sum, e) => {
           // Fallback logic inside the sum in case customFormatPureSilver doesn't exist here, 
           // but it is available since it's used below in groupedRaniRupa.
           return sum + customFormatPureSilver(e.weight || 0, e.touch || 100);
        }, 0);
        const avgT = totalW > 0 ? (totalP / totalW) * 100 : 0;
        customRupuSummaryLine = `${totalW.toFixed(0)}g : ${avgT.toFixed(2)}% : ${totalP.toFixed(0)}g`;
      }
    }

    const amountColor = getAmountColor(transaction);
    const formattedDate = formatFullDate(transaction.date);
    const formattedAmount = !isMetalOnly ? formatTransactionAmount(transaction) : '';

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="customer-name">${transaction.customerName}</div>
            <div class="date">${formattedDate}</div>
          </div>
          <div class="amount" style="color: ${amountColor}">${formattedAmount}</div>
        </div>
        
        <div class="receipt-section">
          ${processedEntries.map(entry => {
             // Logic for money entries: 'give' -> like sell (top-right), 'receive' -> like purchase (bottom-left)
             const isMoneyGive = entry.type === 'money' && entry.moneyType === 'give';
             const isMoneyReceive = entry.type === 'money' && entry.moneyType === 'receive';

             const isSell = entry.type === 'sell' || isMoneyGive;
             const isPurchase = entry.type === 'purchase' || isMoneyReceive;
             const iconChar = isSell ? '↗' : isPurchase ? '↙' : '₹';
             
             const { line1, line2 } = getEntryDisplayDataModule(entry);

             return `
               <div class="entry-row">
                 <div class="item-name-row">
                   <div class="icon-box">${iconChar}</div>
                   <span class="item-name">${entry.displayName}</span>
                 </div>
                 <span class="item-val">${line1}</span>
               </div>
               ${(line2 !== '') ? `
                 <div class="entry-row" style="margin-top: -2px;">
                   <div></div>
                   <span class="item-val" style="font-size: 9px;">${line2}</span>
                 </div>
               ` : ''}
             `;
          }).join('')}
          
          ${(raniRupaEntries.length > 0 || customRupuSummaryLine) ? '<div class="divider"></div>' : ''}
          
          ${Object.entries(groupedRaniRupa).map(([itemType, entries]) => {
            const sumPure = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = touch/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + (formatPureGoldPrecise(rawPure));
                }
              }, 0);
              
              const sumDebt = entries.reduce((sum, e) => {
                const weight = e.weight || 0;
                const touch = e.touch || 100;
                const cut = e.cut || 0;
                
                if (itemType === 'rupu') {
                  return sum + customFormatPureSilver(weight, touch);
                } else {
                  const effectiveTouch = (touch - cut)/100;
                  const rawPure = (weight * effectiveTouch);
                  return sum + formatPureGoldPrecise(rawPure);
                }
              }, 0);
            
            const hasCut = entries.some(e => (e.cut || 0) > 0);
            const displayType = itemType === 'gold999' ? 'Pure Gold 999' : itemType === 'gold995' ? 'Pure Gold 995' : 'Pure Silver';
            const decimals = itemType === 'silver' ? 0 : 3;
            const firstCut = entries[0].cut || 0;
            const line1 = hasCut && itemType === 'gold999' ? `${sumPure.toFixed(decimals)}g : ${sumDebt.toFixed(3)}g (-${Math.abs(firstCut).toFixed(2)}%)` : `${sumPure.toFixed(decimals)}g`;

            if (itemType === 'silver' && customRupuSummaryLine) return ''; // Skip default if custom will render
            
            return `
              <div class="entry-row">
                <div class="item-name-row">
                  <div class="icon-box">-</div>
                  <span class="item-name">${displayType}</span>
                </div>
                <span class="item-val">${line1}</span>
              </div>
            `;
          }).join('')}
          
          ${customRupuSummaryLine ? `
            <div class="entry-row">
              <div class="item-name-row">
                <div class="icon-box">-</div>
                <span class="item-name">Pure Silver</span>
              </div>
              <span class="item-val">${customRupuSummaryLine}</span>
            </div>
          ` : ''}
          
          ${(!isMetalOnly && processedEntries.length > 0) ? '<div class="divider"></div>' : ''}
          
          ${(!isMetalOnly) ? (
              processedEntries.length === 0 ? `
                <div class="total-row">
                  <span class="total-label">Money-Only</span>
                </div>
              ` : `
                <div class="total-row">
                  <span class="total-label">Total</span>
                  <span class="total-amount">₹${formatIndianNumber(Math.abs(transaction.total))}</span>
                </div>
              `
          ) : ''}
          
          ${(!isMetalOnly) ? '<div class="divider"></div>' : ''}
          
          ${(!isMetalOnly) ? `
             <div class="footer-row">
               <span class="footer-label">${transaction.amountPaid > 0 ? 'Received' : 'Given'}:</span>
               <span class="footer-amount" style="color: ${transaction.amountPaid >= 0 ? theme.colors.success : theme.colors.primary}">
                 ${transaction.amountPaid >= 0 ? '+' : '-'}₹${formatIndianNumber(Math.abs(transaction.amountPaid))}
               </span>
             </div>
          ` : ''}
        </div>
        
        ${(transaction.note && transaction.note.trim() !== '') ? `
          <div class="note-row">
            <span class="note-label">NOTE</span>
            <span class="note-text">${transaction.note}</span>
          </div>
        ` : ''}
      </div>
    `;
  };

  const generateRateCutCardHTML = (item: RateCutRecord): string => {
    const isGold = item.metal_type.includes('gold');
    const metalLabel = item.metal_type === 'gold999' ? 'Gold 999'
      : item.metal_type === 'gold995' ? 'Gold 995' : 'Silver';
    const cutDate = new Date(item.cut_date);
    const formattedDate = `${cutDate.getDate().toString().padStart(2, '0')}/${(cutDate.getMonth() + 1).toString().padStart(2, '0')}/${cutDate.getFullYear()}`;
    const directionLabel = item.direction === 'sell' ? 'Sell' : 'Buy';
    const metalBadgeColor = isGold ? '#6F4C00' : '#263238';
    const metalBadgeBg = isGold ? '#FFF8E1' : '#ECEFF1';
    const metalBadgeBorder = isGold ? 'rgba(255,193,7,0.3)' : 'rgba(120,144,156,0.3)';
    const dirBadgeColor = item.direction === 'sell' ? '#C62828' : '#2E7D32';
    const dirBadgeBg = item.direction === 'sell' ? '#FFEBEE' : '#E8F5E9';
    const dirBadgeBorder = item.direction === 'sell' ? 'rgba(211,47,47,0.2)' : 'rgba(56,142,60,0.2)';
    const totalFormatted = formatIndianNumber(Math.abs(parseFloat(formatMoney(item.total_amount.toFixed(0)))));
    return `
      <div class="rc-card">
        <div class="rc-top">
          <span class="rc-date">${formattedDate}</span>
          <div class="rc-badges">
            <span class="rc-badge" style="color:${metalBadgeColor};background:${metalBadgeBg};border:1px solid ${metalBadgeBorder}">${metalLabel}</span>
            <span class="rc-badge" style="color:${dirBadgeColor};background:${dirBadgeBg};border:1px solid ${dirBadgeBorder}">${directionLabel}</span>
          </div>
        </div>
        <div class="rc-customer">${item.customer_name || 'Unknown'}</div>
        <div class="rc-row">
          <span class="rc-detail">Weight: <strong>${Math.abs(item.weight_cut).toFixed(3)}g</strong></span>
          <span class="rc-sep"> - </span>
          <span class="rc-detail">Price: <strong>₹${formatIndianNumber(item.rate)}</strong></span>
        </div>
        <div class="rc-row">
          <span class="rc-detail">Total: <strong class="rc-total">₹${totalFormatted}</strong></span>
        </div>
      </div>
    `;
  };

  const generatePDFDirectly = async (transactions: Transaction[], selectedDate: Date, rateCuts: RateCutRecord[] = []) => {
    // setIsExporting(true); // Already set in performExport
    // setExportStatus('generating'); // Already set in performExport
    setExportProgress({ current: 0, total: transactions.length });

    try {
      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

      const saveAndSharePdf = async (tempPdfUri: string) => {
        const dateStr = selectedDate.toLocaleDateString('en-GB').replace(/\//g, '-');
        const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
        const fileName = `HistoryExport-${dateStr}-${timeStr}.pdf`;
        const finalPdfUri = `${FileSystem.documentDirectory}${fileName}`;

        // Ensure deterministic destination and avoid move failure if the same name already exists.
        await FileSystem.deleteAsync(finalPdfUri, { idempotent: true });

        try {
          await FileSystem.moveAsync({ from: tempPdfUri, to: finalPdfUri });
        } catch {
          // Some platforms/storage providers fail move across boundaries; fallback to copy+delete.
          await FileSystem.copyAsync({ from: tempPdfUri, to: finalPdfUri });
          await FileSystem.deleteAsync(tempPdfUri, { idempotent: true });
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(finalPdfUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export History'
          });
        } else {
          setAlertTitle('Error');
          setAlertMessage('Sharing is not available on this device');
          setAlertButtons([{ text: 'OK' }]);
          setAlertVisible(true);
        }

        setTimeout(async () => {
          try {
            await FileSystem.deleteAsync(finalPdfUri, { idempotent: true });
          } catch (e) {}
        }, 5 * 60 * 1000);
      };

      let htmlBody = '';
      const chunkSize = 20;
      
      for (let i = 0; i < transactions.length; i += chunkSize) {
          const chunk = transactions.slice(i, i + chunkSize);
          
          // Allow UI to update
          await new Promise(resolve => setTimeout(resolve, 0));
          
          chunk.forEach(tx => {
              htmlBody += generateTransactionCardHTML(tx);
          });
          
          setExportProgress({ current: Math.min(i + chunkSize, transactions.length), total: transactions.length });
      }

      const html = `
        <html>
          <head>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              @media print { 
                body { -webkit-print-color-adjust: exact; } 
              }
              body { font-family: 'Outfit', sans-serif; padding: 8px; background: #fff; }
              .pdf-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; margin-top: -8px; }
              h1 { color: #000; font-size: 20px; font-weight: 700; margin: 0; flex: 1; text-align: center; }
              .export-date-label { position: fixed; bottom: 5px; right: 10px; font-size: 9px; color: #000; white-space: nowrap; background: #fff; padding: 2px 4px; border-radius: 4px; border: 1px solid #eee; z-index: 1000; }
              .container { column-count: 3; column-gap: 8px; column-fill: balance; }
              .card { break-inside: avoid; margin-bottom: 8px; background-color: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 10px; }
              .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
              .customer-name { font-weight: 700; font-size: 13px; color: #000; }
              .date { font-size: 9px; color: #333; font-weight: 400; margin-top: 2px; }
              .amount { font-weight: 700; font-size: 13px; color: #000; text-align: right; }
              .receipt-section { background-color: #fff; border-radius: 6px; padding: 7px; border: 1px solid #e8e8e8; }
              .entry-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
              .item-name-row { display: flex; align-items: center; }
              .icon-box { width: 14px; text-align: center; font-size: 10px; font-weight: 700; color: #000; margin-right: 4px; flex-shrink: 0; }
              .item-name { font-size: 11px; font-weight: 600; color: #000; }
              .item-val { font-size: 11px; color: #222; font-weight: 400; text-align: right; }
              .divider { height: 1px; background-color: #ccc; margin: 5px 0; }
              .total-row { display: flex; justify-content: space-between; align-items: center; }
              .total-label { font-size: 10px; font-weight: 600; color: #000; }
              .total-amount { font-size: 11px; font-weight: 700; color: #000; }
              .footer-row { display: flex; justify-content: space-between; align-items: center; }
              .footer-label { font-size: 10px; font-weight: 600; color: #000; margin-right: 4px; }
              .footer-amount { font-size: 11px; font-weight: 700; color: #000; }
              .note-row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px solid #ccc; }
              .note-label { font-size: 10px; font-weight: 600; color: #444; }
              .note-text { font-size: 10px; color: #000; text-align: right; flex: 1; margin-left: 6px; }
              /* Rate Cut Cards */
              .rc-section-heading { column-span: all; font-size: 11px; font-weight: 700; color: #44474F; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 6px 0; padding-top: 8px; border-top: 2px solid #005AC1; }
              .rc-card { break-inside: avoid; margin-bottom: 8px; background-color: #fff; border: 1px solid #0b0b0c; border-radius: 8px; padding: 10px; }
              .rc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
              .rc-date { font-size: 10px; color: #44474F; font-weight: 500; }
              .rc-badges { display: flex; gap: 5px; align-items: center; }
              .rc-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 50px; }
              .rc-customer { font-size: 12px; font-weight: 700; color: #1B1B1F; margin-bottom: 4px; }
              .rc-row { display: flex; align-items: center; margin-bottom: 3px; }
              .rc-detail { font-size: 11px; color: #44474F; }
              .rc-sep { font-size: 11px; color: #44474F; margin: 0 4px; }
              .rc-total { font-size: 13px; font-weight: 700; color: #1B1B1F; }
            </style>
          </head>
          <body>
            <div class="export-date-label">${String(new Date().getDate()).padStart(2,'0')}/${String(new Date().getMonth()+1).padStart(2,'0')}/${String(new Date().getFullYear()).slice(-2)}</div>
            <div class="pdf-header">
              <h1>Transaction History — ${formatDate(selectedDate)}</h1>
            </div>
            <div class="container">
              ${htmlBody}
              ${rateCuts.length > 0 ? `
                <div class="rc-section-heading">Rate Cuts — ${formatDate(selectedDate)}</div>
                ${rateCuts.map(rc => generateRateCutCardHTML(rc)).join('')}
              ` : ''}
            </div>
          </body>
        </html>
      `;

      try {
        const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false });
        await saveAndSharePdf(pdfUri);
      } catch (richPdfError) {
        console.error('Rich PDF generation failed, retrying with lightweight layout:', richPdfError);

        // Fallback layout is intentionally simple to reduce renderer/memory pressure.
        const simpleRows = transactions.map((tx, idx) => {
          const amountLabel = `₹${formatIndianNumber(Math.abs(tx.total || 0))}`;
          const paidLabel = `${tx.amountPaid >= 0 ? '+' : '-'}₹${formatIndianNumber(Math.abs(tx.amountPaid || 0))}`;
          const note = tx.note ? `<div class="note">Note: ${escapeHtml(tx.note)}</div>` : '';
          return `
            <div class="row">
              <div><strong>${idx + 1}. ${escapeHtml(tx.customerName)}</strong></div>
              <div>Date: ${escapeHtml(formatFullDate(tx.date))}</div>
              <div>Total: ${amountLabel} | Paid: ${paidLabel}</div>
              ${note}
            </div>
          `;
        }).join('');

        const fallbackHtml = `
          <html>
            <head>
              <style>
                body { font-family: sans-serif; padding: 12px; color: #111; }
                h1 { font-size: 18px; margin: 0 0 10px 0; }
                .row { border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin-bottom: 8px; page-break-inside: avoid; }
                .note { margin-top: 4px; font-size: 11px; color: #333; }
              </style>
            </head>
            <body>
              <h1>Transaction History - ${escapeHtml(formatDate(selectedDate))}</h1>
              ${simpleRows}
            </body>
          </html>
        `;

        const { uri: fallbackPdfUri } = await Print.printToFileAsync({ html: fallbackHtml, base64: false });
        await saveAndSharePdf(fallbackPdfUri);
      }
      
    } catch (error) {
      console.error('PDF Generation failed:', error);
      setAlertTitle('Export Failed');
      setAlertMessage('Could not generate PDF. Please free some storage space and try again.');
      setAlertButtons([{ text: 'OK' }]);
      setAlertVisible(true);
    } finally {
      setIsExporting(false);
      setExportStatus('idle');
    }
  };
  // ------------------------------------------------

  const getItemDisplayName = (entry: any): string => {
    if (entry.type === 'money') return 'Money';
    const typeMap: Record<string, string> = {
      'gold999': 'Gold 999', 'gold995': 'Gold 995', 'rani': 'Rani', 'silver': 'Silver', 'rupu': 'Rupu', 'money': 'Money',
    };
    return typeMap[entry.itemType] || entry.itemType;
  };

  const buildDateRange = (filterOverride?: typeof selectedFilter) => {
    const filter = filterOverride ?? selectedFilter;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (filter) {
      case 'today':
        return {
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
        };
      case 'last7days':
        return {
          startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(today.getTime() - 1).toISOString(),
        };
      case 'last30days':
        return {
          startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(today.getTime() - 1).toISOString(),
        };
      case 'custom':
        if (!customStartDate || !customEndDate) {
          return {
            startDate: today.toISOString(),
            endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
          };
        } else {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return { startDate: start.toISOString(), endDate: end.toISOString() };
        }
      default:
        return {
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
        };
    }
  };

  const loadTransactions = async (refresh = false) => {
    if (skipNextLoadRef.current && !refresh) {
      skipNextLoadRef.current = false;
      return;
    }
    try {
      if (!refresh) setIsLoading(true);
      setError(null);
      pageOffsetRef.current = 0;

      const { startDate, endDate } = buildDateRange();
      dateRangeRef.current = { startDate, endDate };

      const isPaginated = selectedFilter !== 'today';
      const fetched = await TransactionService.getTransactionsByDateRange(
        startDate, endDate,
        undefined, undefined,
        isPaginated ? PAGE_SIZE : undefined,
        isPaginated ? 0 : undefined
      );
      const filtered = fetched.filter(t => t.customerName.toLowerCase() !== 'adjust');
      setTransactions(filtered);
      setHasMore(isPaginated && fetched.length === PAGE_SIZE);
    } catch (error) {
      setError('Unable to load transaction history');
      if (!refresh) setTransactions([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreTransactions = async () => {
    if (isLoadingMore || !hasMore) return;
    try {
      setIsLoadingMore(true);
      pageOffsetRef.current += PAGE_SIZE;
      const { startDate, endDate } = dateRangeRef.current;
      const fetched = await TransactionService.getTransactionsByDateRange(
        startDate, endDate,
        undefined, undefined,
        PAGE_SIZE,
        pageOffsetRef.current
      );
      const newItems = fetched.filter(t => t.customerName.toLowerCase() !== 'adjust');
      const newFiltered = filterTransactions(newItems);
      // Extend the session store with the new page
      if (txStoreRef.current) {
        txStoreRef.current = {
          ...txStoreRef.current,
          data: [...txStoreRef.current.data, ...newItems],
          fullyLoaded: fetched.length < PAGE_SIZE,
        };
      }
      // Skip the applyFilters useEffect that fires when transactions state changes
      skipNextApplyFiltersRef.current = true;
      setTransactions(prev => [...prev, ...newItems]);
      setFilteredTransactions(prev => [...prev, ...newFiltered]);
      setHasMore(fetched.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleItemFilter = (value: string) => {
    setItemFilters(prev => {
      if (prev.includes(value)) return prev.filter(v => v !== value);
      return [...prev, value];
    });
  };

  // Pure filter logic — no state updates, safe to call from anywhere
  const filterTransactions = useCallback((data: Transaction[]) => {
    let result = data;
    if (itemFilters.length > 0) {
      result = result.filter(tx => {
        const isMoneyOnly = !tx.entries || tx.entries.length === 0;
        if (itemFilters.includes('money') && isMoneyOnly) return true;
        if (!isMoneyOnly) {
          return tx.entries.some(entry => itemFilters.includes(entry.itemType));
        }
        return false;
      });
    }
    if (searchQuery.trim()) {
      const searchTerm = searchQuery.trim().toLowerCase();
      result = result.filter(tx => {
        const customerMatch = tx.customerName.trim().toLowerCase().includes(searchTerm);
        const itemMatch = tx.entries.some(entry => getItemDisplayName(entry).toLowerCase().includes(searchTerm));
        return customerMatch || itemMatch;
      });
    }
    return result;
  }, [itemFilters, searchQuery]);

  const applyFilters = useCallback(() => {
    if (skipNextApplyFiltersRef.current) {
      skipNextApplyFiltersRef.current = false;
      return;
    }
    setFilteredTransactions(filterTransactions(transactions));
  }, [transactions, filterTransactions]);

  const handleFilterChange = (filter: typeof selectedFilter) => {
    if (filter === 'custom') {
      if (selectedFilter !== 'custom') setPreviousFilter(selectedFilter);
      setShowStartDatePicker(true);
      return;
    }

    setCustomStartDate(null);
    setCustomEndDate(null);

    if (filter === selectedFilter) return;

    // Reuse already-loaded data when switching between last7days and last30days.
    // Both share the same endDate (yesterday) and are strictly ordered by range size,
    // so the 7-day dataset is always a prefix (newest items) of the 30-day dataset.
    const canReuse =
      transactions.length > 0 &&
      ((filter === 'last30days' && selectedFilter === 'last7days') ||
        (filter === 'last7days' && selectedFilter === 'last30days'));

    if (canReuse) {
      const newRange = buildDateRange(filter);
      dateRangeRef.current = newRange;

      if (filter === 'last30days') {
        // Widening: existing data is already the newest portion of the 30-day window.
        // Treat it as the first page and let the user scroll to fetch older records.
        pageOffsetRef.current = transactions.length;
        setHasMore(true);
      } else {
        // Narrowing to 7 days: discard transactions older than 7 days.
        // Since data is sorted DESC, all 7-day items are at the front.
        const filtered7 = transactions.filter(
          t => t.date >= newRange.startDate && t.date <= newRange.endDate
        );
        // If every loaded item was within 7 days AND there were more pages, the
        // next scroll must still fetch more (they might still be within 7 days).
        const allWithin7Days = filtered7.length === transactions.length;
        pageOffsetRef.current = filtered7.length;
        setHasMore(allWithin7Days && hasMore);
        skipNextApplyFiltersRef.current = true;
        setTransactions(filtered7);
        setFilteredTransactions(filterTransactions(filtered7));
      }

      skipNextLoadRef.current = true;
      setSelectedFilter(filter);
      setPreviousFilter(filter);
      return;
    }

    setSelectedFilter(filter);
    setPreviousFilter(filter);
  };

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setCustomStartDate(selectedDate);
      setShowEndDatePicker(true);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setCustomEndDate(selectedDate);
      setSelectedFilter('custom');
    }
  };

  useEffect(() => { applyFilters(); }, [applyFilters]);
  // Clear session cache whenever the screen is navigated to (picks up new/edited transactions)
  useFocusEffect(useCallback(() => { txStoreRef.current = null; }, []));
  // Reload on focus AND on filter change — loadTransactions will use cache if range is covered
  useFocusEffect(useCallback(() => { loadTransactions(); }, [selectedFilter, customStartDate, customEndDate]));
  useFocusEffect(useCallback(() => {
      const onBackPress = () => { (navigation as any).navigate('Home'); return true; };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [navigation]));

  const handleCardDelete = useCallback((t: Transaction) => handleDeleteTransaction(t), []);
  const handleCardShare = useCallback((t: Transaction) => handleShareTransaction(t), []);
  const handleCardEdit = useCallback((id: string) => loadTransactionForEdit(id), [loadTransactionForEdit]);

  const renderItem = useCallback(({ item }: { item: Transaction }) => (
    <TransactionCard
      transaction={item}
      onDelete={handleCardDelete}
      onShare={handleCardShare}
      onEdit={handleCardEdit}
    />
  ), [handleCardDelete, handleCardShare, handleCardEdit]);

  // Empty State Component
  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="history" size={72} color={theme.colors.onSurfaceVariant} />
      <Text style={styles.emptyTitle}>
        No Transactions Found
      </Text>
      <Text style={styles.emptyDescription}>
        {selectedFilter !== 'today' 
          ? 'Try adjusting your filters or search query' 
          : 'No transactions recorded for today'}
      </Text>
      {selectedFilter !== 'today' && (
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => handleFilterChange('today')}
        >
          <Icon name="filter-remove-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Clear Filter</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Header Island (Title + Settings) */}
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>History</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={navigateToSettings}>
          <Icon name="cog" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      {/* 2. Toolbar Island (Search + Export) */}
      <View style={styles.toolbarIsland}>
        <View style={styles.searchContainer}>
          <Icon name="magnify" size={24} color={theme.colors.onSurfaceVariant} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={24} color={theme.colors.onSurfaceVariant}
                style={{ marginRight: -4 }}
              />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Export Button (Right of Search) */}
        <TouchableOpacity 
          style={styles.exportBtn} 
          onPress={() => setShowExportDatePicker(true)}
          disabled={isExporting}
        >
          {isExporting ? (
             <ActivityIndicator size={20} color={theme.colors.primary} />
          ) : (
             <Icon name="export-variant" size={24} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* 3. Filter Carousel */}
      <View style={styles.filterCarouselContainer}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterPill, 
              itemFilters.length > 0 && styles.filterPillActive, 
              { marginRight: 8, borderStyle: itemFilters.length === 0 ? 'dashed' : 'solid', 
                borderColor: itemFilters.length > 0 ? theme.colors.primary : 'rgba(0,0,0,0.2)',
                paddingHorizontal: 8, }
            ]}
            onPress={() => setShowFilterSheet(true)}
          >
             <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
               <Icon 
                 name="filter-variant" 
                 size={18} 
                 color={itemFilters.length > 0 ? theme.colors.onPrimary : theme.colors.primary} 
               />
               <Text style={[
                 styles.filterPillText, 
                 itemFilters.length > 0 && styles.filterPillTextActive,
               ]}>
                 {itemFilters.length === 0 ? 'All Items' : itemFilters.length === 1 ? ITEM_FILTER_OPTIONS.find(o => o.value === itemFilters[0])?.label : `${itemFilters.length} Items`}
               </Text>
               <Icon 
                 name="chevron-down" 
                 size={16} 
                 color={itemFilters.length > 0 ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} 
               />
            </View>
          </TouchableOpacity>

          <View style={{ width: 1, height: 24, backgroundColor: theme.colors.onSurfaceVariant, marginRight: 8 }} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterCarousel}>
            {['today', 'last7days', 'last30days', 'custom'].map((f) => {
              let label = '';
              if (f === 'today') label = 'Today';
              else if (f === 'last7days') label = 'Last 7 Days';
              else if (f === 'last30days') label = 'Last 30 Days';
              else {
                  if (customStartDate && customEndDate) {
                      const startStr = formatDate(customStartDate);
                      const endStr = formatDate(customEndDate);
                      if (startStr === endStr) label = startStr;
                      else label = `${startStr} - ${endStr}`;
                  } else {
                      label = 'Custom Range';
                  }
              }
              
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterPill, selectedFilter === f && styles.filterPillActive]}
                  onPress={() => handleFilterChange(f as any)}
                >
                  <Text style={[styles.filterPillText, selectedFilter === f && styles.filterPillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* 4. Transaction List */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadTransactions(true)} colors={[theme.colors.primary]} />
        }
        onEndReached={loadMoreTransactions}
        onEndReachedThreshold={0.2}
        maxToRenderPerBatch={15}
        initialNumToRender={15}
        windowSize={15}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>

    {/* Components (Alerts, Modals) */}
    <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} buttons={alertButtons} onDismiss={() => setAlertVisible(false)} />
    {showStartDatePicker && <DateTimePicker value={customStartDate || new Date()} mode="date" onChange={handleStartDateChange} />}
    {showEndDatePicker && <DateTimePicker value={customEndDate || customStartDate || new Date()} mode="date" onChange={handleEndDateChange} />}
    {showExportDatePicker && <DateTimePicker value={exportDate} mode="date" onChange={handleExportDateChange} maximumDate={new Date()} />}
    
    {/* Export Progress Modal */}
    <Modal visible={isExporting} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center'}}>
        <Surface style={{padding: 24, borderRadius: 16, width: 300, alignItems: 'center', backgroundColor: theme.colors.surface, elevation: 4}}>
          <ActivityIndicator size="large" color={theme.colors.primary} style={{marginBottom: 16}} />
          <Text variant="titleMedium" style={{marginBottom: 8, fontFamily: 'Outfit_600SemiBold', color: theme.colors.onSurface}}>
            {exportStatus === 'capturing' ? 'Capturing Transactions...' : 
             exportStatus === 'generating' ? 'Generating PDF...' : 
             exportStatus === 'cleaning' ? 'Cleaning up...' : 'Preparing...'}
          </Text>
          {exportStatus === 'capturing' && (
            <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant}}>
              {exportProgress.current} / {exportProgress.total}
            </Text>
          )}
        </Surface>
      </View>
    </Modal>

    {/* Filter Bottom Sheet */}
    <Modal
      visible={showFilterSheet}
      transparent
      animationType="slide"
      onRequestClose={() => setShowFilterSheet(false)}
    >
      <Pressable style={styles.sheetOverlay} onPress={() => setShowFilterSheet(false)}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter Items</Text>
            {itemFilters.length > 0 && (
                <TouchableOpacity onPress={() => setItemFilters([])}>
                    <Text style={{color: theme.colors.primary, fontFamily:'Outfit_600SemiBold'}}>Clear</Text>
                </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.sheetSubtitle}>Show transactions containing:</Text>
          
          <View style={styles.chipGrid}>
            {ITEM_FILTER_OPTIONS.map((option) => {
              const isSelected = itemFilters.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sheetChip, isSelected && styles.sheetChipSelected]}
                  onPress={() => toggleItemFilter(option.value)}
                >
                  {isSelected && <Icon name="check" size={16} color={theme.colors.primary} style={{marginRight:4}} />}
                  <Text style={[styles.sheetChipText, isSelected && styles.sheetChipTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button 
            mode="contained" 
            style={styles.applyButton} 
            onPress={() => setShowFilterSheet(false)}
            contentStyle={{height: 48}}
            labelStyle={{fontSize:16}}
          >
            Apply Filters
          </Button>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Hidden Share View */}
    {sharingTransactionId && (
      <View style={styles.hiddenCard}>
         <View ref={shareableCardRef} style={styles.shareableCardWrapper} collapsable={false}>
            {(() => {
               const tx = transactions.find(t => t.id === sharingTransactionId);
               // eslint-disable-next-line @typescript-eslint/no-empty-function
               const noop = () => {};
               return tx ? <TransactionCard transaction={tx} hideActions={true} allowFontScaling={false} isPrint={isPrinting} onDelete={noop} onShare={noop} onEdit={noop} /> : null;
            })()}
         </View>
      </View>
    )}

    {/* Printing Progress Modal */}
    <Modal visible={isPrinting} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center'}}>
        <Surface style={{padding: 24, borderRadius: 16, width: 300, alignItems: 'center', backgroundColor: theme.colors.surface, elevation: 4}}>
          <ActivityIndicator size="large" color={theme.colors.primary} style={{marginBottom: 16}} />
          <Text variant="titleMedium" style={{marginBottom: 8, fontFamily: 'Outfit_600SemiBold', color: theme.colors.onSurface}}>
            Printing...
          </Text>
          <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant, textAlign: 'center'}}>
            Please wait while the transaction is being printed.
          </Text>
        </Surface>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  // 1. Header Styles
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  screenTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: theme.colors.onPrimaryContainer,
    letterSpacing: -1,
  },
  settingsBtn: {
    width: 48,
    height: 48,
    marginRight: -7,
    marginTop: -2.5,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // 2. Toolbar Island
  toolbarIsland: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 50,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  exportBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  // 3. Filter Carousel
  filterCarouselContainer: {
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  filterCarousel: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: theme.colors.onPrimary,
  },
  // 4. Transaction Card
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  historyCard: {
    backgroundColor: theme.colors.surfaceContainerHigh || '#F0F2F5', 
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    elevation: 3, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBlock: {
    flex: 1,
  },
  customerName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: theme.colors.onSurface,
  },
  transactionDate: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  mainAmount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  balanceLabelContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balanceLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  receiptSection: {
    backgroundColor: theme.colors.surface, // Lighter inner card for depth
    borderRadius: 16,
    padding: 12,
  },
  entryWrapper: {
    marginBottom: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  iconSell: {
    backgroundColor: '#E8F5E9', // Light Green
  },
  iconPurchase: {
    backgroundColor: '#E3F2FD', // Light Blue
  },
  iconMoney: {
    backgroundColor: '#FFF8E1', // Light Orange
  },
  iconPrint: {
    backgroundColor: 'transparent',
    // align text baseline in container for the purely textual icons
  },
  itemNameText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  itemVal: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  divider: {
    marginVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    height: 1,
  },
  footerLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  footerRow: {
    justifyContent: 'flex-start',
  },
  // Actions
  cardTopActions: {
    marginBottom: 12,
    alignSelf: 'flex-end'
  },
  actionPill: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDelete: {
    backgroundColor: theme.colors.errorContainer,
  },
  btnShare: {
    backgroundColor: '#E8F5E9',
  },
  btnEdit: {
    backgroundColor: theme.colors.primaryContainer,
  },
  disabledButton: {
    opacity: 0.5,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  totalAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  footerAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  noteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  noteLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  noteText: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: 'right',
  },
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 20,
    marginTop: 16,
    marginBottom: 8,
    color: theme.colors.onSurface,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: 24,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    gap: 8,
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  hiddenCard: {
    position: 'absolute',
    left: -1000,
    top: 0,
  },
  shareableCardWrapper: {
    backgroundColor: '#FFFFFF', // Pure white for thermal printing
    padding: 0, // Zero padding to prevent clipping
    margin: 0, // Ensure NO margins are present
    width: 576, // Native dot width for 80mm / 203 DPI printer — prevents upscaling
  },
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    elevation: 24,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Outfit_700Bold', fontSize: 20, color: theme.colors.onSurface,
  },
  sheetSubtitle: {
    fontFamily: 'Outfit_400Regular', color: theme.colors.onSurfaceVariant, marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24,
  },
  sheetChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1, borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  sheetChipSelected: {
    backgroundColor: theme.colors.primaryContainer, 
    borderColor: theme.colors.primary,
  },
  sheetChipText: {
    fontFamily: 'Outfit_500Medium', color: theme.colors.onSurfaceVariant,
  },
  sheetChipTextSelected: {
    color: theme.colors.primary,
  },
  applyButton: {
    borderRadius: 100, overflow: 'hidden',
  },
});