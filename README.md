# SonicDB 💨
> Gotta query fast!

Stop treating your queries like a 'Labyrinth Zone' water level. SonicDB gets you in and out instantly.

[![NPM Version](https://img.shields.io/npm/v/@teriologia/sonicdb.svg)](https://www.npmjs.com/package/@teriologia/sonicdb)
[![License](https://img.shields.io/npm/l/@teriologia/sonicdb.svg)](https://github.com/Teriologia/SonicDB/blob/main/LICENSE)

## Features

* **⚡ Blazing Fast:** Uses Map-based indexing for instant $O(1)$ lookups on exact matches and `$in` queries.
* **🔒 Type-Safe:** Fully written in TypeScript. Use Generics (`new SonicDB<IUser>()`) for complete auto-completion and type safety.
* **✨ Rich Queries:** Supports advanced operators like `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, and `$nin`.
* **🔐 Validation:** Built-in schema validation (`{ age: Number }`) and uniqueness constraints (`{ key: 'email', unique: true }`).
* **🔄 Lifecycle Hooks:** Run custom logic *before* or *after* `create`, `update`, and `delete` events using `pre()` and `post()` hooks.
* **🚀 Full CRUD:** Complete `create`, `find`, `findOne`, `update`, `updateOne`, `delete`, `deleteMany` API.

---

## Installation

```bash
npm install @teriologia/sonicdb
```
---

## 🚀 Quick Start (TypeScript)

This example shows how to set up a database with validation, unique indexes, and lifecycle hooks.

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
    isActive: Boolean
    // Note: 'hobbies' (Array) is omitted for this quick start
  },
  indexOn: [
    { key: 'email', unique: true }, // 'email' is indexed AND unique
    'age' // 'age' is just indexed
  ]
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
    isActive: true,
    hobbies: ['running'] // 'hobbies' is not in the schema, but is still saved
  });
  
  User.create({
    id: 2,
    username: 'tails',
    email: 'tails@workshop.com',
    age: 29,
    isActive: true,
    hobbies: ['flying']
  });

  // This one will fail (unique email)
  User.create({
    id: 3,
    username: 'fake_sonic',
    email: 'sonic@gottagofast.com', // Duplicate email
    age: 99,
    isActive: false,
    hobbies: []
  });
  
} catch (error) {
  console.error(`Error during creation: ${(error as Error).message}`);
  // > Error during creation: Uniqueness Constraint Failed: A document with key 'email' and value 'sonic@gottagofast.com' already exists.
}

// 5. Query your data!
// Find all users older than 28
// This is a SLOW query (full scan) because we use $gt
console.log('\n--- Finding users older than 28 ---');
const users = User.find({
  age: { $gt: 28 }
});

console.log(users);
// Output: [ { id: 2, username: 'tails', ..., createdAt: ... } ]
```

### JavaScript (CommonJS) Usage

`SonicDB` works great in plain JavaScript, where schema validation becomes even more important.

```javascript
// Note: .default is required when using CommonJS
const SonicDB = require('@teriologia/sonicdb').default;

const User = new SonicDB({
  schema: {
    username: String,
    email: String,
    age: Number,
  },
  indexOn: [
    { key: 'email', unique: true }
  ]
});

try {
  // This will throw an error
  User.create({
    username: 'bad_data',
    email: 'test@test.com',
    age: "twenty" // This is a string, not a Number
  });
} catch (error) {
  console.error(error.message);
  // > Schema Validation Failed: 'age' must be of type 'Number'. Received: string
}

User.create({
  username: 'sonic_fast',
  email: 'sonic@gottagofast.com',
  age: 28
});

const sonic = User.findOne({ email: 'sonic@gottagofast.com' });
console.log(sonic);
```

---

## 📚 API

### `new SonicDB<T>(options)`

Creates a new database instance.

* `options.schema`: An object defining data types (e.g., `{ name: String, age: Number }`).
* `options.indexOn`: An array of keys to index.
    * Simple: `['age', 'username']`
    * Advanced: `[{ key: 'email', unique: true }, 'age']`

### Hooks

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

`find`, `findOne`, `update`, and `delete` methods support the following operators in the query object:

* `{ age: { $gt: 18 } }` (Greater Than)
* `{ age: { $gte: 18 } }` (Greater Than or Equal)
* `{ age: { $lt: 30 } }` (Less Than)
* `{ age: { $lte: 30 } }` (Less Than or Equal)
* `{ email: { $ne: 'test@test.com' } }` (Not Equal)
* `{ age: { $in: [18, 21, 25] } }` (In Array - **Indexed!**)
* `{ hobbies: { $nin: ['coding'] } }` (Not In Array)

---

## 📜 License

MIT