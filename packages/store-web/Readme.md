# `@withorbit/store-web`

Implementation of `OrbitStore` for web browser contexts. See `@withorbit/store-shared` for type definitions.

The `store-*` dependency graph:

```
       ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─        
          store-testing   │       
       └ ─ ─ ─ ─ ─ ─ ─ ─ ─        
                │ │               
       ┌────────┘ └───────┐       
       ▼                  ▼       
┌─────────────┐    ┌─────────────┐
│  store-fs   │    │  store-web  │
└─────────────┘    └─────────────┘
       │                  │       
       └─────────┬────────┘       
                 ▼                
        ┌─────────────────┐       
        │  store-shared   │       
        └─────────────────┘       
```

```
Copyright 2021 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
