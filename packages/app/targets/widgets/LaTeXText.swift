//
//  LaTeXText.swift
//  OrbitHomeScreenExtension
//

import SwaTex
import SwaTexRender
import SwiftUI
import UIKit

// SwaTex's math alphabet has a lower x-height than Orbit's text face. A small
// optical correction keeps inline formulas from looking undersized.
private let widgetMathFontScale: CGFloat = 1.08

struct PromptLaTeXText: View {
  let text: String
  let fontSizingText: String
  let highlightedRanges: [ClozeTaskRange]
  let highlightColor: SwiftUI.Color
  @Environment(\.displayScale) private var displayScale

  init(
    text: String,
    fontSizingText: String? = nil,
    highlightedRanges: [ClozeTaskRange] = [],
    highlightColor: SwiftUI.Color = ink
  ) {
    self.text = text
    self.fontSizingText = fontSizingText ?? text
    self.highlightedRanges = highlightedRanges
    self.highlightColor = highlightColor
  }

  private var standaloneMath: LaTeXMathFragment? {
    var mathFragment: LaTeXMathFragment?
    for fragment in latexFragments(in: text) {
      switch fragment {
      case .text(let text):
        guard text.text.allSatisfy(\.isWhitespace) else { return nil }
      case .math(let math):
        guard mathFragment == nil else { return nil }
        mathFragment = math
      }
    }
    return mathFragment
  }

  private var fontStyle: OrbitFont.Type {
    switch fontSizingText.count {
    case 0 ... 70:
      OrbitPromptMedium.self
    default:
      OrbitPromptSmall.self
    }
  }

  var body: some View {
    let fontStyle = fontStyle

    if let standaloneMath {
      let formula = reflowedEqualityChain(in: standaloneMath.formula)
        ?? standaloneMath.formula
      let isHighlighted = intersectsHighlightedRange(
        standaloneMath.utf16Range,
        highlightedRanges: highlightedRanges
      )
      let foregroundColor = isHighlighted ? highlightColor : ink
      FittingMathView(
        formula: formula,
        fallback: standaloneMath.source,
        accessibilityText: standaloneMath.formula,
        preferredFontSize: fontStyle.fontSize * widgetMathFontScale,
        displayScale: displayScale,
        color: swaTexColor(foregroundColor)
      )
        .font(fontStyle.font)
        .kerning(fontStyle.kerning)
        .foregroundStyle(foregroundColor)
        .contentTransition(.opacity)
    } else {
      makeInlineLaTeXText(
        text,
        fontSize: fontStyle.fontSize * widgetMathFontScale,
        displayScale: displayScale,
        highlightedRanges: highlightedRanges,
        highlightColor: highlightColor
      )
        .modifier(PromptTextStyle(fontStyle: fontStyle))
        .accessibilityLabel(Text(latexAccessibilityText(in: text)))
    }
  }
}

private struct FittingMathView: View {
  let formula: String
  let fallback: String
  let accessibilityText: String
  let preferredFontSize: CGFloat
  let displayScale: CGFloat
  let color: SwaTex.Color

  private var fontSizes: [CGFloat] {
    let minimumFontSize: CGFloat = 8
    guard preferredFontSize > minimumFontSize else { return [preferredFontSize] }

    var sizes = [preferredFontSize]
    var nextSize = preferredFontSize - 2
    while nextSize > minimumFontSize {
      sizes.append(nextSize)
      nextSize -= 2
    }
    sizes.append(minimumFontSize)
    return sizes
  }

  var body: some View {
    Group {
      if let preferredImage = makeMathImage(
        formula,
        fontSize: preferredFontSize,
        display: true,
        displayScale: displayScale,
        color: color
      ) {
        ViewThatFits {
          Image(uiImage: preferredImage.image)
          ForEach(Array(fontSizes.dropFirst()), id: \.self) { fontSize in
            if let rendered = makeMathImage(
              formula,
              fontSize: fontSize,
              display: true,
              displayScale: displayScale,
              color: color
            ) {
              Image(uiImage: rendered.image)
            }
          }
          Text(fallback)
        }
      } else {
        Text(fallback)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityLabel(Text(accessibilityText))
  }
}

private struct LaTeXMathFragment {
  let formula: String
  let source: String
  let display: Bool
  let utf16Range: Range<Int>
}

private struct LaTeXTextFragment {
  let text: String
  let utf16Range: Range<Int>
}

private enum LaTeXFragment {
  case text(LaTeXTextFragment)
  case math(LaTeXMathFragment)
}

private func makeInlineLaTeXText(
  _ source: String,
  fontSize: CGFloat,
  displayScale: CGFloat,
  highlightedRanges: [ClozeTaskRange],
  highlightColor: SwiftUI.Color
) -> Text {
  latexFragments(in: source).reduce(Text("")) { output, fragment in
    switch fragment {
    case .text(let text):
      let fragment = makeHighlightedText(
        text,
        highlightedRanges: highlightedRanges,
        highlightColor: highlightColor
      )
      return Text("\(output)\(fragment)")
    case .math(let math):
      let isHighlighted = intersectsHighlightedRange(
        math.utf16Range,
        highlightedRanges: highlightedRanges
      )
      guard
        let attachment = makeMathAttachment(
          math.formula,
          fontSize: fontSize,
          display: math.display,
          displayScale: displayScale,
          color: swaTexColor(isHighlighted ? highlightColor : ink)
        )
      else {
        let fallback = isHighlighted
          ? Text(math.source).foregroundStyle(highlightColor)
          : Text(math.source)
        return Text("\(output)\(fallback)")
      }

      if math.display {
        return Text("\(output)\(Text("\n"))\(attachment)\(Text("\n"))")
      }
      return Text("\(output)\(attachment)")
    }
  }
}

private struct RenderedMathImage {
  let image: UIImage
  let descent: CGFloat
}

private func makeMathAttachment(
  _ formula: String,
  fontSize: CGFloat,
  display: Bool,
  displayScale: CGFloat,
  color: SwaTex.Color
) -> Text? {
  guard
    let rendered = makeMathImage(
      formula,
      fontSize: fontSize,
      display: display,
      displayScale: displayScale,
      color: color
    )
  else {
    return nil
  }

  return Text(Image(uiImage: rendered.image)).baselineOffset(-rendered.descent)
}

// WidgetKit archives the view hierarchy into a timeline snapshot. Rendering
// SwaTex's display list up front keeps the result available after that archive,
// while Text image attachments preserve native wrapping and baseline alignment.
private func makeMathImage(
  _ formula: String,
  fontSize: CGFloat,
  display: Bool,
  displayScale: CGFloat,
  color: SwaTex.Color
) -> RenderedMathImage? {
  let style: MathStyle = display ? .display : .text
  guard
    let displayList = try? SwaTexEngine.displayList(
      for: formula,
      style: style,
      color: color,
      cache: .shared
    )
  else {
    return nil
  }

  let options = RenderOptions(fontSize: fontSize, padding: 0)
  let metrics = DisplayListRenderer.metrics(for: displayList, options: options)
  guard
    let image = SwaTexRender.ImageRenderer.image(
      for: displayList,
      options: options,
      displayScale: displayScale
    )
  else {
    return nil
  }

  let uiImage = UIImage(cgImage: image, scale: displayScale, orientation: .up)
  let descent = metrics.height - metrics.baseline
  return RenderedMathImage(image: uiImage, descent: descent)
}

private func latexFragments(in source: String) -> [LaTeXFragment] {
  var fragments: [LaTeXFragment] = []
  var textStart = source.startIndex
  var cursor = source.startIndex

  func appendText(through end: String.Index) {
    guard textStart < end else { return }
    fragments.append(
      .text(
        LaTeXTextFragment(
          text: String(source[textStart ..< end]),
          utf16Range: utf16Range(textStart ..< end, in: source)
        )
      )
    )
  }

  while cursor < source.endIndex {
    guard !isEscaped(cursor, in: source) else {
      cursor = source.index(after: cursor)
      continue
    }

    let remainder = source[cursor...]
    let delimiter: (open: String, close: String, display: Bool)?
    if remainder.hasPrefix("$$"), isValidDollarOpening(at: cursor, in: source) {
      delimiter = ("$$", "$$", true)
    } else if remainder.hasPrefix("$"), isValidDollarOpening(at: cursor, in: source) {
      delimiter = ("$", "$", false)
    } else if remainder.hasPrefix(#"\("#) {
      delimiter = (#"\("#, #"\)"#, false)
    } else if remainder.hasPrefix(#"\["#) {
      delimiter = (#"\["#, #"\]"#, true)
    } else {
      delimiter = nil
    }

    guard let delimiter else {
      cursor = source.index(after: cursor)
      continue
    }

    let bodyStart = source.index(cursor, offsetBy: delimiter.open.count)
    guard
      let closeStart = findClosingDelimiter(
        delimiter,
        in: source,
        from: bodyStart
      )
    else {
      cursor = bodyStart
      continue
    }

    appendText(through: cursor)
    let delimiterEnd = source.index(closeStart, offsetBy: delimiter.close.count)
    fragments.append(
      .math(
        LaTeXMathFragment(
          formula: String(source[bodyStart ..< closeStart]),
          source: String(source[cursor ..< delimiterEnd]),
          display: delimiter.display,
          utf16Range: utf16Range(cursor ..< delimiterEnd, in: source)
        )
      )
    )
    cursor = delimiterEnd
    textStart = cursor
  }

  appendText(through: source.endIndex)
  return fragments
}

private func findClosingDelimiter(
  _ delimiter: (open: String, close: String, display: Bool),
  in source: String,
  from start: String.Index
) -> String.Index? {
  var cursor = start
  while cursor < source.endIndex {
    let remainder = source[cursor...]
    if remainder.hasPrefix(delimiter.close), !isEscaped(cursor, in: source) {
      if delimiter.open.hasPrefix("$") {
        let body = source[start ..< cursor]
        if isValidDollarBody(body, display: delimiter.display) {
          let delimiterEnd = source.index(cursor, offsetBy: delimiter.close.count)
          guard isValidDollarClosing(at: delimiterEnd, in: source) else { return nil }
          return cursor
        }
      } else {
        return cursor
      }
    }
    cursor = source.index(after: cursor)
  }
  return nil
}

private func isValidDollarOpening(at index: String.Index, in source: String) -> Bool {
  guard !isEscaped(index, in: source) else { return false }
  guard index > source.startIndex else { return true }
  return !isASCIIDigit(source[source.index(before: index)])
}

private func isValidDollarClosing(at delimiterEnd: String.Index, in source: String) -> Bool {
  guard delimiterEnd < source.endIndex else { return true }
  return !isASCIIDigit(source[delimiterEnd])
}

private func isValidDollarBody(_ body: Substring, display: Bool) -> Bool {
  guard let first = body.first, let last = body.last, last != "\\" else { return false }
  if display { return !body.contains("$") }
  return !first.isWhitespace && !last.isWhitespace
}

private func isASCIIDigit(_ character: Character) -> Bool {
  character >= "0" && character <= "9"
}

private func isEscaped(_ index: String.Index, in source: String) -> Bool {
  var cursor = index
  var backslashCount = 0
  while cursor > source.startIndex {
    let previous = source.index(before: cursor)
    guard source[previous] == "\\" else { break }
    backslashCount += 1
    cursor = previous
  }
  return !backslashCount.isMultiple(of: 2)
}

private func unescapeLaTeXText(_ text: String) -> String {
  text
    .replacingOccurrences(of: #"\$"#, with: "$", options: .literal)
    .replacingOccurrences(of: #"\_"#, with: "_", options: .literal)
}

private func utf16Range(
  _ range: Range<String.Index>,
  in source: String
) -> Range<Int> {
  let lowerBound = source[..<range.lowerBound].utf16.count
  let length = source[range].utf16.count
  return lowerBound ..< lowerBound + length
}

private func intersectsHighlightedRange(
  _ range: Range<Int>,
  highlightedRanges: [ClozeTaskRange]
) -> Bool {
  !clippedHighlightedRanges(in: range, highlightedRanges: highlightedRanges).isEmpty
}

private func clippedHighlightedRanges(
  in range: Range<Int>,
  highlightedRanges: [ClozeTaskRange]
) -> [Range<Int>] {
  let clipped = highlightedRanges.compactMap { highlightedRange -> Range<Int>? in
    guard highlightedRange.startIndex >= 0, highlightedRange.length > 0 else {
      return nil
    }
    let (upperBound, overflow) = highlightedRange.startIndex.addingReportingOverflow(
      highlightedRange.length
    )
    guard !overflow else { return nil }

    let lowerBound = max(range.lowerBound, highlightedRange.startIndex)
    let clippedUpperBound = min(range.upperBound, upperBound)
    guard lowerBound < clippedUpperBound else { return nil }
    return lowerBound ..< clippedUpperBound
  }.sorted { $0.lowerBound < $1.lowerBound }

  return clipped.reduce(into: []) { merged, range in
    guard let last = merged.last, last.upperBound >= range.lowerBound else {
      merged.append(range)
      return
    }
    merged[merged.count - 1] = last.lowerBound ..< max(last.upperBound, range.upperBound)
  }
}

private func makeHighlightedText(
  _ fragment: LaTeXTextFragment,
  highlightedRanges: [ClozeTaskRange],
  highlightColor: SwiftUI.Color
) -> Text {
  let ranges = clippedHighlightedRanges(
    in: fragment.utf16Range,
    highlightedRanges: highlightedRanges
  )
  guard !ranges.isEmpty else { return Text(unescapeLaTeXText(fragment.text)) }

  var output = Text("")
  var cursor = fragment.utf16Range.lowerBound
  for range in ranges {
    output = Text(
      "\(output)\(Text(unescapeLaTeXText(substring(fragment, from: cursor, to: range.lowerBound))))"
    )
    let highlightedText = Text(
      unescapeLaTeXText(substring(fragment, from: range.lowerBound, to: range.upperBound))
    )
      .foregroundStyle(highlightColor)
    output = Text("\(output)\(highlightedText)")
    cursor = range.upperBound
  }
  let trailingText = substring(
    fragment,
    from: cursor,
    to: fragment.utf16Range.upperBound
  )
  return Text("\(output)\(Text(unescapeLaTeXText(trailingText)))")
}

private func substring(
  _ fragment: LaTeXTextFragment,
  from absoluteLowerBound: Int,
  to absoluteUpperBound: Int
) -> String {
  let lowerOffset = absoluteLowerBound - fragment.utf16Range.lowerBound
  let upperOffset = absoluteUpperBound - fragment.utf16Range.lowerBound
  let utf16 = fragment.text.utf16
  guard
    let lowerUTF16Index = utf16.index(
      utf16.startIndex,
      offsetBy: lowerOffset,
      limitedBy: utf16.endIndex
    ),
    let upperUTF16Index = utf16.index(
      utf16.startIndex,
      offsetBy: upperOffset,
      limitedBy: utf16.endIndex
    ),
    let lowerIndex = String.Index(lowerUTF16Index, within: fragment.text),
    let upperIndex = String.Index(upperUTF16Index, within: fragment.text)
  else {
    return ""
  }
  return String(fragment.text[lowerIndex ..< upperIndex])
}

private func swaTexColor(_ color: SwiftUI.Color) -> SwaTex.Color {
  let uiColor = UIColor(color)
  var red: CGFloat = 0
  var green: CGFloat = 0
  var blue: CGFloat = 0
  var alpha: CGFloat = 0
  guard uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
    return SwaTex.Color(r: 0, g: 0, b: 0, a: 0.8)
  }
  return SwaTex.Color(
    r: Float(red),
    g: Float(green),
    b: Float(blue),
    a: Float(alpha)
  )
}

private func latexAccessibilityText(in source: String) -> String {
  latexFragments(in: source).map { fragment in
    switch fragment {
    case .text(let text): unescapeLaTeXText(text.text)
    case .math(let math): math.formula
    }
  }.joined()
}

// Long equality chains otherwise shrink to an unreadable single line. Reflow
// only top-level equals signs so nested matrices and environments stay intact.
private func reflowedEqualityChain(in formula: String) -> String? {
  guard formula.count > 240 else { return nil }

  var terms: [String] = []
  var termStart = formula.startIndex
  var braceDepth = 0
  var bracketDepth = 0
  var environmentDepth = 0
  var consecutiveBackslashes = 0

  for index in formula.indices {
    let character = formula[index]
    let isEscaped = !consecutiveBackslashes.isMultiple(of: 2)

    if !isEscaped {
      let remainder = formula[index...]
      if remainder.hasPrefix(#"\begin{"#) {
        environmentDepth += 1
      } else if remainder.hasPrefix(#"\end{"#) {
        environmentDepth = max(0, environmentDepth - 1)
      }

      switch character {
      case "{": braceDepth += 1
      case "}": braceDepth = max(0, braceDepth - 1)
      case "[": bracketDepth += 1
      case "]": bracketDepth = max(0, bracketDepth - 1)
      case "=" where braceDepth == 0 && bracketDepth == 0 && environmentDepth == 0:
        terms.append(
          formula[termStart ..< index]
            .trimmingCharacters(in: .whitespacesAndNewlines)
        )
        termStart = formula.index(after: index)
      default: break
      }
    }

    consecutiveBackslashes = character == "\\" ? consecutiveBackslashes + 1 : 0
  }

  terms.append(
    formula[termStart...]
      .trimmingCharacters(in: .whitespacesAndNewlines)
  )
  guard terms.count > 2, terms.allSatisfy({ !$0.isEmpty }) else { return nil }

  var rows = [terms[0] + " &= " + terms[1]]
  rows.append(contentsOf: terms.dropFirst(2).map { "&= " + $0 })
  return #"\begin{aligned} "#
    + rows.joined(separator: #" \\ "#)
    + #" \end{aligned}"#
}

func buildLaTeXClozeText(
  text: String,
  ranges: [ClozeTaskRange],
  isShowingAnswer: Bool
) -> String {
  guard !isShowingAnswer else { return text }

  // Escaped underscores render as ordinary underscores in Markdown text and
  // as valid symbols inside TeX, so a cloze can safely cross math delimiters.
  let blank = #"\_\_\_\_\_\_"#
  var output = text
  let validRanges = clippedHighlightedRanges(
    in: 0 ..< text.utf16.count,
    highlightedRanges: ranges
  )
  for range in validRanges.reversed() {
    let utf16 = output.utf16
    guard
      let lowerUTF16Index = utf16.index(
        utf16.startIndex,
        offsetBy: range.lowerBound,
        limitedBy: utf16.endIndex
      ),
      let upperUTF16Index = utf16.index(
        utf16.startIndex,
        offsetBy: range.upperBound,
        limitedBy: utf16.endIndex
      ),
      let lowerIndex = String.Index(lowerUTF16Index, within: output),
      let upperIndex = String.Index(upperUTF16Index, within: output)
    else {
      continue
    }

    output.replaceSubrange(lowerIndex ..< upperIndex, with: blank)
  }
  return output
}

func containsLaTeX(_ text: String) -> Bool {
  latexFragments(in: text).contains { fragment in
    if case .math = fragment { return true }
    return false
  }
}
