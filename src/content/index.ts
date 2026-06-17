import { discoverSearchResults } from "./searchResults"
import { ensureStyles } from "./styles"
import { insertBadge, insertHnBadge } from "./badges"
import { requestEntryBookmarks, requestHatenaCounts, requestHnSummaries } from "./messaging"
import {
  beginOverlaySession,
  cancelOverlayHide,
  presentOverlay,
  scheduleOverlayHide
} from "./overlay"
import { createSignalPipeline } from "./signals"

const queueTargets = createSignalPipeline({
  requestHatenaCounts,
  requestHnSummaries,
  requestEntryBookmarks,
  insertBadge,
  insertHnBadge,
  beginOverlaySession,
  presentOverlay,
  scheduleOverlayHide,
  cancelOverlayHide
})

export function scan(root: ParentNode = document): void {
  const targets = discoverSearchResults(root)
  if (targets.length) {
    queueTargets(targets)
  }
}

export function observeSearchResults(
  root: HTMLElement | null = document.body,
  scanner: (root: ParentNode) => void = scan
): MutationObserver | null {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scanner(node)
        }
      })
    }
  })

  if (!root) {
    return null
  }

  observer.observe(root, { childList: true, subtree: true })
  return observer
}

export function boot(): MutationObserver | null {
  ensureStyles()
  scan(document)
  return observeSearchResults()
}

export const autoObserver = boot()
