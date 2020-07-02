#import <Foundation/Foundation.h>

#import "SentryCurrentDateProvider.h"
#import "SentryEvent.h"
#import "SentryOptions.h"

NS_SWIFT_NAME(SessionTracker)
@interface SentrySessionTracker : NSObject
SENTRY_NO_INIT

- (instancetype)initWithOptions:(SentryOptions *)options
            currentDateProvider:(id<SentryCurrentDateProvider>)currentDateProvider;
- (void)start;
@end
