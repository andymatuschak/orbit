//
//  ORSQLImageURLLoader.m
//  Orbit
//
//  Created by Andy Matuschak on 10/19/21.
//

#import "ORSQLImageURLLoader.h"
#import <op-sqlite/sqlite3.h>

// We store user images as BLOBs in a SQLite database. This module allows them to be loaded and displayed via a special URL scheme.

@implementation ORSQLImageURLLoader

RCT_EXPORT_MODULE();

- (BOOL)canLoadImageURL:(NSURL *)requestURL {
  // n.b. this string must be kept in sync with store-fs/sqlite.ts
  return [requestURL.scheme isEqualToString:@"x-orbit-sqlattachment"];
}

- (NSString *)pathForDatabaseWithName:(NSString *)name {
  // HACK: op-sqlite (for now) assumes that databases are located within the app container's Documents directory. So these URLs are not full paths, but rather relative paths within the Documents directory. This code is therefore coupled with the semantics defined in OPSQLite.mm.

  static NSString *documentDirectoryPath;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    // Get appGroupID value from Info.plist using key "AppGroup"
    NSString *appGroupID = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"OPSQLite_AppGroup"];
    NSString *documentPath;

    if (appGroupID != nil) {
      // Get the app groups container storage url
      NSFileManager *fileManager = [NSFileManager defaultManager];
      NSURL *storeUrl = [fileManager containerURLForSecurityApplicationGroupIdentifier:appGroupID];

      if (storeUrl == nil) {
        [NSException raise:NSGenericException format:@"OP-SQLite: Invalid AppGroup ID provided (%@). Check the value of \"AppGroup\" in your Info.plist file", appGroupID];
      }

      documentDirectoryPath = [storeUrl path];
    } else {
      NSArray *paths = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, true);
      documentDirectoryPath = [paths objectAtIndex:0];
    }
  });
  return [documentDirectoryPath stringByAppendingPathComponent:name];
}

- (RCTImageLoaderCancellationBlock)loadImageForURL:(NSURL *)imageURL size:(CGSize)size scale:(CGFloat)scale resizeMode:(RCTResizeMode)resizeMode progressHandler:(RCTImageLoaderProgressBlock)progressHandler partialLoadHandler:(RCTImageLoaderPartialLoadBlock)partialLoadHandler completionHandler:(RCTImageLoaderCompletionBlock)completionHandler {
  NSArray *components = imageURL.pathComponents;
  if (components.count == 3) {
    NSString *dbName = components[1];
    NSString *attachmentID = components[2];

    // TODO: cache and re-use the database connection (and prepared statement), perhaps cleaning up after some timeout of last use
    sqlite3 *db;
    const char *dbPath = [[self pathForDatabaseWithName:dbName] UTF8String];
    int result = sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, NULL);
    if (result == SQLITE_OK) {
      sqlite3_stmt *statement;
      // n.b. the column and table names must be kept in sync with store-fs/sqlite/
      sqlite3_prepare_v2(db, "SELECT data FROM attachments WHERE id = ? LIMIT 1", -1, &statement, NULL);
      sqlite3_bind_text(statement, 1, [attachmentID UTF8String], (int)[attachmentID lengthOfBytesUsingEncoding:NSUTF8StringEncoding], SQLITE_STATIC);

      int result = sqlite3_step(statement);
      if (result == SQLITE_ROW) {
        NSData *data = [NSData dataWithBytes:sqlite3_column_blob(statement, 0) length:sqlite3_column_bytes(statement, 0)];
        UIImage *image = [UIImage imageWithData:data];
        if (image) {
          if (progressHandler) progressHandler(1, 1);
          completionHandler(nil, image);
        } else {
          completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Could not decode attachment with ID %@", attachmentID]), nil);
        }
      } else {
        completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Attachment with ID %@ not found", attachmentID]), nil);
      }

      sqlite3_finalize(statement); // TODO: reuse
      sqlite3_close(db);
    } else {
      completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Can't open database %@: %s", dbName, sqlite3_errmsg(db)]), nil);
    }
  } else {
    completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Unknown Orbit SQL image URL format: %@", imageURL]), nil);
  }
  return nil;
}

@end
