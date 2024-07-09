//
//  Colors.swift
//  OrbitHomeScreenExtension
//
//  Created by Andy Matuschak on 2023-12-29.
//

import Foundation
import SwiftUI

enum ColorPaletteName: String {
  case red
  case orange
  case brown
  case yellow
  case lime
  case green
  case turquoise
  case cyan
  case blue
  case violet
  case purple
  case pink
}

let ink = Color(white: 0, opacity: 0.8)

struct ColorPalette {
  let backgroundColor: Color
  let accentColor: Color
  let secondaryAccentColor: Color
  let secondaryBackgroundColor: Color
  let secondaryTextColor: Color
}

extension ColorPalette {
  static let red = ColorPalette(
    backgroundColor: Color(hex: "#ff5252")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#ff7e05")!,
    secondaryBackgroundColor: Color(hex: "#f73b3b")!,
    secondaryTextColor: Color(hex: "#ad0000")!
  )

  static let orange = ColorPalette(
    backgroundColor: Color(hex: "#fa863d")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#fb372d")!,
    secondaryBackgroundColor: Color(hex: "#f4742f")!,
    secondaryTextColor: Color(hex: "#c74200")!
  )

  static let brown = ColorPalette(
    backgroundColor: Color(hex: "#e0a642")!,
    accentColor: Color(hex: "#ffdd1a")!,
    secondaryAccentColor: Color(hex: "#ff7105")!,
    secondaryBackgroundColor: Color(hex: "#da962b")!,
    secondaryTextColor: Color(hex: "#a46b0e")!
  )

  static let yellow = ColorPalette(
    backgroundColor: Color(hex: "#fac800")!,
    accentColor: Color(hex: "#f77102")!,
    secondaryAccentColor: Color(hex: "#f64441")!,
    secondaryBackgroundColor: Color(hex: "#f9bb01")!,
    secondaryTextColor: Color(hex: "#cc8500")!
  )

  static let lime = ColorPalette(
    backgroundColor: Color(hex: "#8fd43a")!,
    accentColor: Color(hex: "#f6f613")!,
    secondaryAccentColor: Color(hex: "#01c171")!,
    secondaryBackgroundColor: Color(hex: "#7dcb25")!,
    secondaryTextColor: Color(hex: "#549509")!
  )

  static let green = ColorPalette(
    backgroundColor: Color(hex: "#63d463")!,
    accentColor: Color(hex: "#f9e406")!,
    secondaryAccentColor: Color(hex: "#03bcdd")!,
    secondaryBackgroundColor: Color(hex: "#48cb51")!,
    secondaryTextColor: Color(hex: "#2b9732")!
  )

  static let turquoise = ColorPalette(
    backgroundColor: Color(hex: "#52dada")!,
    accentColor: Color(hex: "#e8ec09")!,
    secondaryAccentColor: Color(hex: "#0199fe")!,
    secondaryBackgroundColor: Color(hex: "#1cced4")!,
    secondaryTextColor: Color(hex: "#04959a")!
  )

  static let cyan = ColorPalette(
    backgroundColor: Color(hex: "#65c6f6")!,
    accentColor: Color(hex: "#c6f312")!,
    secondaryAccentColor: Color(hex: "#4defd4")!,
    secondaryBackgroundColor: Color(hex: "#50bbf1")!,
    secondaryTextColor: Color(hex: "#0B84C1")!
  )

  static let blue = ColorPalette(
    backgroundColor: Color(hex: "#72aef8")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#15d5c9")!,
    secondaryBackgroundColor: Color(hex: "#60a1f0")!,
    secondaryTextColor: Color(hex: "#1d78e7")!
  )

  static let violet = ColorPalette(
    backgroundColor: Color(hex: "#ad89fb")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#a82efa")!,
    secondaryBackgroundColor: Color(hex: "#a47ef7")!,
    secondaryTextColor: Color(hex: "#6b39d5")!
  )

  static let purple = ColorPalette(
    backgroundColor: Color(hex: "#d071ef")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#df16b7")!,
    secondaryBackgroundColor: Color(hex: "#c95eed")!,
    secondaryTextColor: Color(hex: "#8714ad")!
  )

  static let pink = ColorPalette(
    backgroundColor: Color(hex: "#f56bb5")!,
    accentColor: Color(hex: "#ffcb2e")!,
    secondaryAccentColor: Color(hex: "#c337e6")!,
    secondaryBackgroundColor: Color(hex: "#ec5fa8")!,
    secondaryTextColor: Color(hex: "#b7107d")!
  )
}

extension ColorPaletteName {
  var colorPalette: ColorPalette {
    switch self {
    case .red: return .red
    case .orange: return .orange
    case .yellow: return .yellow
    case .brown: return .brown
    case .lime: return .lime
    case .green: return .green
    case .turquoise: return .turquoise
    case .cyan: return .cyan
    case .blue: return .blue
    case .violet: return .violet
    case .purple: return .purple
    case .pink: return .pink
    }
  }
}

extension ColorPaletteName {
  init(decoding name: String) throws {
    if let value = ColorPaletteName(rawValue: name) {
      self = value
    } else {
      throw DecodeError.invalidValue(value: name)
    }
  }
}

extension Color {
  init?(hex: String) {
    var cleanedHexString = hex.uppercased()

    // Remove the '#' prefix if it exists
    if cleanedHexString.hasPrefix("#") {
      cleanedHexString.remove(at: cleanedHexString.startIndex)
    }

    // Check that the cleaned string is a valid hex color code
    guard cleanedHexString.count == 6 else { return nil }
    guard cleanedHexString.range(of: "^[0-9A-F]{6}$", options: .regularExpression) != nil else { return nil }

    // Extract RGB components
    var rgbValue: UInt64 = 0
    Scanner(string: cleanedHexString).scanHexInt64(&rgbValue)

    let red = Double((rgbValue & 0xFF0000) >> 16) / 255.0
    let green = Double((rgbValue & 0x00FF00) >> 8) / 255.0
    let blue = Double(rgbValue & 0x0000FF) / 255.0

    self.init(red: red, green: green, blue: blue)
  }
}

extension ColorPaletteName: CaseIterable {
  static func fromTimestamp(_ timestampMillis: TimeInterval) -> ColorPaletteName {
    // Dupe of ReviewSession.tsx:getColorPaletteForReviewItem
    return ColorPaletteName.allCases[Int(timestampMillis.rounded(.down)) % ColorPaletteName.allCases.count]
  }
}
