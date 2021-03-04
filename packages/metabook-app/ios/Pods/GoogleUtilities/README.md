[![Version](https://img.shields.io/cocoapods/v/GoogleUtilities.svg?style=flat)](https://cocoapods.org/pods/GoogleUtilities)
[![License](https://img.shields.io/cocoapods/l/GoogleUtilities.svg?style=flat)](https://cocoapods.org/pods/GoogleUtilities)
[![Platform](https://img.shields.io/cocoapods/p/GoogleUtilities.svg?style=flat)](https://cocoapods.org/pods/GoogleUtilities)

[![Actions Status][gh-google-utilities-badge]][gh-actions]

# GoogleUtilities

GoogleUtilities provides a set of utilities for Firebase and other Google SDKs for Apple platform
development.

The utilities are not directly supported for non-Google library usage.

## Integration Testing
These instructions apply to minor and patch version updates. Major versions need
a customized adaptation.

After the CI is green:
  * Update the version in the podspec
  * Add the CocoaPods tag
    * `git tag CocoaPods-{version}`
    * `git push origin CocoaPods-{version}`
  * Push the podspec to SpecsStaging
    * `pod repo push staging GoogleUtilities.podspec`
  * Run Firebase CI by waiting until next nightly or adding a PR that touches `Gemfile`
  * On google3, copybara and run a global TAP
    * `third_party/firebase/ios/Releases/run_copy_bara.py --directory GoogleUtilities`

## Publishing
  * Add a version tag for Swift PM
    * `git tag {version}`
    * `git push origin {version}`
  * `pod trunk push GoogleUtilities.podspec`
  * Clean up SpecsStaging

## Development

To develop in this repository, ensure that you have at least the following software:

  * Xcode 12.0 (or later)
  * CocoaPods 1.10.0 (or later)
  * [CocoaPods generate](https://github.com/square/cocoapods-generate)

For the pod that you want to develop:

`pod gen GoogleUtilities.podspec --local-sources=./ --auto-open --platforms=ios`

Note: If the CocoaPods cache is out of date, you may need to run
`pod repo update` before the `pod gen` command.

Note: Set the `--platforms` option to `macos` or `tvos` to develop/test for
those platforms. Since 10.2, Xcode does not properly handle multi-platform
CocoaPods workspaces.

### Development for Catalyst
* `pod gen GoogleUtilities.podspec --local-sources=./ --auto-open --platforms=ios`
* Check the Mac box in the App-iOS Build Settings
* Sign the App in the Settings Signing & Capabilities tab
* Click Pods in the Project Manager
* Add Signing to the iOS host app and unit test targets
* Select the Unit-unit scheme
* Run it to build and test

Alternatively disable signing in each target:
* Go to Build Settings tab
* Click `+`
* Select `Add User-Defined Setting`
* Add `CODE_SIGNING_REQUIRED` setting with a value of `NO`

### Code Formatting

To ensure that the code is formatted consistently, run the script
[./scripts/check.sh](https://github.com/firebase/firebase-ios-sdk/blob/master/scripts/check.sh)
before creating a PR.

GitHub Actions will verify that any code changes are done in a style compliant
way. Install `clang-format` and `mint`:

```
brew install clang-format@11
brew install mint
```

### Running Unit Tests

Select a scheme and press Command-u to build a component and run its unit tests.

## Contributing

See [Contributing](CONTRIBUTING.md).

## License

The contents of this repository is licensed under the
[Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

[gh-actions]: https://github.com/firebase/firebase-ios-sdk/actions
[gh-google-utilities-badge]: https://github.com/firebase/firebase-ios-sdk/workflows/google-utilities/badge.svg
