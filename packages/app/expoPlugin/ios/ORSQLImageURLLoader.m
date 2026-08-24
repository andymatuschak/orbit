//
//  ORSQLImageURLLoader.m
//  Orbit
//
//  Created by Andy Matuschak on 10/19/21.
//

#import <Foundation/Foundation.h>
#import <React/RCTImageURLLoader.h>
#import <React/RCTUtils.h>
#import <op-sqlite/sqlite3.h>

// We store user images as BLOBs in a SQLite database. This module allows them to be loaded and displayed via a special URL scheme.

@interface ORSQLImageURLLoader : NSObject <RCTImageURLLoader>
@end

// React Native 0.86 still marks the deprecated completion-handler selector as
// required even though its loader prefers the modern metadata selector below.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wprotocol"
@implementation ORSQLImageURLLoader

RCT_EXPORT_MODULE();

- (BOOL)canLoadImageURL:(NSURL *)requestURL {
  // n.b. this string must be kept in sync with store-fs/sqlite.ts
  return [requestURL.scheme isEqualToString:@"x-orbit-sqlattachment"];
}

- (NSString *)pathForDatabaseWithName:(NSString *)name {
  NSString *appGroupID = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"OPSQLite_AppGroup"];
  if (appGroupID.length == 0) {
    [NSException raise:NSGenericException
                format:@"Orbit requires OPSQLite_AppGroup in Info.plist"];
  }

  NSURL *storeURL = [[NSFileManager defaultManager]
      containerURLForSecurityApplicationGroupIdentifier:appGroupID];
  if (storeURL == nil) {
    [NSException raise:NSGenericException
                format:@"Invalid OPSQLite_AppGroup value (%@)", appGroupID];
  }

  return [storeURL.path stringByAppendingPathComponent:name];
}

- (RCTImageLoaderCancellationBlock)loadImageForURL:(NSURL *)imageURL
                                              size:(CGSize)size
                                             scale:(CGFloat)scale
                                        resizeMode:(RCTResizeMode)resizeMode
                                   progressHandler:(RCTImageLoaderProgressBlock)progressHandler
                                partialLoadHandler:(RCTImageLoaderPartialLoadBlock)partialLoadHandler
                     completionHandlerWithMetadata:(RCTImageLoaderCompletionBlockWithMetadata)completionHandler {
  NSArray *components = imageURL.pathComponents;
  if (components.count == 3) {
    NSString *dbName = components[1];
    NSString *attachmentID = components[2];

    // TODO: cache and re-use the database connection (and prepared statement), perhaps cleaning up after some timeout of last use
    sqlite3 *db = NULL;
    const char *dbPath = [[self pathForDatabaseWithName:dbName] UTF8String];
    int result = sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, NULL);
    if (result == SQLITE_OK) {
      sqlite3_stmt *statement = NULL;
      // n.b. the column and table names must be kept in sync with store-fs/sqlite/
      int prepareResult = sqlite3_prepare_v2(db, "SELECT data FROM attachments WHERE id = ? LIMIT 1", -1, &statement, NULL);
      if (prepareResult != SQLITE_OK) {
        completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Can't query database %@: %s", dbName, sqlite3_errmsg(db)]), nil, nil);
        sqlite3_close(db);
        return nil;
      }
      sqlite3_bind_text(statement, 1, attachmentID.UTF8String, -1, SQLITE_TRANSIENT);

      int result = sqlite3_step(statement);
      if (result == SQLITE_ROW) {
        NSData *data = [NSData dataWithBytes:sqlite3_column_blob(statement, 0) length:sqlite3_column_bytes(statement, 0)];
        UIImage *image = [UIImage imageWithData:data];
        if (image) {
          if (progressHandler) progressHandler(1, 1);
          completionHandler(nil, image, nil);
        } else {
          completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Could not decode attachment with ID %@", attachmentID]), nil, nil);
        }
      } else {
        completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Attachment with ID %@ not found", attachmentID]), nil, nil);
      }

      sqlite3_finalize(statement); // TODO: reuse
      sqlite3_close(db);
    } else {
      completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Can't open database %@: %s", dbName, sqlite3_errmsg(db)]), nil, nil);
      if (db != NULL) sqlite3_close(db);
    }
  } else {
    completionHandler(RCTErrorWithMessage([NSString stringWithFormat:@"Unknown Orbit SQL image URL format: %@", imageURL]), nil, nil);
  }
  return nil;
}

@end
#pragma clang diagnostic pop
