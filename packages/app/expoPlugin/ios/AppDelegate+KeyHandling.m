//
//  AppDelegate+KeyHandling.m
//  Orbit
//
//  Created by Andy Matuschak on 2023-12-21.
//

#import <RNKeyEvent.h>
#import "AppDelegate.h"

@implementation AppDelegate (KeyCommands)
RNKeyEvent *keyEvent = nil;

- (NSMutableArray<UIKeyCommand *> *)keyCommands {
  NSMutableArray *keys = [NSMutableArray new];

  if (keyEvent == nil) {
    keyEvent = [[RNKeyEvent alloc] init];
  }

  if ([keyEvent isListening]) {
    // need to add space as a valid character, otherwise it is ignored
    NSArray *extraNames = [NSArray arrayWithObjects: @" ",nil];
    NSArray *defaultNamesArray = [[keyEvent getKeys] componentsSeparatedByString:@","];
    NSArray *namesArray = [defaultNamesArray arrayByAddingObjectsFromArray:extraNames];

    NSCharacterSet *validChars = [NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

    for (NSString* names in namesArray) {
      NSRange  range = [names rangeOfCharacterFromSet:validChars];

      if (NSNotFound != range.location) {
        [keys addObject: [UIKeyCommand keyCommandWithInput:names modifierFlags:UIKeyModifierShift action:@selector(keyInput:)]];
      } else {
        [keys addObject: [UIKeyCommand keyCommandWithInput:names modifierFlags:0 action:@selector(keyInput:)]];
      }
    }
  }

  return keys;
}

- (void)keyInput:(UIKeyCommand *)sender {
  NSString *selected = sender.input;
  [keyEvent sendKeyEvent:selected];
}

@end
