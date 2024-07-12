//
//  ORWidgetReloadBridge.m
//  Orbit
//
//  Created by Andy Matuschak on 2024-07-12.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

@interface RCT_EXTERN_MODULE(WidgetReloadBridge, NSObject)
RCT_EXTERN_METHOD(reloadTimelines)
@end

NS_ASSUME_NONNULL_END
