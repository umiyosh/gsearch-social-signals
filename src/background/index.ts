import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import { fetchHackerNewsSummaries } from "../shared/hackerNews"
import { registerMessageHandler } from "../infra/chrome/messageRouter"
import { createMessageHandler } from "./handlers"

registerMessageHandler(
  createMessageHandler({
    fetchHatenaCounts,
    fetchHatenaEntry,
    fetchHackerNewsSummaries,
    hnCache: new Map()
  })
)

export {}
