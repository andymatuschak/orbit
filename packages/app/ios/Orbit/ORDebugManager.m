//
//  ORDebugManager.m
//  Orbit
//
//  Created by Andy Matuschak on 5/12/20.
//

#import "ORDebugManager.h"

@implementation ORDebugManager
RCT_EXPORT_MODULE(@"DebugManager");

- (NSArray<NSString *> *)supportedEvents {
  return @[@"ShowDebugMenu"];
}

- (void)sendShowDebugMenuEvent {
  [self sendEventWithName:@"ShowDebugMenu" body:nil];
}

@end
