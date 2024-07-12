//
//  ORWidgetReloadBridge.swift
//  Orbit
//
//  Created by Andy Matuschak on 2024-07-12.
//

import Foundation
import WidgetKit

@objc(WidgetReloadBridge) class WidgetReloadBridge: NSObject {
  @objc public func reloadTimelines() {
    WidgetCenter.shared.reloadAllTimelines()
    print("Reloading timelines")
  }
}
