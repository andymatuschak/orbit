// Adapted from https://codesandbox.io/s/o9q8vy70l5?file=/src/HoverState.js:0-1159

import React from "react";

let _isEnabled = false;
let _hasInitializedHoverState = false;
let _lastTouchTimestamp = 0;

/**
 * Web browsers emulate mouse events (and hover states) after touch events.
 * This code infers when the currently-in-use modality supports hover
 * (including for multi-modality devices) and considers "hover" to be enabled
 * if a mouse movement occurs more than 1 second after the last touch event.
 * This threshold is long enough to account for longer delays between the
 * browser firing touch and mouse events on low-powered devices.
 */
const HOVER_THRESHOLD_MS = 1000;

function enableHover() {
  if (_isEnabled || Date.now() - _lastTouchTimestamp < HOVER_THRESHOLD_MS) {
    return;
  }
  _isEnabled = true;
}

function disableHover() {
  _lastTouchTimestamp = Date.now();
  if (_isEnabled) {
    _isEnabled = false;
  }
}

function _initializeHoverStateIfNeeded() {
  if (!_hasInitializedHoverState) {
    _hasInitializedHoverState = true;
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("touchstart", disableHover, true);
      document.addEventListener("touchmove", disableHover, true);
      document.addEventListener("mousemove", enableHover, true);
    }
  }
}

export function isHoverEnabled(): boolean {
  _initializeHoverStateIfNeeded();
  return _isEnabled;
}

export interface HoverableProps {
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  children: (isHovered: boolean) => JSX.Element;
}

export default function Hoverable({
  onHoverIn,
  onHoverOut,
  children,
}: HoverableProps) {
  const [isHovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    _initializeHoverStateIfNeeded();
  }, []);

  const handleMouseEnter = React.useCallback(() => {
    if (isHoverEnabled()) {
      setHovered((wasHovered) => {
        if (wasHovered) {
          return wasHovered;
        } else {
          if (onHoverIn) onHoverIn();
          return true;
        }
      });
    }
  }, [onHoverIn]);

  const handleMouseLeave = React.useCallback(() => {
    if (isHoverEnabled()) {
      setHovered((wasHovered) => {
        if (wasHovered) {
          if (onHoverOut) onHoverOut();
          return false;
        } else {
          return wasHovered;
        }
      });
    }
  }, [onHoverOut]);

  return React.cloneElement(children(isHovered), {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  });
}
