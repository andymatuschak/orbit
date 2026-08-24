import ExpoModulesCore
import Foundation
import GameController

private let onKeyDownEvent = "onKeyDown"

@MainActor
public final class OrbitHardwareKeyboardModule: Module, @unchecked Sendable {
  private var keyboardInput: GCKeyboardInput?
  private var connectionObservers: [NotificationCenter.ObservationToken] = []

  nonisolated public func definition() -> ModuleDefinition {
    Name("OrbitHardwareKeyboard")
    Events(onKeyDownEvent)

    OnStartObserving(onKeyDownEvent) {
      Task { @MainActor [weak self] in
        self?.startObservingKeyboard()
      }
    }

    OnStopObserving(onKeyDownEvent) {
      Task { @MainActor [weak self] in
        self?.stopObservingKeyboard()
      }
    }

    OnDestroy {
      Task { @MainActor [self] in
        stopObservingKeyboard()
      }
    }
  }

  private func startObservingKeyboard() {
    guard connectionObservers.isEmpty else {
      return
    }

    let center = NotificationCenter.default
    connectionObservers = [
      center.addObserver(of: GCKeyboard.self, for: .didConnect) {
        [weak self] _ in self?.refreshKeyboard()
      },
      center.addObserver(of: GCKeyboard.self, for: .didDisconnect) {
        [weak self] _ in self?.refreshKeyboard()
      },
    ]

    refreshKeyboard()
  }

  private func stopObservingKeyboard() {
    keyboardInput?.keyChangedHandler = nil
    keyboardInput = nil

    let center = NotificationCenter.default
    for observer in connectionObservers {
      center.removeObserver(observer)
    }
    connectionObservers.removeAll()
  }

  private func refreshKeyboard() {
    keyboardInput?.keyChangedHandler = nil
    keyboardInput = GCKeyboard.coalesced?.keyboardInput

    keyboardInput?.keyChangedHandler = {
      [weak self] keyboard, _, keyCode, pressed in
      guard
        pressed,
        let self,
        let key = self.key(for: keyCode, keyboard: keyboard)
      else {
        return
      }

      self.sendEvent(onKeyDownEvent, [
        "key": key,
        "repeat": false,
      ])
    }
  }

  private func key(
    for keyCode: GCKeyCode,
    keyboard: GCKeyboardInput
  ) -> String? {
    let systemModifiers: [GCKeyCode] = [
      .leftControl, .rightControl,
      .leftAlt, .rightAlt,
      .leftGUI, .rightGUI,
    ]

    guard !systemModifiers.contains(where: {
      keyboard.button(forKeyCode: $0)?.isPressed == true
    }) else {
      return nil
    }

    switch keyCode {
    case .spacebar:
      return " "
    case .one, .keypad1:
      return isShiftPressed(on: keyboard) ? nil : "1"
    case .two, .keypad2:
      return isShiftPressed(on: keyboard) ? nil : "2"
    default:
      return nil
    }
  }

  private func isShiftPressed(on keyboard: GCKeyboardInput) -> Bool {
    keyboard.button(forKeyCode: .leftShift)?.isPressed == true ||
      keyboard.button(forKeyCode: .rightShift)?.isPressed == true
  }
}
