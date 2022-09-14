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

@interface IngestEventEmitter : RCTEventEmitter <RCTBridgeModule>

@property(atomic,assign) bool hasListeners;
@property(atomic,copy) void (^completionHandler)(BOOL *result);

- (void)emitIngestEvent:(NSString *)fileJSON completion:(void (^)(BOOL *result))block;

@end

#endif /* EventEmitter_h */
