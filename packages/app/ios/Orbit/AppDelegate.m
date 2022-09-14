#import "AppDelegate.h"

#import <React/RCTBridge.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTDevMenu.h>
#import <React/RCTDevLoadingView.h>
#import <React/RCTRootView.h>
#import <React/RCTLog.h>
#import <Firebase.h>

#import <UMCore/UMModuleRegistry.h>
#import <UMCore/UMModuleRegistryProvider.h>
#import <UMReactNativeAdapter/UMNativeModulesProxy.h>
#import <UMReactNativeAdapter/UMModuleRegistryAdapter.h>

#import "ORDebugManager.h"

#import <RNKeyEvent.h>
#import <Intents/Intents.h>
#import "IngestEventHandler.h"

#if 0
//#if DEBUG && !TARGET_OS_MACCATALYST
#import <FlipperKit/FlipperClient.h>
#import <FlipperKitLayoutPlugin/FlipperKitLayoutPlugin.h>
#import <FlipperKitUserDefaultsPlugin/FKUserDefaultsPlugin.h>
#import <FlipperKitNetworkPlugin/FlipperKitNetworkPlugin.h>
#import <SKIOSNetworkPlugin/SKIOSNetworkAdapter.h>
#import <FlipperKitReactPlugin/FlipperKitReactPlugin.h>

static void InitializeFlipper(UIApplication *application) {
  FlipperClient *client = [FlipperClient sharedClient];
  SKDescriptorMapper *layoutDescriptorMapper = [[SKDescriptorMapper alloc] initWithDefaults];
  [client addPlugin:[[FlipperKitLayoutPlugin alloc] initWithRootNode:application withDescriptorMapper:layoutDescriptorMapper]];
  [client addPlugin:[[FKUserDefaultsPlugin alloc] initWithSuiteName:nil]];
  [client addPlugin:[FlipperKitReactPlugin new]];
//  [client addPlugin:[[FlipperKitNetworkPlugin alloc] initWithNetworkAdapter:[SKIOSNetworkAdapter new]]];
  [client start];
}
#endif

@interface ORNSView : UIView
@property NSArray *subviews;
@end

@implementation ORNSView
@dynamic subviews;
@end


@interface ORNSWindowAdditions : NSObject
@property NSUInteger styleMask;
@property BOOL titlebarAppearsTransparent;
@property ORNSView *contentView;
@property id backgroundColor;
@property (getter=isOpaque) BOOL opaque;
@end
@implementation ORNSWindowAdditions
@dynamic styleMask;
@dynamic titlebarAppearsTransparent;
@dynamic contentView;
@end

@interface ORVisualEffectView : UIView
@property NSInteger blendingMode;
@property NSInteger state;
@property NSInteger material;
@end

@implementation ORVisualEffectView
@dynamic blendingMode, state, material;
@end

@interface UIWindow (PSPDFAdditions)

#if TARGET_OS_UIKITFORMAC

/**
    Finds the NSWindow hosting the UIWindow.
    @note This is a hack. Iterates over all windows to find match. Might fail.
 */
@property (nonatomic, readonly, nullable) id nsWindow;

#endif

@end

@implementation UIWindow (PSPDFAdditions)
#define PSPDF_SILENCE_CALL_TO_UNKNOWN_SELECTOR(expression) _Pragma("clang diagnostic push") _Pragma("clang diagnostic ignored \"-Warc-performSelector-leaks\"") expression _Pragma("clang diagnostic pop")
#if TARGET_OS_UIKITFORMAC

- (nullable ORNSWindowAdditions *)nsWindow {
    id delegate = [[NSClassFromString(@"NSApplication") sharedApplication] delegate];
    const SEL hostWinSEL = NSSelectorFromString([NSString stringWithFormat:@"_%@Window%@Window:", @"host", @"ForUI"]);
    @try {
        // There's also hostWindowForUIWindow 🤷‍♂️
        PSPDF_SILENCE_CALL_TO_UNKNOWN_SELECTOR(id nsWindow = [delegate performSelector:hostWinSEL withObject:self];)
        return nsWindow;
    } @catch (...) {
        NSLog(@"Failed to get NSWindow for %@.", self);
    }
    return nil;
}

#endif

@end


@interface AppDelegate ()

@property (nonatomic, strong) NSDictionary *launchOptions;

@end

@interface ORSceneDelegate : UIResponder <UIWindowSceneDelegate, EXUpdatesAppControllerDelegate>
@property(readonly, nonatomic) AppDelegate *appDelegate;
@property(nonatomic, strong) UIWindow *window;
@end


@implementation AppDelegate

@synthesize window = _window;

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
#if DEBUG
  NSString *filePath = [[NSBundle mainBundle] pathForResource:@"GoogleService-Info-Dev" ofType:@"plist"];
#else
  NSString *filePath = [[NSBundle mainBundle] pathForResource:@"GoogleService-Info" ofType:@"plist"];
#endif
  FIROptions *options = [[FIROptions alloc] initWithContentsOfFile:filePath];
  [FIRApp configureWithOptions:options];

  RCTSetLogThreshold(RCTLogLevelInfo - 1);
#if 0
  //#if DEBUG && !TARGET_OS_MACCATALYST
  InitializeFlipper(application);
#endif

  self.moduleRegistryAdapter = [[UMModuleRegistryAdapter alloc] initWithModuleRegistryProvider:[[UMModuleRegistryProvider alloc] init]];

  return YES;
}

- (UIInterfaceOrientationMask)application:(UIApplication *)application supportedInterfaceOrientationsForWindow:(UIWindow *)window {
  if (window.screen.traitCollection.horizontalSizeClass == UIUserInterfaceSizeClassCompact) {
    return UIInterfaceOrientationMaskPortrait;
  } else {
    return UIInterfaceOrientationMaskAllButUpsideDown;
  }
}

- (void)initializeBridge {
  if (!self.bridge) {
    self.bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:nil];
#if RCT_DEV
    [self.bridge moduleForClass:[RCTDevLoadingView class]]; // avoid a weird race that I don't really understand

    typeof(self) __weak weakSelf = self;
    [self.bridge.devMenu addItem:[RCTDevMenuItem buttonItemWithTitle:@"Clear caches" handler:^{ [weakSelf clearCaches]; }]];
    [self.bridge.devMenu addItem:[RCTDevMenuItem buttonItemWithTitle:@"Sign out" handler:^{ [weakSelf signOut]; }]];
#endif
  }
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge
{
  NSMutableArray<id<RCTBridgeModule>> *extraModules = [NSMutableArray arrayWithArray:[_moduleRegistryAdapter extraModulesForBridge:bridge]];
  [extraModules addObject:[[ORDebugManager alloc] init]];
  return extraModules;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index" fallbackResource:nil];
#else
  return [[EXUpdatesAppController sharedInstance] launchAssetUrl];
#endif
}


#if TARGET_OS_MACCATALYST
- (void)buildMenuWithBuilder:(id<UIMenuBuilder>)builder {
  [super buildMenuWithBuilder:builder];

#if DEBUG
  UIKeyCommand *clearCacheCommand = [UIKeyCommand keyCommandWithInput:@"K" modifierFlags:UIKeyModifierCommand | UIKeyModifierControl action:@selector(clearCaches)];
  clearCacheCommand.title = @"Clear Local Data";

  UIKeyCommand *reactNativeDebugCommand = [UIKeyCommand keyCommandWithInput:@"D" modifierFlags:UIKeyModifierCommand | UIKeyModifierControl action:@selector(showReactNativeDebugMenu)];
  reactNativeDebugCommand.title = @"React Native Debug";

  UIMenu *debugMenu = [UIMenu menuWithTitle:@"Debug" children:@[clearCacheCommand, reactNativeDebugCommand]];

  [builder insertSiblingMenu:debugMenu beforeMenuForIdentifier:UIMenuHelp];
#endif

  UICommand *signOutCommand = [UICommand commandWithTitle:@"Sign Out" image:nil action:@selector(signOut) propertyList:nil];
  UIMenu *signOutMenuGroup = [UIMenu menuWithTitle:@"" image:nil identifier:nil options:UIMenuOptionsDisplayInline children:@[signOutCommand]];
  [builder insertSiblingMenu:signOutMenuGroup afterMenuForIdentifier:UIMenuAbout] ;
}
#endif

- (void)clearCaches {
  NSURL *cacheURL = [[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask][0];
  [[NSFileManager defaultManager] removeItemAtURL:cacheURL error:nil];

  NSURL *documentsURL = [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask][0];
  [[NSFileManager defaultManager] removeItemAtURL:documentsURL error:nil];

#if DEBUG
  exit(0);
#endif
}

- (void)showReactNativeDebugMenu {
  [self.bridge.devMenu show];
}

- (void)signOut {
  [[FIRAuth auth] signOut:nil];
  [self clearCaches];
}

RNKeyEvent *keyEvent = nil;

- (NSMutableArray<UIKeyCommand *> *)keyCommands {
  NSMutableArray *keys = [NSMutableArray new];
  
  if (keyEvent == nil) {
    keyEvent = [[RNKeyEvent alloc] init];
  }
  
  if ([keyEvent isListening]) {
    // need to add space as a valid character, otherwise it is ignored
    NSArray *extraNames = [NSArray arrayWithObjects: @" ",nil];
    NSArray *defaultNamesArray = [[keyEvent getKeys] componentsSeparatedByString:@","];
    NSArray *namesArray = [defaultNamesArray arrayByAddingObjectsFromArray:extraNames];
    
    NSCharacterSet *validChars = [NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    
    for (NSString* names in namesArray) {
      NSRange  range = [names rangeOfCharacterFromSet:validChars];
      
      if (NSNotFound != range.location) {
        [keys addObject: [UIKeyCommand keyCommandWithInput:names modifierFlags:UIKeyModifierShift action:@selector(keyInput:)]];
      } else {
        [keys addObject: [UIKeyCommand keyCommandWithInput:names modifierFlags:0 action:@selector(keyInput:)]];
      }
    }
  }
  
  return keys;
}

- (void)keyInput:(UIKeyCommand *)sender {
  NSString *selected = sender.input;
  [keyEvent sendKeyEvent:selected];
}

- (id)application:(UIApplication *)application handlerForIntent:(INIntent *)intent {
  if ([intent isKindOfClass:[ShortcutIngestIntent class]]) {
    return [[IngestEventHandler alloc] init];
  }
  return nil;
}

@end

@implementation ORSceneDelegate

- (AppDelegate *)appDelegate {
  return (AppDelegate *)[UIApplication sharedApplication].delegate;
}

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    [NSException raise:NSGenericException format:@"Unknown scene type: %@", [scene class]];
  }

  UIWindowScene *windowScene = (UIWindowScene *)scene;
  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];

  if (!self.appDelegate.bridge) {
    // When running in debug, we can start RN immediately. Otherwise, we'll check the remote for updates first.
#if DEBUG
    [self initializeReactNativeApp];
#else
    EXUpdatesAppController *controller = [EXUpdatesAppController sharedInstance];
    controller.delegate = self;
    [controller startAndShowLaunchScreen:self.window];
#endif
  }

#if TARGET_OS_MACCATALYST
  windowScene.titlebar.titleVisibility = UITitlebarTitleVisibilityHidden;
  windowScene.titlebar.toolbar = nil;
  windowScene.sizeRestrictions.minimumSize = CGSizeMake(370, 600);
#endif
}

- (void)appController:(EXUpdatesAppController *)appController didStartWithSuccess:(BOOL)success
{
  [self initializeReactNativeApp];
  appController.bridge = self.appDelegate.bridge;
}

- (void)initializeReactNativeApp {
  [self.appDelegate initializeBridge];

  RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.appDelegate.bridge
                                                   moduleName:@"main"
                                            initialProperties:nil];

  UIViewController *rootViewController = [UIViewController new];
  rootViewController.view = rootView;
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];
}

@end
