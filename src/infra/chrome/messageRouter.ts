import { err } from "../../shared/messages"

export type MessageHandler = (message: unknown) => Promise<unknown> | null

// MV3 の onMessage は、sendResponse を非同期に呼ぶ場合 listener が true を
// 返してチャネルを維持する必要がある。その約束事をここに閉じ込め、
// ハンドラ側は「Promise を返すか、対象外なら null を返す」だけにする。
export function registerMessageHandler(handle: MessageHandler): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const pending = handle(message)
    if (!pending) {
      return false
    }

    pending
      .then((response) => sendResponse(response))
      .catch((error: unknown) => sendResponse(err(error)))
    return true
  })
}
