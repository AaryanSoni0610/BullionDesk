**System Context:**
You are an expert React Native and SQLite performance optimization engineer. The current codebase uses `expo-sqlite`. The application is suffering from severe UI freezing and lag due to "N+1 Query" problems. The database is heavily querying child tables (e.g., `transaction_entries`, `ledger_entries`) inside `for...of` loops and `Promise.all` loops, causing massive serialization overhead across the React Native JS-to-Native bridge.

**Your Goal:**
Eradicate all N+1 queries. You will refactor the specified files to follow this strict Bulk-Fetch Pattern:
1. Fetch the parent records.
2. Extract all parent IDs into an array.
3. Fetch all child records in **one single query** using the `IN (...)` SQL clause.
4. Use standard JavaScript (`Map`, `reduce`, or `groupBy`) to stitch the children back to their parents in memory.

---

### 🟢 File 1: `transaction.service.ts` (The Primary Bottleneck)

**The Problem:**
Functions like `getAllTransactions`, `getTransactionsByCustomerId`, `getTransactionsByDateRange`, and `getDeletedTransactions` retrieve an array of transactions, then open a `for (const trans of transactions)` loop. Inside this loop, they execute `await DatabaseService.getAllAsyncBatch` to fetch `transaction_entries` and sometimes `ledger_entries`. Rendering 200 transactions results in 400+ sequential bridge crossings.

**The Solution Instructions for the Agent:**
1. Locate `getAllTransactions`, `getTransactionsByCustomerId`, `getTransactionsByDateRange`, and `getDeletedTransactions`.
2. Remove the `for (const trans of transactions)` loops entirely.
3. After fetching the `transactions` array, extract the IDs:
   ```typescript
   const transactionIds = transactions.map(t => t.id);
   if (transactionIds.length === 0) return [];
   ```
4. Construct a bulk query for the entries using SQLite's `IN` clause. *Note: SQLite has a variable limit (usually 999), so chunk the `transactionIds` if necessary, or safely join them if using `expo-sqlite` batching.*
   ```typescript
   const placeholders = transactionIds.map(() => '?').join(',');
   const allEntries = await DatabaseService.getAllAsyncBatch<any>(
     `SELECT * FROM transaction_entries WHERE transaction_id IN (${placeholders}) ORDER BY createdAt ASC`,
     transactionIds
   );
   ```
5. Do the same for `ledger_entries` (where applicable in `getTransactionsByDateRange`).
6. Create a JavaScript `Map` to group the entries by `transaction_id`:
   ```typescript
   const entriesByTxnId = new Map<string, TransactionEntry[]>();
   allEntries.forEach(entry => {
     // map entry fields...
     if (!entriesByTxnId.has(entry.transaction_id)) {
       entriesByTxnId.set(entry.transaction_id, []);
     }
     entriesByTxnId.get(entry.transaction_id)!.push(mappedEntry);
   });
   ```
7. Map over the `transactions` array, attach the corresponding entries from the `Map`, and return the result.

---

### 🟢 File 2: `CustomerListScreen.tsx`

**The Problem:**
In the `loadAllCustomers` function, there is a `Promise.all(allCustomers.map(...))` that calls `hasCustomerTransactions(customer.id)` for every single customer. If there are 500 customers, this triggers 500 queries immediately upon opening the screen.

**The Solution Instructions for the Agent:**
1. **Open `transaction.service.ts`** and add a new optimized method:
   ```typescript
   static async getCustomersWithTransactions(): Promise<Set<string>> {
     const db = DatabaseService.getDatabase();
     const rows = await db.getAllAsync<{ customerId: string }>(
       'SELECT DISTINCT customerId FROM transactions WHERE deleted_on IS NULL'
     );
     return new Set(rows.map(r => r.customerId));
   }
   ```
2. **Open `CustomerListScreen.tsx`**, locate `loadAllCustomers()`, and delete the `Promise.all` block.
3. Replace it with a single call to the new method:
   ```typescript
   const customersWithTxnsSet = await TransactionService.getCustomersWithTransactions();
   setCustomersWithTransactions(customersWithTxnsSet);
   ```

---

### 🟢 File 3: `HistoryScreen.tsx`

**The Problem:**
Inside the `TransactionCard` component, there is a `useEffect` that triggers when `hideActions` is true and it's not a RaniRupa transaction. It calls `CustomerService.getCustomerById(transaction.customerId)` to fetch the customer's balance. When scrolling through a flatlist of 200 history items, this triggers 200 individual customer fetch queries.

**The Solution Instructions for the Agent:**
1. Do not query the database from inside a FlatList item card. 
2. Modify `TransactionService.getTransactionsByDateRange` (which supplies data to this screen) to use a SQL `JOIN` to include the customer's current balance directly in the transaction result.
   *Modify the query in `transaction.service.ts` from:*
   `SELECT t.*, cb.last_gold999_lock_date... FROM transactions t LEFT JOIN customer_balances cb ON t.customerId = cb.customer_id`
   *To include the balance:*
   `SELECT t.*, cb.balance, cb.gold999, cb.gold995, cb.silver, cb.last_gold999_lock_date...`
3. Update the `Transaction` type to optionally include `customerCurrentBalance`.
4. In `HistoryScreen.tsx`, remove the `useEffect` from `TransactionCard` entirely, and use the pre-fetched balance data passed down through the `transaction` prop.

---

### 🟢 File 4: `database.sqlite.ts` (Export Functionality)

**The Problem:**
The `exportData()` function loops over all customers to fetch their balances, and loops over all transactions to fetch their entries. During a backup, if the user has 8,000 transactions, the app will completely freeze and likely crash the JS thread before the export finishes.

**The Solution Instructions for the Agent:**
1. Locate `exportData()`.
2. Remove the `for (const customer of customers)` and `for (const transaction of transactions)` loops.
3. Fetch all balances at once: 
   `const allBalances = await DatabaseService.getAllAsyncBatch('SELECT * FROM customer_balances');`
4. Fetch all entries at once: 
   `const allEntries = await DatabaseService.getAllAsyncBatch('SELECT * FROM transaction_entries');`
5. Group them using standard JavaScript maps (just like in the `transaction.service.ts` fix) and attach them to their respective parent objects before returning the JSON payload.

---

### 🟢 File 5: `LedgerScreen.tsx`

**The Note for the Agent:**
The lag in `LedgerScreen.tsx` happens inside `loadInventoryData`. However, the root cause here is actually the underlying call to `TransactionService.getTransactionsByDateRange`. 
*Instruction:* Once you refactor `transaction.service.ts` using the bulk-fetch pattern described in File 1, the `LedgerScreen` will automatically become lightning fast. No direct database query refactoring is required in the UI component itself, but verify that `calculateInventoryData` relies purely on the in-memory arrays returned by the optimized service.
