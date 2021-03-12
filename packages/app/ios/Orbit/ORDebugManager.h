//
//  ORDebugManager.h
//  Orbit
//
//  Created by Andy Matuschak on 5/12/20.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN


@interface ORDebugManager : RCTEventEmitter <RCTBridgeModule>
- (void)sendShowDebugMenuEvent;
@end


NS_ASSUME_NONNULL_END
