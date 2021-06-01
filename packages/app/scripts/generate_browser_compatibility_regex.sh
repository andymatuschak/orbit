SUPPORTED_BROWSER_REGEX="$(npx browserslist-useragent-regexp --allowHigherVersions)"
GENERATED_STR=""
GENERATED_STR+="// DO NOT MODIFY THIS CODE MANUALLY\n"
GENERATED_STR+="// eslint-disable-next-line @typescript-eslint/no-unused-vars\n"
GENERATED_STR+="const supportedBrowserRegex = $SUPPORTED_BROWSER_REGEX;"

echo $GENERATED_STR > web/browserCompatibility.js