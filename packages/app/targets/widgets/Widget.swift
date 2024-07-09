//
//  OrbitHomeScreen.swift
//  OrbitHomeScreen
//
//  Created by Andy Matuschak on 2023-12-21.
//

import AppIntents
import SwiftUI
import WidgetKit

struct ReviewState {
  var isShowingAnswer = false
  var reviewedTaskIDs: Set<TaskID> = []
  var queue: [OrbitReviewItem]? = nil

  mutating func recordReview(taskID: TaskID) {
    reviewedTaskIDs.insert(taskID)
    isShowingAnswer = false

    if queue!.allSatisfy({ item in reviewedTaskIDs.contains(item.task.id) }) {
      reviewedTaskIDs.removeAll()
    }
  }
}

var transientState = ReviewState()
let bridge = Bridge()

struct Provider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(item: .placeholder, isShowingAnswer: false, date: Date())
  }

  func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> Entry {
    Entry(item: .placeholder, isShowingAnswer: false, date: Date())
  }

  func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<Entry> {
    var entries: [Entry] = []
    print("REFRESH TIMELINE")

    //    transientState.queue = [.placeholder, .placeholder]
    if transientState.queue == nil {
      transientState.queue = await bridge.generateReviewQueue()
    }

    let queue = transientState.queue!.filter { item in !transientState.reviewedTaskIDs.contains(item.task.id) }

    let currentDate = Date()
    for hourOffset in 0..<min(50, queue.count) {
      let entryDate = Calendar.current.date(byAdding: .minute, value: 5, to: currentDate)!
      let entry = Entry(
        item: queue[hourOffset],
        isShowingAnswer: transientState.isShowingAnswer,
        date: entryDate
      )
      entries.append(entry)
    }

    return Timeline(entries: entries, policy: .after(Calendar.current.date(byAdding: .hour, value: 1, to: currentDate)!))
  }
}

struct Entry: TimelineEntry {
  let item: OrbitReviewItem
  let isShowingAnswer: Bool
  let date: Date
}

struct TogglePromptIntent: AppIntent {
  static var title: LocalizedStringResource = "Toggle the front/back of the current prompt"

  func perform() async throws -> some IntentResult {
    print("Toggle")
    transientState.isShowingAnswer.toggle()
    return .result()
  }
}

struct MarkPromptIntent: AppIntent {
  static var title: LocalizedStringResource = "Record a review of the current prompt"
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
    print("Mark \(taskID) \(outcome)")
    transientState.recordReview(taskID: taskID)
    Task {
      await bridge.recordReview(taskID: taskID, componentID: componentID, outcome: outcome, date: Date.now)
      print("Recorded review")
    }
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
    let _ = print(margins.leading)

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
          .animation(.linear(duration: 0.05), value: text)
          .frame(maxHeight: .infinity, alignment: .bottom)

      case .memory(.cloze(let body, let components)):
        buildClozeText(text: body.text, ranges: components[item.componentID]!.ranges, colorPalette: colorPalette, isShowingAnswer: isShowingAnswer)
          .modifier(PromptTextStyle(text: body.text))
          .animation(.linear(duration: 0.05), value: body.text)
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
    case 0 ... 80:
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
      .lineSpacing(0)
      .environment(\._lineHeightMultiple, 1)
      .contentTransition(.opacity)
  }
}

func buildClozeText(text: String, ranges: [ClozeTaskRange], colorPalette: ColorPalette, isShowingAnswer: Bool) -> some View {
  func substr(_ str: String, _ offset: Int, _ length: Int) -> String {
    return String(str[String.Index(utf16Offset: offset, in: str) ..< String.Index(utf16Offset: offset + length, in: str)])
  }

  var output = Text("")
  for (prev, curr) in zip([nil] + ranges, ranges + [nil]) {
    let startIdx = (prev?.startIndex ?? 0) + (prev?.length ?? 0)
    if let curr = curr {
      output = output + Text(substr(text, startIdx, curr.startIndex - startIdx))
      if isShowingAnswer {
        output = output + Text(substr(text, curr.startIndex, curr.length))
          .foregroundStyle(colorPalette.accentColor)
      } else {
        output = output + Text("______")
          .customAttribute(ClozeBlankAttribute())
      }
    }
  }
  let finalStartIdx: Int
  if let lastRange = ranges.last {
    finalStartIdx = lastRange.startIndex + lastRange.length
  } else {
    finalStartIdx = 0
  }
  output = output + Text(substr(text, finalStartIdx, text.count - finalStartIdx))
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
  let intent: any AppIntent
  let iconName: String
  let alignment: Alignment

  var body: some View {
    // bit of a hack: the images have 4px padding in them (oops)
    let insets = EdgeInsets(top: margins.top - 4, leading: margins.leading - 4, bottom: margins.bottom - 4 + 1.5, trailing: margins.trailing - 4)

    Button(intent: intent) {
      ZStack {
        Image(iconName)
          .foregroundColor(colorPalette.accentColor)
        if iconName == "reveal-center" {
          Image("reveal-accent-center").foregroundColor(.white)
        }
      }
      .frame(maxHeight: .infinity, alignment: alignment)
      .padding(insets)
    }
    .background(colorPalette.secondaryBackgroundColor)
    .buttonStyle(.plain)
  }
}

struct PromptView: View {
  @Environment(\.colorPalette) var colorPalette

  let item: OrbitReviewItem
  let isShowingAnswer: Bool

  var body: some View {
    HStack(spacing: 8) {
      HStack() {
        PromptContent(item: item, isShowingAnswer: isShowingAnswer)
        Spacer()
      }

      if isShowingAnswer {
        VStack(spacing: 4) {
          WidgetButton(intent: MarkPromptIntent(taskID: item.task.id, componentID: item.componentID, outcome: .forgotten), iconName: "cross-center", alignment: .bottom)
          WidgetButton(intent: MarkPromptIntent(taskID: item.task.id, componentID: item.componentID,  outcome: .remembered), iconName: "check-center", alignment: .bottom)
        }
      } else {
        WidgetButton(intent: TogglePromptIntent(), iconName: "reveal-center", alignment: .bottom)
      }
    }
  }
}

func colorPalette(for item: OrbitReviewItem) -> ColorPalette {
  if let colorPalette = item.task.provenance?.colorPaletteName?.colorPalette {
    return colorPalette
  } else {
    let componentState = item.task.componentStates[item.componentID]!
    return ColorPaletteName.fromTimestamp(componentState.createdAtTimestampMillis).colorPalette
  }
}

struct OrbitHomeScreen: Widget {
  let kind: String = "OrbitHomeScreen"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: ConfigurationAppIntent.self, provider: Provider()) { entry in
      let colorPalette = colorPalette(for: entry.item)
      PromptView(item: entry.item, isShowingAnswer: entry.isShowingAnswer)
        .containerBackground(colorPalette.backgroundColor, for: .widget)
        .environment(\.colorPalette, colorPalette)
    }
    .supportedFamilies([.systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

#Preview(as: .systemMedium) {
  OrbitHomeScreen()
} timeline: {
  Entry(item: .placeholder, isShowingAnswer: false, date: .now)
  Entry(item: .clozePlaceholder, isShowingAnswer: false, date: .now)
  Entry(item: .clozePlaceholder, isShowingAnswer: true, date: .now)
}
