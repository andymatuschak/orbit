import AppKit
import Vision

guard
  CommandLine.arguments.count == 2,
  let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fatalError("Usage: widget_ui_smoke_ocr.swift <screenshot.png>")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
try VNImageRequestHandler(cgImage: cgImage).perform([request])
let text = (request.results ?? [])
  .compactMap { $0.topCandidates(1).first?.string }
  .joined(separator: "\n")
print(text)
