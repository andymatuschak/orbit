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
      let pendingItem = await Bridge.shared.generateReviewQueue().first
      let item = pendingItem ?? .placeholder
      completion(
        Entry(
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
      let entries: [Entry]

      if queue.isEmpty {
        entries = [
          Entry(
            item: .empty,
            isShowingAnswer: false,
            hasReviewItem: false,
            date: currentDate
          )
        ]
      } else {
        entries = queue.prefix(50).enumerated().map { offset, item in
          Entry(
            item: item,
            isShowingAnswer: WidgetReviewState.isShowingAnswer(
              taskID: item.task.id,
              componentID: item.componentID
            ),
            hasReviewItem: true,
            date: currentDate.addingTimeInterval(TimeInterval(offset * 5 * 60))
          )
        }
      }

      completion(
        Timeline(
          entries: entries,
          policy: .after(currentDate.addingTimeInterval(60 * 60))
        )
      )
    }
  }

  func placeholder(in context: Context) -> Entry {
    Entry(
      item: .placeholder,
      isShowingAnswer: false,
      hasReviewItem: false,
      date: .now
    )
  }
}

struct Entry: TimelineEntry, Sendable {
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
  @Parameter(title: "Outcome") var outcome: TaskRepetitionOutcome

  init() {}

  init(taskID: TaskID, componentID: String, outcome: TaskRepetitionOutcome) {
    self.taskID = taskID
    self.componentID = componentID
    self.outcome = outcome
  }

  func perform() async throws -> some IntentResult {
    try await Bridge.shared.recordReview(
      taskID: taskID,
      componentID: componentID,
      outcome: outcome,
      date: .now
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
      if let provenance = item.task.provenance {
        Text(provenance.title)
          .lineLimit(1)
          .foregroundStyle(colorPalette.secondaryTextColor)
          .modifier(PromptTextStyle(fontStyle: OrbitLabelSmall.self))
      }

      switch spec {
      case .memory(.qa(let q, let a)):
        let text = isShowingAnswer ? a.text : q.text
        Text(text)
          .modifier(PromptTextStyle(text: text))
          .widgetAccentable(isShowingAnswer)
          .animation(.linear(duration: 0.05), value: isShowingAnswer)
          .frame(maxHeight: .infinity, alignment: .bottom)

      case .memory(.cloze(let body, let components)):
        buildClozeText(
          text: body.text,
          ranges: components[item.componentID]?.ranges ?? [],
          colorPalette: colorPalette,
          isShowingAnswer: isShowingAnswer
        )
          .modifier(PromptTextStyle(text: body.text))
          .widgetAccentable(isShowingAnswer)
          .animation(.linear(duration: 0.05), value: isShowingAnswer)
          .frame(maxHeight: .infinity, alignment: .bottom)
      }
    }
    .frame(maxHeight: .infinity, alignment: .top)
    .padding(EdgeInsets(top: margins.top, leading: margins.leading, bottom: margins.bottom, trailing: 0))
  }
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

func buildClozeText(text: String, ranges: [ClozeTaskRange], colorPalette: ColorPalette, isShowingAnswer: Bool) -> some View {
  func substring(_ string: String, utf16Offset: Int, length: Int) -> String {
    guard utf16Offset >= 0, length >= 0 else { return "" }

    let utf16 = string.utf16
    guard
      let lowerUTF16Index = utf16.index(
        utf16.startIndex,
        offsetBy: utf16Offset,
        limitedBy: utf16.endIndex
      ),
      let upperUTF16Index = utf16.index(
        lowerUTF16Index,
        offsetBy: length,
        limitedBy: utf16.endIndex
      ),
      let lowerIndex = String.Index(lowerUTF16Index, within: string),
      let upperIndex = String.Index(upperUTF16Index, within: string)
    else {
      return ""
    }

    return String(string[lowerIndex ..< upperIndex])
  }

  var output = Text("")
  for (prev, curr) in zip([nil] + ranges, ranges + [nil]) {
    let startIdx = (prev?.startIndex ?? 0) + (prev?.length ?? 0)
    if let curr = curr {
      let precedingText = Text(
        substring(text, utf16Offset: startIdx, length: curr.startIndex - startIdx)
      )
      output = Text("\(output)\(precedingText)")
      if isShowingAnswer {
        let answer = Text(
          substring(text, utf16Offset: curr.startIndex, length: curr.length)
        )
          .foregroundStyle(colorPalette.accentColor)
        output = Text("\(output)\(answer)")
      } else {
        let blank = Text("______")
          .customAttribute(ClozeBlankAttribute())
        output = Text("\(output)\(blank)")
      }
    }
  }
  let finalStartIdx: Int
  if let lastRange = ranges.last {
    finalStartIdx = lastRange.startIndex + lastRange.length
  } else {
    finalStartIdx = 0
  }
  let trailingText = Text(
    substring(
      text,
      utf16Offset: finalStartIdx,
      length: text.utf16.count - finalStartIdx
    )
  )
  output = Text("\(output)\(trailingText)")
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

  var body: some View {
    HStack(spacing: 8) {
      HStack() {
        PromptContent(item: item, isShowingAnswer: isShowingAnswer)
          .invalidatableContent()
        Spacer()
      }

      if hasReviewItem {
        if isShowingAnswer {
          VStack(spacing: 4) {
            WidgetButton(intent: MarkPromptIntent(taskID: item.task.id, componentID: item.componentID, outcome: .forgotten), iconName: "cross-center", alignment: .bottom)
            WidgetButton(intent: MarkPromptIntent(taskID: item.task.id, componentID: item.componentID,  outcome: .remembered), iconName: "check-center", alignment: .bottom)
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
        hasReviewItem: entry.hasReviewItem
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
  Entry(item: .empty, isShowingAnswer: false, hasReviewItem: false, date: .now)
  Entry(item: .placeholder, isShowingAnswer: false, hasReviewItem: true, date: .now)
  Entry(item: .clozePlaceholder, isShowingAnswer: false, hasReviewItem: true, date: .now)
  Entry(item: .clozePlaceholder, isShowingAnswer: true, hasReviewItem: true, date: .now)
}
