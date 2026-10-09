export type VaultID = string & { readonly __vaultID: unique symbol };

export type ObservationID = string & {
  readonly __observationID: unique symbol;
};

export type VaultMutationID = string & {
  readonly __vaultMutationID: unique symbol;
};

export type AutomergeDocumentURL = `automerge:${string}` & {
  readonly __automergeDocumentURL: unique symbol;
};

export type AttachmentSHA256 = `sha256:${string}` & {
  readonly __attachmentSHA256: unique symbol;
};
