//
//  Fonts.swift
//  OrbitHomeScreenExtension
//
//  Created by Andy Matuschak on 2023-12-29.
//

import Foundation
import SwiftUI

protocol OrbitFont {
  static var font: Font { get }
  static var fontSize: CGFloat { get }
  static var lineHeight: CGFloat { get }
  static var kerning: CGFloat { get }
}

extension OrbitFont {
  static var paragraphStyle: NSParagraphStyle {
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.maximumLineHeight = lineHeight
    paragraphStyle.minimumLineHeight = lineHeight
    return paragraphStyle
  }
}

struct OrbitPromptSmall: OrbitFont {
  static let font = Font.custom("Dr", fixedSize: fontSize).weight(fontWeight)
  static let fontSize: CGFloat = 18
  static let fontWeight: Font.Weight = .medium
  static let lineHeight: CGFloat = 20.0
  static let kerning: CGFloat = 18 * 0.02
}

struct OrbitPromptMedium: OrbitFont {
  static let font = Font.custom("Dr", fixedSize: fontSize).weight(fontWeight)
  static let fontSize: CGFloat = 24
  static let fontWeight: Font.Weight = .medium
  static let lineHeight: CGFloat = 24.0
  static let kerning: CGFloat = 24 * 0.01
}

struct OrbitLabelSmall: OrbitFont {
  static let font = Font.custom("Dr", fixedSize: fontSize).weight(fontWeight)
  static let fontSize: CGFloat = 16
  static let fontWeight: Font.Weight = .heavy
  static let lineHeight: CGFloat = 20
  static let kerning: CGFloat = 17 * 0.02
}


struct OrbitLabelTiny: OrbitFont {
  static let font = Font.custom("Dr", fixedSize: fontSize).weight(fontWeight)
  static let fontSize: CGFloat = 12
  static let fontWeight: Font.Weight = .black
  static let lineHeight: CGFloat = 16.0
  static let kerning: CGFloat = 13 * 0.02
}
