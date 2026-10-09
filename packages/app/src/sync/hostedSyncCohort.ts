export function isHostedSyncAccountEligible(
  authenticationUserID: string,
  configuredAuthenticationUserIDs: readonly string[],
): boolean {
  return (
    configuredAuthenticationUserIDs.length === 0 ||
    configuredAuthenticationUserIDs.includes(authenticationUserID)
  );
}
