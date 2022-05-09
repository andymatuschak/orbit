//
//  IngestEventHandler.m
//  Orbit
//
//  Created by Ozzie Kirkby on 2022-05-08.
//

#import <Foundation/Foundation.h>
#import "IngestEventHandler.h"
#import "IngestIntent.h"
#import "IngestEventEmitter.h"

@implementation IngestEventHandler

- (void)handleIngest:(IngestIntent *)intent completion:(void (^)(IngestIntentResponse *response))completion NS_SWIFT_NAME(handle(intent:completion:)) {
  IngestIntent *ingestIntent = ((IngestIntent *) intent);
  NSString *data = [[NSString alloc] initWithData: ingestIntent.file.data encoding: NSUTF8StringEncoding];
  
  IngestEventEmitter *emitter = [[IngestEventEmitter alloc] init];
  IngestIntentResponseCode code;
  if (emitter.hasListeners) {
    bool success = [emitter emitIngestEvent:data];
    
    if (success) {
      code = IngestIntentResponseCodeSuccess;
    } else {
      code = IngestIntentResponseCodeFailure;
    }
  } else {
    code = IngestIntentResponseCodeContinueInApp;
  }
  completion([[IngestIntentResponse alloc] initWithCode:code userActivity:nil]);
}

@end
