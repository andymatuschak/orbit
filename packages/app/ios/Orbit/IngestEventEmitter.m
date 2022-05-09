//
//  EventEmitter.m
//  Orbit
//
//  Created by Ozzie Kirkby on 2022-05-07.
//

#import <Foundation/Foundation.h>

#import "IngestEventEmitter.h"
#import <libkern/OSAtomic.h>
#import <stdatomic.h>

@implementation IngestEventEmitter

@synthesize semaphore;

- (instancetype)init {
  self = [super init];
  return self;
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

-(void)startObserving {
    self.hasListeners = YES;
}

// Will be called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
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

- (bool) emitIngestEvent:(NSString *) fileJSON {
  // update state
  self.intentState = kWaiting;
  
  // emit event to RN
  [self sendEventWithName:@"onIngestEvent" body:@{@"json": fileJSON}];
  
  // block until response from RN
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  self.semaphore = semaphore;
  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
  self.semaphore = nil;
  
  // return status
  return [self intentState] == kSuccess;
}

RCT_EXPORT_METHOD(completedIngestion:(BOOL *)success) {
  if (success) {
    self.intentState = kSuccess;
  } else {
    self.intentState = kFailure;
  }
  dispatch_semaphore_signal([self semaphore]);
}

@end

