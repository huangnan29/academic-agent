import Foundation
import Speech
import AVFAudio

private let outputLock = NSLock()

private func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          var line = String(data: data, encoding: .utf8) else { return }
    line.append("\n")
    outputLock.lock()
    FileHandle.standardOutput.write(Data(line.utf8))
    outputLock.unlock()
}

private func authorizationName(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    @unknown default: return "unknown"
    }
}

private func recognizerStatus(localeIdentifier: String) -> [String: Any] {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
        return [
            "type": "status",
            "available": false,
            "authorization": "unsupported",
            "locale": localeIdentifier,
            "onDevice": false,
            "message": "当前 macOS 不支持所选语音识别语言。",
        ]
    }
    let onDevice: Bool
    if #available(macOS 10.15, *) {
        onDevice = recognizer.supportsOnDeviceRecognition
    } else {
        onDevice = false
    }
    return [
        "type": "status",
        "available": recognizer.isAvailable || onDevice,
        "authorization": authorizationName(SFSpeechRecognizer.authorizationStatus()),
        "locale": localeIdentifier,
        "onDevice": onDevice,
    ]
}

final class SpeechSession {
    private let localeIdentifier: String
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var stopped = false

    init(localeIdentifier: String) {
        self.localeIdentifier = localeIdentifier
    }

    func requestAuthorizationAndStart() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                guard status == .authorized else {
                    self.fail(
                        code: authorizationName(status),
                        message: "macOS 尚未允许学术 Agent 使用语音识别。"
                    )
                    return
                }
                self.start()
            }
        }
    }

    private func start() {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
            fail(code: "unsupported-locale", message: "当前 macOS 不支持简体中文语音识别。")
            return
        }
        let useOnDevice: Bool
        if #available(macOS 10.15, *) {
            useOnDevice = recognizer.supportsOnDeviceRecognition
        } else {
            useOnDevice = false
        }
        guard recognizer.isAvailable || useOnDevice else {
            fail(code: "service-unavailable", message: "macOS 语音识别服务当前不可用。")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if #available(macOS 10.15, *), useOnDevice {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            fail(code: "audio-input-unavailable", message: "没有检测到可用的麦克风输入。")
            return
        }
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
            request.append(buffer)
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self, !self.stopped else { return }
            if let result {
                emit([
                    "type": "result",
                    "transcript": result.bestTranscription.formattedString,
                    "final": result.isFinal,
                ])
                if result.isFinal {
                    self.stop()
                    return
                }
            }
            if let error {
                self.fail(code: "recognition-failed", message: error.localizedDescription)
            }
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
            emit(["type": "ready", "onDevice": useOnDevice])
        } catch {
            fail(code: "audio-start-failed", message: "无法启动麦克风：\(error.localizedDescription)")
        }
    }

    func stop() {
        guard !stopped else { return }
        stopped = true
        if audioEngine.isRunning { audioEngine.stop() }
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        emit(["type": "ended"])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { exit(0) }
    }

    private func fail(code: String, message: String) {
        guard !stopped else { return }
        emit(["type": "error", "code": code, "message": message])
        stop()
    }
}

let arguments = CommandLine.arguments
let localeIndex = arguments.firstIndex(of: "--locale")
let locale = localeIndex.flatMap { index in
    arguments.indices.contains(index + 1) ? arguments[index + 1] : nil
} ?? "zh-CN"

if arguments.contains("--status") {
    emit(recognizerStatus(localeIdentifier: locale))
    exit(0)
}

let session = SpeechSession(localeIdentifier: locale)
DispatchQueue.global(qos: .userInitiated).async {
    while let command = readLine() {
        if command.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" {
            DispatchQueue.main.async { session.stop() }
            return
        }
    }
}
session.requestAuthorizationAndStart()
RunLoop.main.run()
