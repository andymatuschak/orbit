//
//  Bridge.swift
//  OrbitWidgetTest
//
//  Created by Andy Matuschak on 2024-06-26.
//

import Foundation
import JavaScriptCore
import SQLite3

class Bridge {
  private let context = JSContext()!

  init() {
    let bundleURL = Bundle(for: type(of: self))
      .url(forResource: "widget", withExtension: "js")!
    let bundleSource = try! String(contentsOf: bundleURL, encoding: .utf8)
    context.exceptionHandler = { context, exception in
      print("JS EXCEPTION: \(exception!.toString()!)")
    }
    let consoleLog: @convention(block) () -> Void = {
      for arg in (JSContext.currentArguments() as! [JSValue]) {
        if arg.isBoolean { print(arg.toBool()) }
        else if arg.isNumber { print(arg.toNumber()!) }
        else if arg.isString { print(arg.toString()!) }
        else if arg.isSymbol { print(arg.toString()!) }
        else if arg.isDate { print (arg.toString()!) }
        else if arg.isUndefined { print("undefined") }
        else if arg.isNull { print("null") }
        else if arg.isObject { print(arg.toObject()!) }
        else { fatalError("Unsupported type \(arg)") }
      }
    }
    context.globalObject.setObject(consoleLog, forKeyedSubscript: "_consoleLog")
    context.evaluateScript("globalThis.console = { log: _consoleLog }")

    context.globalObject.setObject(SQLiteDatabaseBridge.self, forKeyedSubscript: "SQLiteDatabase")

    let cryptoShim = JSValue(newObjectIn: context)!
    let randomUUID: @convention(block) () -> String = { UUID().uuidString }
    cryptoShim.setObject(randomUUID, forKeyedSubscript: "randomUUID")
    context.globalObject.setObject(cryptoShim, forKeyedSubscript: "cryptoShim")

    context.evaluateScript(bundleSource)
  }

  func generateReviewQueue() async -> [OrbitReviewItem] {
    let fn = context.globalObject.objectForKeyedSubscript(
      "generateReviewQueue")!
    let jsQueue = try! await fn.callAsync()
    let wrappedTasks = jsQueue.toArray()!
    let tasks = wrappedTasks.compactMap({
      do {
        return try OrbitReviewItem.init(decoding: $0)
      } catch {
        print(error)
        return nil
      }
    })
    return tasks
  }

  func recordReview(taskID: TaskID, componentID: String, outcome: TaskRepetitionOutcome, date: Date) async {
    let fn = context.globalObject.objectForKeyedSubscript(
      "recordReview")!
    _ = try! await fn.callAsync(withArguments: [taskID, componentID, outcome.rawValue, date.timeIntervalSince1970 * 1000.0])
  }

}

extension JSValue {
  func callAsync(withArguments: [Any] = []) async throws -> JSValue {
    try await withCheckedThrowingContinuation { continuation in
      let onFulfilled: @convention(block) (JSValue) -> Void = {
        continuation.resume(returning: $0)
      }
      let onRejected: @convention(block) (JSValue) -> Void = { error in
        let error = NSError(
          domain: "JSError", code: 0,
          userInfo: [NSLocalizedDescriptionKey: "Rejected promise: \(error.isObject ? error.toObject()! : error.toString()!)"])
        continuation.resume(throwing: error)
      }
      let promiseArgs = [
        unsafeBitCast(onFulfilled, to: JSValue.self),
        unsafeBitCast(onRejected, to: JSValue.self),
      ]

      let promise = self.call(withArguments: withArguments)
      promise?.invokeMethod("then", withArguments: promiseArgs)
    }
  }
}

typealias PrepareFn = (@convention(block) (String) -> SQLiteStatementBridge?)
typealias TransactionFn = (@convention(block) (JSValue) -> SQLiteTransactionBridge)

@objc protocol SQLiteDatabaseBridgeExports: JSExport {
  init(databaseName: String)
  var prepare: PrepareFn { get }
  var transaction: TransactionFn { get }
}

@objc class SQLiteDatabaseBridge: NSObject, SQLiteDatabaseBridgeExports {
  var db: OpaquePointer?

  private static func path(databaseName: String) -> String {
    let appGroupID = Bundle.main.object(forInfoDictionaryKey: "OPSQLite_AppGroup") as! String
    let storeURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)!
    return storeURL
      .appending(component: databaseName)
      .path(percentEncoded: false)
  }

  required init(databaseName: String) {
    let databaseURL = Self.path(databaseName: databaseName)
    if sqlite3_open(databaseURL, &db) == SQLITE_OK {
      print("Opened database at \(databaseURL)")
    } else {
      print("Couldn't open database \(sqlite3_errmsg(db)!)")
    }
  }

  deinit {
    sqlite3_close(db)
  }

  var prepare: PrepareFn {
    return { [self] statement in
      var statementObj: OpaquePointer?
      guard
        sqlite3_prepare_v2(db, statement, Int32(statement.lengthOfBytes(using: .ascii)), &statementObj, nil)
          == SQLITE_OK
      else {
        fatalError("Couldn't prepare statement \(statement): \(sqlite3_errmsg(db)!)")
      }
      return SQLiteStatementBridge(statementObj: statementObj!)
    }
  }

  var transaction: TransactionFn {
    return { [self] continuation in
      return SQLiteTransactionBridge(db: db!, continuation: continuation)
    }
  }
}

typealias AllFn = (@convention(block) () -> [Any])
typealias RunFn = (@convention(block) () -> Void)
@objc protocol SQLiteStatementBridgeExports: JSExport {
  var all: AllFn { get }
  var run: RunFn { get }
}

let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
@objc class SQLiteStatementBridge: NSObject, SQLiteStatementBridgeExports {
  let statementObj: OpaquePointer

  init(statementObj: OpaquePointer) {
    self.statementObj = statementObj
  }

  deinit {
    sqlite3_finalize(statementObj)
  }

  var all: AllFn {
    return { [self] () -> [Any] in
      execute(args: JSContext.currentArguments() as! [JSValue], returnsResults: true)!
    }
  }

  var run: RunFn {
    return { [self] () -> Void in
      _ = execute(args: JSContext.currentArguments() as! [JSValue], returnsResults: false)
    }
  }

  private func execute(args: [JSValue], returnsResults: Bool) -> [[String: Any?]]? {
    sqlite3_clear_bindings(statementObj)
    sqlite3_reset(statementObj)

    for (i, arg) in args.enumerated() {
      let sqliteIndex = Int32(i) + 1
      if arg.isString {
        let argString = arg.toString()!
        sqlite3_bind_text(
          statementObj, sqliteIndex, argString, Int32(argString.lengthOfBytes(using: .utf8)), SQLITE_TRANSIENT)
      } else if arg.isNumber {
        // We can't tell from here whether it's supposed to be an int or a double; it's coming from JS, where all numerics are doubles, so we'll interpret it as such.
        let argNum = arg.toDouble()
        sqlite3_bind_double(statementObj, sqliteIndex, argNum)
      } else if arg.isBoolean {
        sqlite3_bind_int(statementObj, sqliteIndex, arg.toBool() ? 1 : 0)
      } else if arg.isNull || arg.isUndefined {
        sqlite3_bind_null(statementObj, sqliteIndex)
      } else {
        fatalError("Unsupported argument type: \(arg)")
      }
    }

    var rows: [[Any?]] = []
    var columnNames: [String] = []
    var isConsuming = true
    while isConsuming {
      switch sqlite3_step(statementObj) {
      case SQLITE_ROW:
        guard returnsResults else { break }
        var row: [Any?] = []
        for i in 0..<sqlite3_column_count(statementObj) {
          let sqlI = Int32(i)
          let columnType = sqlite3_column_type(statementObj, sqlI)
          switch columnType {
          case SQLITE_INTEGER, SQLITE_FLOAT:
            // Note that if it's an integer, we may lose precision: JS only supports doubles.
            row.append(sqlite3_column_double(statementObj, sqlI))

          case SQLITE_TEXT:
            // TODO avoid extra copy
            let text = String(cString: sqlite3_column_text(statementObj, sqlI))
            row.append(text)

          case SQLITE_NULL:
            row.append(nil)

          default:
            fatalError("Unsupported column type \(columnType)")
          }
        }
        rows.append(row)

      case SQLITE_DONE:
        isConsuming = false
        for i in 0..<sqlite3_column_count(statementObj) {
          let name = String(cString: sqlite3_column_name(statementObj, Int32(i)))
          columnNames.append(name)
        }

      default:
        fatalError("Unhandled SQLite step error")
      }
    }

    if returnsResults {
      return rows.map { row in
        guard row.count == columnNames.count else { fatalError("unexpected row length") }
        return Dictionary(uniqueKeysWithValues: zip(columnNames, row))
      }
    } else {
      return nil
    }
  }
}

typealias ExclusiveFn = (@convention(block) () -> Void)
@objc protocol SQLiteTransactionBridgeExports: JSExport {
  var exclusive: ExclusiveFn { get }
}

@objc class SQLiteTransactionBridge: NSObject, SQLiteTransactionBridgeExports {
  let db: OpaquePointer
  let continuation: JSValue

  init(db: OpaquePointer, continuation: JSValue) {
    self.db = db
    self.continuation = continuation
  }

  var exclusive: ExclusiveFn {
    return { [self] in
      sqlite3_exec(db, "BEGIN EXCLUSIVE TRANSACTION", nil, nil, nil)
      self.continuation.call(withArguments: [])
      sqlite3_exec(db, "END TRANSACTION", nil, nil, nil)
    }
  }
}
