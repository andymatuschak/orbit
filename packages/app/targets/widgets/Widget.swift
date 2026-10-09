//
//  OrbitHomeScreen.swift
//  OrbitHomeScreen
//
//  Created by Andy Matuschak on 2023-12-21.
//

import AppIntents
import SwiftUI
import WidgetKit

@MainActor
private enum WidgetReviewState {
  private static let revealedReviewItemKey = "OrbitWidget.revealedReviewItem"
  private static let defaults: UserDefaults = {
    guard
      let appGroupID = Bundle.main.object(forInfoDictionaryKey: "OPSQLite_AppGroup") as? String,
      let defaults = UserDefaults(suiteName: appGroupID)
    else {
      preconditionFailure("The widget's shared app group isn't configured")
    }
    return defaults
  }()

  static func isShowingAnswer(taskID: TaskID, componentID: String) -> Bool {
    defaults.stringArray(forKey: revealedReviewItemKey) == [taskID, componentID]
  }

  static func toggleAnswer(taskID: TaskID, componentID: String) {
    if isShowingAnswer(taskID: taskID, componentID: componentID) {
      defaults.removeObject(forKey: revealedReviewItemKey)
    } else {
      defaults.set([taskID, componentID], forKey: revealedReviewItemKey)
    }
  }

  static func hideAnswer(taskID: TaskID, componentID: String) {
    guard isShowingAnswer(taskID: taskID, componentID: componentID) else { return }
    defaults.removeObject(forKey: revealedReviewItemKey)
  }
}

struct Provider: TimelineProvider {
  func getSnapshot(in context: Context, completion: @escaping @Sendable (Entry) -> Void) {
    Task { @MainActor in
      let queue = await Bridge.shared.generateReviewQueue()
      let pendingItem = queue.items.first
      let item = pendingItem ?? .placeholder
      completion(
        Entry(
          vaultID: queue.vaultID,
          item: item,
          isShowingAnswer: pendingItem.map {
            WidgetReviewState.isShowingAnswer(
              taskID: $0.task.id,
              componentID: $0.componentID
            )
          } ?? false,
          hasReviewItem: pendingItem != nil,
          date: .now
        )
      )
    }
  }

  func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<Entry>) -> Void) {
    Task { @MainActor in
      let currentDate = Date.now
      let queue = await Bridge.shared.generateReviewQueue()
      let currentItem = queue.items.first
      // Future entries would replace an unanswered prompt on a timer, even
      // while the user is revealing it. Advance only after a review changes
      // the projection (or when WidgetKit asks for a fresh timeline).
      let entry = Entry(
        vaultID: queue.vaultID,
        item: currentItem ?? .empty,
        isShowingAnswer: currentItem.map {
          WidgetReviewState.isShowingAnswer(
            taskID: $0.task.id,
            componentID: $0.componentID
          )
        } ?? false,
        hasReviewItem: currentItem != nil,
        date: currentDate
      )

      completion(
        Timeline(
          entries: [entry],
          policy: .after(currentDate.addingTimeInterval(60 * 60))
        )
      )
    }
  }

  func placeholder(in context: Context) -> Entry {
    Entry(
      vaultID: nil,
      item: .placeholder,
      isShowingAnswer: false,
      hasReviewItem: false,
      date: .now
    )
  }
}

struct Entry: TimelineEntry, Sendable {
  let vaultID: String?
  let item: OrbitReviewItem
  let isShowingAnswer: Bool
  let hasReviewItem: Bool
  let date: Date
}

struct TogglePromptIntent: AppIntent {
  static let title: LocalizedStringResource = "Toggle the front/back of the current prompt"
  static let isDiscoverable = false
  @Parameter(title: "Task ID") var taskID: String
  @Parameter(title: "Component ID") var componentID: String

  init() {}

  init(taskID: TaskID, componentID: String) {
    self.taskID = taskID
    self.componentID = componentID
  }

  func perform() async throws -> some IntentResult {
    await WidgetReviewState.toggleAnswer(taskID: taskID, componentID: componentID)
    return .result()
  }
}

struct MarkPromptIntent: AppIntent {
  static let title: LocalizedStringResource = "Record a review of the current prompt"
  static let isDiscoverable = false
  @Parameter(title: "Task ID") var taskID: String
  @Parameter(title: "Component ID") var componentID: String
  @Parameter(title: "Outcome") var outcome: String
  @Parameter(title: "Vault ID") var vaultID: String

  init() {}

  init(vaultID: String, taskID: TaskID, componentID: String, outcome: TaskRepetitionOutcome) {
    self.vaultID = vaultID
    self.taskID = taskID
    self.componentID = componentID
    self.outcome = outcome.rawValue
  }

  func perform() async throws -> some IntentResult {
    guard let outcome = TaskRepetitionOutcome(rawValue: outcome) else {
      throw WidgetProjectionStoreError.invalidInput("unsupported review outcome")
    }
    try await Bridge.shared.recordReview(
      taskID: taskID,
      componentID: componentID,
      outcome: outcome,
      date: .now,
      expectedVaultID: vaultID
    )
    await WidgetReviewState.hideAnswer(taskID: taskID, componentID: componentID)
    return .result()
  }
}

extension EnvironmentValues {
  private struct ColorPaletteKey: EnvironmentKey {
    static let defaultValue = ColorPalette.red
  }

  var colorPalette: ColorPalette {
    get { self[ColorPaletteKey.self] }
    set { self[ColorPaletteKey.self] = newValue }
  }
}

struct PromptContent: View {
  let item: OrbitReviewItem
  let isShowingAnswer: Bool

  @Environment(\.widgetContentMargins) var margins
  @Environment(\.colorPalette) var colorPalette: ColorPalette

  var body: some View {
    let spec = item.task.spec

    VStack(alignment: .leading, spacing: 0) {
      if let provenanceTitle = item.task.provenance?.title {
        Text(provenanceTitle)
          .lineLimit(1)
          .foregroundStyle(colorPalette.secondaryTextColor)
          .modifier(PromptTextStyle(fontStyle: OrbitLabelSmall.self))
      }

      switch spec {
      case .memory(.qa(let q, let a)):
        let text = compactPromptText(isShowingAnswer ? a.text : q.text).text
        Group {
          if containsLaTeX(text) {
            PromptLaTeXText(text: text)
          } else {
            Text(inlineMarkdown(text))
              .modifier(PromptTextStyle(text: text))
          }
        }
        .widgetAccentable(isShowingAnswer)
        .animation(.linear(duration: 0.05), value: isShowingAnswer)
        .frame(maxHeight: .infinity, alignment: .bottom)

      case .memory(.cloze(let body, let components)):
        let ranges = components[item.componentID]?.ranges ?? []
        let compacted = compactPromptText(body.text, ranges: ranges)
        if containsLaTeX(compacted.text) {
          PromptLaTeXText(
            text: buildLaTeXClozeText(
              text: compacted.text,
              ranges: compacted.ranges,
              isShowingAnswer: isShowingAnswer
            ),
            fontSizingText: compacted.text,
            highlightedRanges: isShowingAnswer ? compacted.ranges : [],
            highlightColor: colorPalette.accentColor
          )
            .widgetAccentable(isShowingAnswer)
            .animation(.linear(duration: 0.05), value: isShowingAnswer)
            .frame(maxHeight: .infinity, alignment: .bottom)
        } else {
          buildClozeText(
            text: compacted.text,
            ranges: compacted.ranges,
            colorPalette: colorPalette,
            isShowingAnswer: isShowingAnswer
          )
            .modifier(PromptTextStyle(text: compacted.text))
            .widgetAccentable(isShowingAnswer)
            .animation(.linear(duration: 0.05), value: isShowingAnswer)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
      }
    }
    .frame(maxHeight: .infinity, alignment: .top)
    .padding(EdgeInsets(top: margins.top, leading: margins.leading, bottom: margins.bottom, trailing: 0))
  }
}

private struct CompactPromptText {
  let text: String
  let ranges: [ClozeTaskRange]
}

/// Orbit prompt fields contain Markdown paragraph spacing. The React Native
/// card renderer interprets those blank lines structurally, but SwiftUI's
/// plain `Text` preserves every source newline, which can spend most of a
/// widget's height on invisible Markdown whitespace. Keep one visible line per
/// non-empty source line and remap cloze offsets to that compact text.
private func compactPromptText(
  _ text: String,
  ranges: [ClozeTaskRange] = []
) -> CompactPromptText {
  let input = Array(text.utf16)
  var output: [UInt16] = []
  var boundaryMap = [Int?](repeating: nil, count: input.count + 1)

  var lineStart = 0
  while lineStart <= input.count {
    let lineEnd = input[lineStart...].firstIndex(of: 10) ?? input.count
    var contentStart = lineStart
    var contentEnd = lineEnd
    while contentStart < contentEnd,
      input[contentStart] == 9 || input[contentStart] == 13
        || input[contentStart] == 32
    {
      contentStart += 1
    }
    while contentEnd > contentStart,
      input[contentEnd - 1] == 9 || input[contentEnd - 1] == 13
        || input[contentEnd - 1] == 32
    {
      contentEnd -= 1
    }

    if contentStart < contentEnd {
      if !output.isEmpty { output.append(10) }
      var inputIndex = contentStart
      while inputIndex < contentEnd {
        boundaryMap[inputIndex] = output.count
        output.append(input[inputIndex])
        inputIndex += 1
        boundaryMap[inputIndex] = output.count
      }
    }

    guard lineEnd < input.count else { break }
    lineStart = lineEnd + 1
  }

  let compactedRanges = ranges.compactMap { range -> ClozeTaskRange? in
    let rangeEnd = range.startIndex + range.length
    guard
      range.startIndex >= 0,
      rangeEnd >= range.startIndex,
      rangeEnd < boundaryMap.count,
      let compactedStart = boundaryMap[range.startIndex],
      let compactedEnd = boundaryMap[rangeEnd],
      compactedEnd >= compactedStart
    else {
      return nil
    }
    return ClozeTaskRange(
      startIndex: compactedStart,
      length: compactedEnd - compactedStart,
      hint: range.hint
    )
  }

  return CompactPromptText(
    text: String(decoding: output, as: UTF16.self),
    ranges: compactedRanges
  )
}

private func inlineMarkdown(_ source: String) -> AttributedString {
  let options = AttributedString.MarkdownParsingOptions(
    interpretedSyntax: .inlineOnlyPreservingWhitespace,
    failurePolicy: .returnPartiallyParsedIfPossible
  )
  var rendered = (try? AttributedString(markdown: source, options: options))
    ?? AttributedString(source)

  // Match Orbit's main prompt renderer: links retain the prompt's ink color
  // and are distinguished from surrounding prose with an underline. Strip
  // the URL action after parsing: this interactive widget already contains
  // AppIntent buttons and a widgetURL, and WidgetKit cannot archive a nested
  // AttributedString link action in that hierarchy. Tapping the prompt still
  // opens the corresponding review in Orbit.
  let linkRanges = rendered.runs.compactMap { run in
    run.link == nil ? nil : run.range
  }
  for range in linkRanges {
    rendered[range].foregroundColor = ink
    rendered[range].underlineStyle = Text.LineStyle(pattern: .solid)
    rendered[range].link = nil
  }

  return rendered
}

struct PromptTextStyle: ViewModifier {
  let fontStyle: OrbitFont.Type
  init(text: String) {
    self.fontStyle = switch text.count {
    case 0 ... 70:
      OrbitPromptMedium.self
    default:
      OrbitPromptSmall.self
    }
  }

  init(fontStyle: OrbitFont.Type) {
    self.fontStyle = fontStyle
  }

  func body(content: Content) -> some View {
    content
      .font(fontStyle.font)
      .kerning(fontStyle.kerning)
      .foregroundStyle(ink)
      .lineHeight(.variable)
      .contentTransition(.opacity)
  }
}

private let clozeBlankSentinel: Character = "\u{F0000}"
private let clozeHighlightStartSentinel: Character = "\u{F0001}"
private let clozeHighlightEndSentinel: Character = "\u{F0002}"

private func stringRange(for range: ClozeTaskRange, in source: String) -> Range<String.Index>? {
  guard range.startIndex >= 0, range.length >= 0 else { return nil }
  let utf16 = source.utf16
  guard
    let lowerUTF16Index = utf16.index(
      utf16.startIndex,
      offsetBy: range.startIndex,
      limitedBy: utf16.endIndex
    ),
    let upperUTF16Index = utf16.index(
      lowerUTF16Index,
      offsetBy: range.length,
      limitedBy: utf16.endIndex
    ),
    let lowerIndex = String.Index(lowerUTF16Index, within: source),
    let upperIndex = String.Index(upperUTF16Index, within: source)
  else {
    return nil
  }
  return lowerIndex ..< upperIndex
}

private func markClozeRanges(
  in source: String,
  ranges: [ClozeTaskRange],
  isShowingAnswer: Bool
) -> String {
  var output = source
  for range in ranges.sorted(by: { $0.startIndex < $1.startIndex }).reversed() {
    guard let markedRange = stringRange(for: range, in: output) else { continue }
    if isShowingAnswer {
      let answer = output[markedRange]
      output.replaceSubrange(
        markedRange,
        with: String(clozeHighlightStartSentinel)
          + answer
          + String(clozeHighlightEndSentinel)
      )
    } else {
      output.replaceSubrange(markedRange, with: String(clozeBlankSentinel))
    }
  }
  return output
}

func buildClozeText(text: String, ranges: [ClozeTaskRange], colorPalette: ColorPalette, isShowingAnswer: Bool) -> some View {
  let marked = markClozeRanges(
    in: text,
    ranges: ranges,
    isShowingAnswer: isShowingAnswer
  )
  let markdown = inlineMarkdown(marked)
  var output = Text("")
  var segmentStart = markdown.startIndex
  var cursor = markdown.startIndex
  var highlightDepth = 0

  func appendMarkdown(through end: AttributedString.Index) {
    guard segmentStart < end else { return }
    var fragment = Text(AttributedString(markdown[segmentStart ..< end]))
    if highlightDepth > 0 {
      fragment = fragment.foregroundStyle(colorPalette.accentColor)
    }
    output = Text("\(output)\(fragment)")
  }

  while cursor < markdown.endIndex {
    let character = markdown.characters[cursor]
    let next = markdown.characters.index(after: cursor)
    guard character == clozeBlankSentinel
      || character == clozeHighlightStartSentinel
      || character == clozeHighlightEndSentinel
    else {
      cursor = next
      continue
    }

    appendMarkdown(through: cursor)
    switch character {
    case clozeBlankSentinel:
      output = Text("\(output)\(Text("______").customAttribute(ClozeBlankAttribute()))")
    case clozeHighlightStartSentinel:
      highlightDepth += 1
    case clozeHighlightEndSentinel:
      highlightDepth = max(0, highlightDepth - 1)
    default:
      break
    }
    segmentStart = next
    cursor = next
  }

  appendMarkdown(through: markdown.endIndex)
  return output.textRenderer(ClozeBlankRenderer(color: colorPalette.accentColor))
}

struct ClozeBlankAttribute: TextAttribute {}

struct ClozeBlankRenderer: TextRenderer {
  let color: Color

  func draw(layout: Text.Layout, in context: inout GraphicsContext) {
    let thickness: CGFloat = 3.0

    for line in layout {
      for run in line {
        if run[ClozeBlankAttribute.self] == nil {
          context.draw(run)
        } else {
          let bounds = run.typographicBounds
          context.fill(Rectangle().path(in: CGRect(x: bounds.origin.x, y: bounds.origin.y - thickness / 2.0, width: bounds.width, height: thickness)), with: .color(color))
        }
      }
    }
  }
}

struct WidgetButton: View {
  @Environment(\.widgetContentMargins) var margins
  @Environment(\.colorPalette) var colorPalette
  @Environment(\.widgetRenderingMode) private var renderingMode
  let intent: any AppIntent
  let iconName: String
  let alignment: Alignment

  var body: some View {
    // bit of a hack: the images have 4px padding in them (oops)
    let insets = EdgeInsets(top: margins.top - 4, leading: margins.leading - 4, bottom: margins.bottom - 4 + 1.5, trailing: margins.trailing - 4)
    let backgroundColor = renderingMode == .fullColor
      ? colorPalette.secondaryBackgroundColor
      : Color.white.opacity(0.18)

    Button(intent: intent) {
      ZStack {
        Image(iconName)
          .widgetAccentedRenderingMode(.accented)
          .foregroundStyle(colorPalette.accentColor)
        if iconName == "reveal-center", renderingMode == .fullColor {
          Image("reveal-accent-center")
            .widgetAccentedRenderingMode(.fullColor)
            .foregroundStyle(.white)
        }
      }
      .frame(maxHeight: .infinity, alignment: alignment)
      .padding(insets)
    }
    .background(backgroundColor)
    .buttonStyle(.plain)
  }
}

struct PromptView: View {
  @Environment(\.colorPalette) var colorPalette

  let item: OrbitReviewItem
  let isShowingAnswer: Bool
  let hasReviewItem: Bool
  let vaultID: String?

  var body: some View {
    HStack(spacing: 8) {
      HStack() {
        PromptContent(item: item, isShowingAnswer: isShowingAnswer)
        Spacer()
      }

      if hasReviewItem, let vaultID {
        if isShowingAnswer {
          VStack(spacing: 4) {
            WidgetButton(intent: MarkPromptIntent(vaultID: vaultID, taskID: item.task.id, componentID: item.componentID, outcome: .forgotten), iconName: "cross-center", alignment: .bottom)
            WidgetButton(intent: MarkPromptIntent(vaultID: vaultID, taskID: item.task.id, componentID: item.componentID, outcome: .remembered), iconName: "check-center", alignment: .bottom)
          }
        } else {
          WidgetButton(
            intent: TogglePromptIntent(taskID: item.task.id, componentID: item.componentID),
            iconName: "reveal-center",
            alignment: .bottom
          )
        }
      }
    }
  }
}

func colorPalette(for item: OrbitReviewItem) -> ColorPalette {
  if let colorPalette = item.task.provenance?.colorPaletteName?.colorPalette {
    return colorPalette
  }

  guard let componentState = item.task.componentStates[item.componentID] else {
    return .red
  }
  return ColorPaletteName.fromTimestamp(componentState.createdAtTimestampMillis).colorPalette
}

struct OrbitHomeScreen: Widget {
  let kind: String = "OrbitHomeScreen"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      let colorPalette = colorPalette(for: entry.item)
      PromptView(
        item: entry.item,
        isShowingAnswer: entry.isShowingAnswer,
        hasReviewItem: entry.hasReviewItem,
        vaultID: entry.vaultID
      )
        .containerBackground(colorPalette.backgroundColor, for: .widget)
        .widgetURL(
          entry.hasReviewItem
            ? URL(string: "com.withorbit.native://review?taskID=\(entry.item.task.id)&componentID=\(entry.item.componentID)")
            : nil
        )
        .environment(\.colorPalette, colorPalette)
    }
    .supportedFamilies([.systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

#Preview(as: .systemMedium) {
  OrbitHomeScreen()
} timeline: {
  Entry(vaultID: nil, item: .empty, isShowingAnswer: false, hasReviewItem: false, date: .now)
  Entry(vaultID: "preview", item: .placeholder, isShowingAnswer: false, hasReviewItem: true, date: .now)
  Entry(vaultID: "preview", item: .clozePlaceholder, isShowingAnswer: false, hasReviewItem: true, date: .now)
  Entry(vaultID: "preview", item: .clozePlaceholder, isShowingAnswer: true, hasReviewItem: true, date: .now)
}
