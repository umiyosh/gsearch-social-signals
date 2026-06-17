import { DATA_ATTR, extractExternalUrlFromHref } from "../shared/url"

export interface SearchResultTarget {
  container: HTMLElement
  anchor: HTMLAnchorElement
  url: string
}

export const MAX_SERP_TARGETS_PER_SCAN = 40

const RESULT_CONTAINER_SELECTOR = [
  "div.g",
  "div.MjjYud",
  "div[data-sokoban-grid]",
  'div[jscontroller="SC7lYd"]',
  'div[jscontroller="TFQHme"]'
].join(", ")

const EXCLUDED_SERP_SURFACE_SELECTOR = [
  "[data-text-ad]",
  '[aria-label="Ads"]',
  '[aria-label="広告"]',
  '[aria-label="Sponsored"]',
  '[aria-label="スポンサー"]',
  '[data-attrid*="AI Overview"]',
  '[data-attrid*="SGE"]',
  '[data-attrid*="People also ask"]',
  '[data-initq*="people_also_ask"]',
  '[data-initq*="related_question"]'
].join(", ")

function isExcludedSerpSurface(container: HTMLElement): boolean {
  return Boolean(container.closest(EXCLUDED_SERP_SURFACE_SELECTOR))
}

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

function collectResultContainers(root: ParentNode): HTMLElement[] {
  const containers: HTMLElement[] = []
  if (root instanceof HTMLElement && root.matches(RESULT_CONTAINER_SELECTOR)) {
    containers.push(root)
  }
  containers.push(...root.querySelectorAll<HTMLElement>(RESULT_CONTAINER_SELECTOR))
  return containers
}

export function discoverSearchResults(root: ParentNode): SearchResultTarget[] {
  const containers = collectResultContainers(root)
  const targets: SearchResultTarget[] = []

  for (const container of containers) {
    if (targets.length >= MAX_SERP_TARGETS_PER_SCAN) {
      break
    }

    if (container.getAttribute(DATA_ATTR)) {
      continue
    }

    if (isExcludedSerpSurface(container)) {
      continue
    }

    const candidate = findPrimaryAnchor(container)
    if (!candidate) {
      continue
    }

    container.setAttribute(DATA_ATTR, "pending")
    targets.push({ container, anchor: candidate.anchor, url: candidate.url })
  }

  return targets
}
