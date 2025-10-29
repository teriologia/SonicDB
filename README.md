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