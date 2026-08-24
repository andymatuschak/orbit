import ExpoModulesCore
import Foundation
import GameController

private let onKeyDownEvent = "onKeyDown"

public final class OrbitHardwareKeyboardModule: Module {
  private var keyboardInput: GCKeyboardInput?
  private var connectionObserver: OrbitKeyboardConnectionObserver?

  public func definition() -> ModuleDefinition {
    Name("OrbitHardwareKeyboard")
    Events(onKeyDownEvent)

    OnStartObserving(onKeyDownEvent) {
      startObservingKeyboard()
    }

    OnStopObserving(onKeyDownEvent) {
      stopObservingKeyboard()
    }

    OnDestroy {
      stopObservingKeyboard()
    }
  }

  private func startObservingKeyboard() {
    guard connectionObserver == nil else {
      return
    }

    let observer = OrbitKeyboardConnectionObserver(module: self)
    connectionObserver = observer

    NotificationCenter.default.addObserver(
      observer,
      selector: #selector(OrbitKeyboardConnectionObserver.keyboardDidChange(_:)),
      name: .GCKeyboardDidConnect,
      object: nil
    )
    NotificationCenter.default.addObserver(
      observer,
      selector: #selector(OrbitKeyboardConnectionObserver.keyboardDidChange(_:)),
      name: .GCKeyboardDidDisconnect,
      object: nil
    )

    refreshKeyboard()
  }

  private func stopObservingKeyboard() {
    keyboardInput?.keyChangedHandler = nil
    keyboardInput = nil

    if let connectionObserver {
      NotificationCenter.default.removeObserver(connectionObserver)
      self.connectionObserver = nil
    }
  }

  fileprivate func refreshKeyboard() {
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

private final class OrbitKeyboardConnectionObserver: NSObject {
  private weak var module: OrbitHardwareKeyboardModule?

  init(module: OrbitHardwareKeyboardModule) {
    self.module = module
  }

  @objc func keyboardDidChange(_ notification: Notification) {
    module?.refreshKeyboard()
  }
}
