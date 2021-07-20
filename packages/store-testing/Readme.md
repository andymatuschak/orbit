# `@withorbit/store-testing`

This package doesn't contain any exported code: it holds tests which are run across both `@withorbit/store-fs` and `@withorbit/store-web`.

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
