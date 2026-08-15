import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import { fetchHackerNewsSummaries } from "../shared/hackerNews"
import { fetchBlueskySummaries } from "../shared/bluesky"
import { registerMessageHandler } from "../infra/chrome/messageRouter"
import { createMessageHandler } from "./handlers"

registerMessageHandler(
  createMessageHandler({
    fetchHatenaCounts,
    fetchHatenaEntry,
    fetchHackerNewsSummaries,
    hnCache: new Map(),
    fetchBlueskySummaries,
    blueskyCache: new Map()
  })
)

export {}
