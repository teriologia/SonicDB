# @teriologia/sonicdb 💨
> Gotta query fast!

Stop treating your queries like a 'Labyrinth Zone' water level. SonicDB gets you in and out instantly.

[![NPM Version](https://img.shields.io/npm/v/@teriologia/sonicdb.svg)](https://www.npmjs.com/package/@teriologia/sonicdb)
[![License](https://img.shields.io/npm/l/@teriologia/sonicdb.svg)](https://github.com/Teriologia/SonicDB/blob/main/LICENSE)

## Features

* **⚡ Advanced Indexing:** Choose between **`hash`** indexes (default) for instant $O(1)$ equality lookups and a zero-dependency, self-balancing **`btree`** index for high-speed $O(\log n)$ range queries (`$gt`, `$lt`, etc.).
* **⏱️ Query Caching:** Automatically caches results of `find()` queries. Identical queries return instantly from memory (Cache Hit).
* **🔒 Type-Safe:** Fully written in TypeScript. Use Generics (`new SonicDB<IUser>()`) for complete auto-completion and type safety.
* **🔐 Validation:** Built-in schema validation (`{ age: Number }`) and uniqueness constraints (`{ key: 'email', unique: true }`).
* **🔄 Lifecycle Hooks:** Run custom logic *before* or *after* `create`, `update`, and `delete` events using `pre()` and `post()` hooks.
* **🔍 Rich Queries:** Supports advanced operators like `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, and `$nin`.
* **🚀 Full CRUD:** Complete `create`, `find`, `findOne`, `update`, `updateOne`, `delete`, `deleteMany` API.

---

## Installation

```bash
npm install @teriologia/sonicdb
```
---

## 🚀 Quick Start (TypeScript)

This example shows how to set up a database with validation, unique indexes, and the powerful `btree` index.

```typescript
import SonicDB from '@teriologia/sonicdb';

// 1. Define your data shape
interface IUser {
  id: number;
  username: string;
  email: string;
  age: number;
  createdAt?: Date; // Our hook will add this
  updatedAt?: Date; // Our hook will add this
}

// 2. Initialize the DB with schema and indexes
const User = new SonicDB<IUser>({
  schema: {
    username: String,
    email: String,
    age: Number,
    id: Number,
  },
  indexOn: [
    // 'email' uses 'hash' (default) for fast O(1) lookups
    { key: 'email', unique: true, type: 'hash' },
    
    // 'age' uses 'btree' for fast O(log n) range queries
    { key: 'age', type: 'btree' }
  ],
  // Query caching is enabled by default
  enableQueryCache: true
});

// 3. Register a 'pre:create' hook for timestamps
User.pre('create', (doc) => {
  const now = new Date();
  doc.createdAt = now;
  doc.updatedAt = now;
  console.log(`Hook: Setting timestamps for ${doc.username}`);
});

// 4. Create data
try {
  User.create({
    id: 1,
    username: 'sonic_fast',
    email: 'sonic@gottagofast.com',
    age: 28,
  });
  
  User.create({
    id: 2,
    username: 'tails',
    email: 'tails@workshop.com',
    age: 29,
  });

  // This one will fail (unique email)
  User.create({
    id: 3,
    username: 'fake_sonic',
    email: 'sonic@gottagofast.com', // Duplicate email
    age: 99,
  });
  
} catch (error) {
  console.error(`Error during creation: ${(error as Error).message}`);
  // > Error: Uniqueness Constraint Failed...
}

// 5. Query your data!
// This is a FAST query thanks to the B-Tree index
console.log('\n--- Finding users older than 28 ---');
const users = User.find({
  age: { $gt: 28 } // This is accelerated by the 'btree' index
});

console.log(users);
// Output: [ { id: 2, username: 'tails', ..., createdAt: ... } ]
```

### JavaScript (CommonJS) Usage

`SonicDB` works great in plain JavaScript. This example mirrors the TypeScript Quick Start, showing how schema validation and hooks work at runtime.

```javascript
// Note: .default is required when using CommonJS
const SonicDB = require('@teriologia/sonicdb').default;

// (Optional but recommended) Use JSDoc for type-hinting in your editor
/**
 * @typedef {object} IUser
 * @property {number} id
 * @property {string} username
 * @property {string} email
 * @property {number} age
 * @property {Date} [createdAt]
 * @property {Date} [updatedAt]
 */

// 1. Initialize the DB with schema and indexes
const User = new SonicDB({
  schema: {
    username: String,
    email: String,
    age: Number,
    id: Number,
  },
  indexOn: [
    // 'email' uses 'hash' (default) for fast O(1) lookups
    { key: 'email', unique: true, type: 'hash' },
    
    // 'age' uses 'btree' for fast O(log n) range queries
    { key: 'age', type: 'btree' }
  ]
});

// 2. Register a 'pre:create' hook for timestamps
User.pre('create', (doc) => {
  const now = new Date();
  doc.createdAt = now;
  doc.updatedAt = now;
  console.log(`Hook: Setting timestamps for ${doc.username}`);
});

// 3. Create data
try {
  User.create({
    id: 1,
    username: 'sonic_fast',
    email: 'sonic@gottagofast.com',
    age: 28,
  });
  
  User.create({
    id: 2,
    username: 'tails',
    email: 'tails@workshop.com',
    age: 29,
  });

} catch (error) {
  // This block should not be hit
  console.error(`Error during valid creation: ${error.message}`);
}

// 4. Test Validation (Uniqueness)
try {
  console.log('\n--- Intentionally triggering a uniqueness error... ---');
  User.create({
    id: 3,
    username: 'fake_sonic',
    email: 'sonic@gottagofast.com', // Duplicate email
    age: 99,
  });
  
} catch (error) {
  console.error(`Error during creation: ${error.message}`);
  // > Error: Uniqueness Constraint Failed: A document with key 'email' and value 'sonic@gottagofast.com' already exists.
}

// 5. Test Validation (Schema)
try {
  console.log('\n--- Intentionally triggering a schema error... ---');
  User.create({
    id: 4,
    username: 'bad_data',
    email: 'bad@data.com',
    age: "thirty" // This is a string, not a Number
  });
} catch (error) {
    console.error(`Error during creation: ${error.message}`);
  // > Error: Schema Validation Failed: 'age' must be of type 'Number'. Received: string
}

// 6. Query your data!
// This is a FAST query thanks to the B-Tree index
console.log('\n--- Finding users older than 28 ---');
const users = User.find({
  age: { $gt: 28 } // This is accelerated by the 'btree' index
});

console.log(users);
// Output: [ { id: 2, username: 'tails', ..., createdAt: ... } ]
```

---

## 🚀 Performance: The SonicDB Advantage

Saying "fast" is easy. Proving it is better. The following benchmarks were run on a collection of **100,000 documents** to demonstrate why `SonicDB`'s intelligent indexing is critical.

**Test Setup:**
* `email` field: `{ type: 'hash' }` (For equality)
* `age` field: `{ type: 'btree' }` (For range)
* `score` field: `un-indexed` (For comparison)

### Scenario 1: Equality Query (`findOne`)
**Goal:** Find a single, specific document.

| Query | Method | Speed |
| :--- | :--- | :--- |
| `findOne({ score: 99999 })` | **Full Scan** (No Index) | **~5.0 ms** |
| `findOne({ email: '...' })` | **Hash Index** ($O(1)$) | **~0.05 ms** |
| **Result** | | **~100x Faster** |

### Scenario 2: Selective Range Query (`find`)
**Goal:** Find a *small subset* of documents (~4,000 of 100,000).

| Query | Method | Speed |
| :--- | :--- | :--- |
| `find({ score: { $gt: 95 } })` | **Full Scan** (No Index) | **~8.1 ms** |
| `find({ age: { $gt: 95 } })` | **B-Tree Index** ($O(\log n)$) | **~1.0 ms** |
| **Result** | | **~8x Faster** |

### Scenario 3: Query Caching
**Goal:** Re-run a *slow, un-indexed* query multiple times.

| Query | Method | Speed |
| :--- | :--- | :--- |
| `find({ score: { $gt: 50 } })` | **1st Run (Cache Miss)** | **~8.2 ms** |
| `find({ score: { $gt: 50 } })` | **2nd Run (Cache Hit)** | **~0.02 ms** |
| **Result** | | **~400x Faster** |

### Why use SonicDB?

| Scenario | Traditional `Array.filter()` (Full Scan) | `SonicDB` (Intelligent Indexing) | Speedup |
| :--- | :--- | :--- | :--- |
| **Finding 1 doc** | **~5.0 ms** ($O(n)$) | **~0.05 ms** ($O(1)$ Hash) | **~100x** |
| **Finding 4,000 docs** | **~8.1 ms** ($O(n)$) | **~1.0 ms** ($O(\log n)$ B-Tree)| **~8x** |
| **Re-running a slow query**| **~8.2 ms** (Slow every time)| **~0.02 ms** (Cache Hit) | **~400x** |

---

## ⚡ Indexing Strategies (hash vs. btree)

This is SonicDB's most powerful feature. You can choose two different indexing types via the `indexOn` option.

**Rule:** If `type` is not specified (e.g., `'username'`), it defaults to **`'hash'`**.

```typescript
// Example of an advanced setup
const db = new SonicDB({
  indexOn: [
    // 'email' for 'hash' (default)
    { key: 'email', type: 'hash', unique: true },
    
    // 'age' for 'btree'
    { key: 'age', type: 'btree' },

    // 'username' also uses 'hash' (default)
    'username'
  ]
});
```

### 1. `type: 'hash'` (Default)

* **What it is:** Uses a JavaScript `Map` (Hash Map).
* **Analogy:** A **coat check (vestibule)**. You get a ticket (`key`) and your coat is stored in a random location.
* **Best for:**
    * Equality (`=`) queries.
    * `findOne({ email: '...' })` — $O(1)$ (Instant)
    * `find({ age: { $in: [28, 30] } })` — $O(k)$ (Very Fast)
* **Bad for:**
    * Range (`>`, `<`) queries.
    * A query like `find({ age: { $gt: 28 } })` **cannot** use this index (will cause a Full Scan).
* **Use for:** `id`, `email`, `username` — keys you will search for by *exact* match.

### 2. `type: 'btree'` (Sorted Index)

* **What it is:** Uses a built-in, zero-dependency, self-balancing **B-Tree**.
* **Analogy:** An **encyclopedia** or **phone book**. Data is kept sorted.
* **Best for:**
    * Range (`>`, `<`, `$gt`, `$lt`) queries.
    * `find({ age: { $gt: 28 } })` — $O(\log n)$ (Very Fast)
    * `find({ createdAt: { $lt: new Date() } })` — $O(\log n)$ (Very Fast)
    * Also good for equality queries ($O(\log n)$).
* **Trade-off:**
    * `create` and `delete` operations are *slightly* slower ($O(\log n)$) than a hash map ($O(1)$) because the tree must be rebalanced.
* **Use for:** `age`, `score`, `createdAt` — numbers or dates that you will query using range operators.

---

## ⏱️ Automatic Query Caching

SonicDB includes a built-in query cache for `find()` operations, which is **enabled by default**.

* **How it works:** The *first time* you run a specific `find()` query (e.g., `find({ age: { $gt: 28 } })`), SonicDB performs the full operation (Full Scan or B-Tree scan) and stores the result in an in-memory cache.
* **Cache Hit:** The *next time* you run that *exact same query*, SonicDB skips the scan entirely and returns the cached result instantly (Cache Hit).
* **Invalidation:** The cache is **automatically and completely cleared** after any data-modifying operation (`create`, `update`, `delete`, `loadData`). This ensures your data is never stale.

### Disabling the Cache

You can disable this behavior in the constructor for write-heavy workloads:

```typescript
const db = new SonicDB({
  enableQueryCache: false
});
```

---

## 📚 API Reference

### `new SonicDB<T>(options)`

Creates a new database instance.

* `options.schema`: An object defining data types (e.g., `{ name: String, age: Number }`).
* `options.indexOn`: An array of keys to index (see Indexing Strategies).
* `options.bTreeDegree`: (Optional) The minimum degree `t` for all B-Tree indexes (default: `2`).
* `options.enableQueryCache`: (Optional) Set to `true` (default) to cache `find()` query results. Set to `false` to disable.

### Lifecycle Hooks

* `db.pre(event, callback)`: Runs *before* an event.
* `db.post(event, callback)`: Runs *after* an event.
* **Events:** `'create'`, `'update'`, `'delete'`

### CRUD Methods

* `db.create(doc: T): T`
* `db.find(query: Query<T>): T[]`
* `db.findOne(query: Query<T>): T | null`
* `db.updateOne(query: Query<T>, update: Partial<T>): T | null`
* `db.updateMany(query: Query<T>, update: Partial<T>): { modifiedCount: number }`
* `db.deleteOne(query: Query<T>): { deletedCount: number }`
* `db.deleteMany(query: Query<T>): { deletedCount: number }`
* `db.loadData(docs: T[]): void`

### Query Operators

All CRUD methods support the following operators:

* `{ age: { $gt: 18 } }` (Greater Than - **Fast with `btree`**)
* `{ age: { $gte: 18 } }` (Greater Than or Equal - **Fast with `btree`**)
* `{ age: { $lt: 30 } }` (Less Than - **Fast with `btree`**)
* `{ age: { $lte: 30 } }` (Less Than or Equal - **Fast with `btree`**)
* `{ email: { $ne: 'test@test.com' } }` (Not Equal - *Slow (Full Scan)*)
* `{ age: { $in: [18, 21, 25] } }` (In Array - **Fast with `hash` or `btree`**)
* `{ hobbies: { $nin: ['coding'] } }` (Not In Array - *Slow (Full Scan)*)

---

## 📜 License

MIT