export type Opaque<Type> = Type & { readonly __opaque__: unique symbol };
