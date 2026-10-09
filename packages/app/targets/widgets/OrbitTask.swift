//
//  OrbitTypes.swift
//  OrbitHomeScreenExtension
//
//  Created by Andy Matuschak on 2023-12-26.
//

import Foundation

typealias TaskID = String

struct OrbitReviewItem: Sendable {
  let task: OrbitTask
  let componentID: String

  static let mainTaskComponentID = "main"
  static let clozePlaceholderComponentID = "a"
}

extension OrbitReviewItem {
  init(decoding obj: Any) throws {
    task = try OrbitTask(decoding: try decodeProperty(obj, "task"))
    componentID = try decodeProperty(obj, "componentID")
  }
}

extension OrbitReviewItem {
  static let empty = OrbitReviewItem(
    task: .empty,
    componentID: OrbitReviewItem.mainTaskComponentID
  )

  static let placeholder = OrbitReviewItem(
    task: .placeholder,
    componentID: OrbitReviewItem.mainTaskComponentID
  )

  static let clozePlaceholder = OrbitReviewItem(
    task: .clozePlaceholder,
    componentID: clozePlaceholderComponentID
  )
}

struct OrbitTask: Sendable {
  let id: TaskID
  let provenance: TaskProvenance?
  let spec: TaskSpec

  let componentStates: [String: TaskComponentState]
}

extension OrbitTask {
  init(decoding obj: Any) throws {
    id = try decodeProperty(obj, "id")
    if let provenanceProperty: NSDictionary = try decodeOptionalProperty(obj, "provenance") {
      provenance = try TaskProvenance(decoding: provenanceProperty)
    } else {
      provenance = nil
    }
    spec = try TaskSpec(decoding: try decodeProperty(obj, "spec"))
    let componentsDict: [String: Any] = try decodeProperty(obj, "componentStates")
    componentStates = Dictionary(uniqueKeysWithValues: try componentsDict.map { (id, stateJSON) in (id, try TaskComponentState(decoding: stateJSON)) })
  }
}

extension OrbitTask {
  static let empty = OrbitTask(
    id: "",
    provenance: nil,
    spec: .memory(
      .qa(
        body: TaskContentField(text: "You're all caught up."),
        answer: TaskContentField(text: "You're all caught up."))),
    componentStates: [
      OrbitReviewItem.mainTaskComponentID: TaskComponentState(createdAtTimestampMillis: 0)
    ]
  )

  static let placeholder = OrbitTask(
    id: "xxx",
    provenance: TaskProvenance(title: "Source article with an awfully long name that probably won't fit in the widget", url: "https://www.example.com", colorPaletteName: .red),
    spec: .memory(
      .qa(
        body: TaskContentField(text: "Example question with a long string that will wrap onto multiple lines and will make for a small text size because it's so long"),
        answer: TaskContentField(text: "Example answer"))),
    componentStates: [
      OrbitReviewItem.mainTaskComponentID: TaskComponentState(createdAtTimestampMillis: 0)
    ]
  )

  static let clozePlaceholder = OrbitTask(
    id: "xxx",
    provenance: TaskProvenance(title: "Test", url: nil, colorPaletteName: .orange),
    spec: .memory(
      .cloze(
        body: TaskContentField(text: "This is a test cloze prompt."),
        components: [
          "a": ClozeTaskComponent(ranges: [ClozeTaskRange(startIndex: 5, length: 4, hint: nil), ClozeTaskRange(startIndex: 15, length: 5, hint: nil)]),
          "b": ClozeTaskComponent(ranges: [ClozeTaskRange(startIndex: 2, length: 2, hint: nil)]),
        ]
      )
    ),
    componentStates: [
      OrbitReviewItem.clozePlaceholderComponentID: TaskComponentState(createdAtTimestampMillis: 0)
    ]
  )
}

struct TaskProvenance: Sendable {
  let title: String?
  let url: String?
  let colorPaletteName: ColorPaletteName?
}

extension TaskProvenance {
  init(decoding obj: Any) throws {
    if let colorPaletteNameProperty: String = try decodeOptionalProperty(obj, "colorPaletteName") {
      colorPaletteName = try ColorPaletteName(decoding: colorPaletteNameProperty)
    } else {
      colorPaletteName = nil
    }
    title = try decodeOptionalProperty(obj, "title")
    url = try decodeOptionalProperty(obj, "url")
  }
}

enum TaskSpec: Sendable {
  case memory(TaskContent)
}

extension TaskSpec {
  init(decoding obj: Any) throws {
    let type: String = try decodeProperty(obj, "type")
    switch type {
    case "memory":
      self = .memory(try TaskContent(decoding: try decodeProperty(obj, "content")))
    default:
      throw DecodeError.invalidValue(value: type)
    }
  }
}

enum TaskContent: Sendable {
  case qa(body: TaskContentField, answer: TaskContentField)
  case cloze(body: TaskContentField, components: [String: ClozeTaskComponent])
}

extension TaskContent {
  init(decoding obj: Any) throws {
    let type: String = try decodeProperty(obj, "type")
    switch type {
    case "qa":
      self = .qa(
        body: try TaskContentField(decoding: try decodeProperty(obj, "body")),
        answer: try TaskContentField(decoding: try decodeProperty(obj, "answer"))
      )
    case "cloze":
      let componentsDict: [String: Any] = try decodeProperty(obj, "components")
      self = .cloze(
        body: try TaskContentField(decoding: try decodeProperty(obj, "body")),
        components: Dictionary(uniqueKeysWithValues: try componentsDict.map { (id, componentJSON) in (id, try ClozeTaskComponent(decoding: componentJSON)) }))
    default:
      throw DecodeError.invalidValue(value: type)
    }
  }
}

struct ClozeTaskComponent: Sendable {
  let ranges: [ClozeTaskRange]
}

extension ClozeTaskComponent {
  init(decoding obj: Any) throws {
    let rangesJSON: [Any] = try decodeProperty(obj, "ranges")
    ranges = try rangesJSON.map { try ClozeTaskRange(decoding: $0) }
  }
}

struct ClozeTaskRange: Sendable {
  let startIndex: Int
  let length: Int
  let hint: String?
}

extension ClozeTaskRange {
  init(decoding obj: Any) throws {
    startIndex = try decodeProperty(obj, "startIndex")
    length = try decodeProperty(obj, "length")
    hint = try decodeOptionalProperty(obj, "hint")
  }
}

struct TaskContentField: Sendable {
  let text: String
}

extension TaskContentField {
  init(decoding obj: Any) throws {
    text = try decodeProperty(obj, "text")
  }
}

struct TaskComponentState: Sendable {
  let createdAtTimestampMillis: TimeInterval
}

extension TaskComponentState {
  init(decoding obj: Any) throws {
    createdAtTimestampMillis = try decodeProperty(obj, "createdAtTimestampMillis")
  }
}

enum DecodeError: Error, Sendable {
  case unexpectedType(value: String, expectedType: String)
  case missingProperty(object: String, propertyName: String)
  case invalidValue(value: String)
}

private func decodeProperty<T>(_ obj: Any, _ propertyName: String) throws -> T {
  if let dict = obj as? NSDictionary {
    if let value = dict[propertyName] {
      if let typedValue = value as? T {
        return typedValue
      } else {
        throw DecodeError.unexpectedType(
          value: String(describing: value),
          expectedType: String(describing: T.self)
        )
      }
    } else {
      throw DecodeError.missingProperty(
        object: String(describing: dict),
        propertyName: propertyName
      )
    }
  } else {
    throw DecodeError.unexpectedType(
      value: String(describing: obj),
      expectedType: String(describing: NSDictionary.self)
    )
  }
}

private func decodeOptionalProperty<T>(_ obj: Any, _ propertyName: String) throws -> T? {
  if let dict = obj as? NSDictionary {
    if let value = dict[propertyName] {
      if let typedValue = value as? T {
        return typedValue
      } else if value is NSNull {
        return nil
      } else {
        throw DecodeError.unexpectedType(
          value: String(describing: value),
          expectedType: String(describing: T.self)
        )
      }
    } else {
      return nil
    }
  } else {
    throw DecodeError.unexpectedType(
      value: String(describing: obj),
      expectedType: String(describing: NSDictionary.self)
    )
  }
}

enum TaskRepetitionOutcome: String, Sendable {
  case remembered
  case forgotten
}
