//
//  EventEmitter.m
//  Orbit
//
//  Created by Ozzie Kirkby on 2022-05-07.
//

#import <Foundation/Foundation.h>

#import "IngestEventEmitter.h"

@implementation IngestEventEmitter

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (void)startObserving {
    self.hasListeners = YES;
}

// Will be called when this module's last listener is removed, or on dealloc.
- (void)stopObserving {
    self.hasListeners = NO;
}

RCT_EXPORT_MODULE();

+ (id)allocWithZone:(NSZone *)zone {
    static IngestEventEmitter *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [super allocWithZone:zone];
    });
    return sharedInstance;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onIngestEvent"];
}

- (void)emitIngestEvent:(NSString *)fileJSON completion:(void (^)(BOOL *result))block {
  // emit event to RN
  [self sendEventWithName:@"onIngestEvent" body:@{@"json": fileJSON}];
  self.completionHandler = block;
}

RCT_EXPORT_METHOD(completedIngestion:(BOOL *)success) {
  self.completionHandler(success);
  self.completionHandler = nil;
}

@end

