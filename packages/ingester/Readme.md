# @withorbit/ingester

This package, in conjunction with `@withorbit/interpreter`, lets you import Orbit prompts from some other data source, and to keep your Orbit database in sync with that data source, ingesting missing prompts and deleting deleted ones as necessary.

`interpreter` is responsible for parsing those data sources and producing a JSON file which describes the prompts embedded within it. This package can then synchronize an Orbit database with the prompts in that file.

See the documentation in `interpreter` for example and more detail.

---

```
Copyright 2023 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
