//
//  AppDelegate+KeyHandling.m
//  Orbit
//
//  Created by Andy Matuschak on 2023-12-21.
//

#import <Intents/Intents.h>
#import "IngestEventHandler.h"
#import "AppDelegate.h"

@implementation AppDelegate (Intents)

- (id)application:(UIApplication *)application handlerForIntent:(INIntent *)intent {
  if ([intent isKindOfClass:[ShortcutIngestIntent class]]) {
    return [[IngestEventHandler alloc] init];
  }
  return nil;
}

@end
