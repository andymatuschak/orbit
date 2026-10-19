import AppKit
import Vision

guard
  (2 ... 3).contains(CommandLine.arguments.count),
  let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fatalError("Usage: widget_ui_smoke_ocr.swift <screenshot.png> [--widget-fast-cpu]")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
if CommandLine.arguments.count == 3 {
  precondition(CommandLine.arguments[2] == "--widget-fast-cpu")
  // The accurate GPU-backed path can stall on development Macs. This bounded
  // Home Screen gate needs only the medium widget at the top, in English.
  request.recognitionLevel = .fast
  request.recognitionLanguages = ["en-US"]
  request.usesLanguageCorrection = false
  request.usesCPUOnly = true
  request.regionOfInterest = CGRect(x: 0, y: 0.55, width: 1, height: 0.4)
}
try VNImageRequestHandler(cgImage: cgImage).perform([request])
let text = (request.results ?? [])
  .compactMap { $0.topCandidates(1).first?.string }
  .joined(separator: "\n")
print(text)
