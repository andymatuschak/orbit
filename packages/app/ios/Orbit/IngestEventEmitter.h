//
//  EventEmitter.h
//  Orbit
//
//  Created by Ozzie Kirkby on 2022-05-07.
//

#ifndef EventEmitter_h
#define EventEmitter_h

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

typedef enum {
  IntentStateSuccess,
  IntentStateFailure,
  IntentStateWaiting
} IntentState;

@interface IngestEventEmitter : RCTEventEmitter <RCTBridgeModule>

@property(atomic,assign) bool hasListeners;
@property(atomic,assign) IntentState intentState;
@property(atomic,assign) dispatch_semaphore_t semaphore;

- (BOOL)emitIngestEvent:(NSString *)fileJSON;

@end

#endif /* EventEmitter_h */
