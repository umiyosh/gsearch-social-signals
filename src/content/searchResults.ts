import { DATA_ATTR, extractExternalUrlFromHref } from "../shared/url"

export interface SearchResultTarget {
  container: HTMLElement
  anchor: HTMLAnchorElement
  url: string
}

const RESULT_CONTAINER_SELECTOR = [
  "div.g",
  "div.MjjYud",
  "div[data-sokoban-grid]",
  'div[jscontroller="SC7lYd"]',
  'div[jscontroller="TFQHme"]'
].join(", ")

function findPrimaryAnchor(
  container: HTMLElement
): { anchor: HTMLAnchorElement; url: string } | null {
  const anchors = container.querySelectorAll<HTMLAnchorElement>("a[href]")
  for (const anchor of anchors) {
    const resolvedUrl = extractExternalUrlFromHref(anchor.href)
    if (resolvedUrl) {
      return { anchor, url: resolvedUrl }
    }
  }
  return null
}

export function discoverSearchResults(root: ParentNode): SearchResultTarget[] {
  const containers = root.querySelectorAll<HTMLElement>(RESULT_CONTAINER_SELECTOR)
  const targets: SearchResultTarget[] = []

  containers.forEach((container) => {
    if (container.getAttribute(DATA_ATTR)) {
      return
    }

    const candidate = findPrimaryAnchor(container)
    if (!candidate) {
      return
    }

    container.setAttribute(DATA_ATTR, "pending")
    targets.push({ container, anchor: candidate.anchor, url: candidate.url })
  })

  return targets
}
