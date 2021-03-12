// Disable Catalyst scaling per:
// https://gist.github.com/stefanceriu/3c21452b7d481ceae41c0ca5f0f5c15d

// TODO: take another look at this on Big Sur.

#import <Foundation/Foundation.h>
#import <objc/runtime.h>

@interface NSObject (UINSSceneViewScaling); @end

@implementation NSObject (UINSSceneViewScaling)

+ (void)load
{
#if TARGET_OS_MACCATALYST
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        CTXSwizzleInstanceMethod(objc_getClass("UINSSceneView"), NSSelectorFromString(@"scaleFactor"), @selector(orbit_scaleFactor));
    });
#endif
}

- (double)orbit_scaleFactor
{
    return 1.0f;
}

static void CTXSwizzleInstanceMethod(Class class, SEL originalSelector, SEL swizzledSelector) {
    Method originalMethod = class_getInstanceMethod(class, originalSelector);
    Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);

    if (class_addMethod(class, originalSelector, method_getImplementation(swizzledMethod), method_getTypeEncoding(swizzledMethod))) {
        class_replaceMethod(class, swizzledSelector, method_getImplementation(originalMethod), method_getTypeEncoding(originalMethod));
    } else {
        method_exchangeImplementations(originalMethod, swizzledMethod);
    }
}

@end
