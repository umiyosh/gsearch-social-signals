export const BADGE_CONTAINER_CLASS = "gsplus-signal-container"
export const BADGE_CLASS = "gsplus-hatebu-count"
export const BADGE_ICON_CLASS = "gsplus-hatebu-count__icon"
export const BADGE_TEXT_CLASS = "gsplus-hatebu-count__text"
export const HN_BADGE_CLASS = "gsplus-hn-count"
export const HN_BADGE_ICON_CLASS = "gsplus-hn-count__icon"
export const HN_BADGE_TEXT_CLASS = "gsplus-hn-count__text"
export const OVERLAY_CLASS = "gsplus-hatebu-overlay"
export const OVERLAY_BODY_CLASS = "gsplus-hatebu-overlay__body"
export const OVERLAY_USER_CLASS = "gsplus-hatebu-overlay__user"
export const OVERLAY_COMMENT_CLASS = "gsplus-hatebu-overlay__comment"
export const OVERLAY_EMPTY_CLASS = "gsplus-hatebu-overlay__empty"

const STYLE_ELEMENT_ID = "gsplus-hatebu-style"

const STYLE_TEXT = `
    .${BADGE_CLASS} {
      font-size: 0.85rem;
      color: #00a4de;
      margin-left: 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      text-decoration: none;
    }

    .${BADGE_ICON_CLASS} {
      width: 14px;
      height: 14px;
      border-radius: 2px;
      display: inline-block;
    }

    .${BADGE_TEXT_CLASS} {
      line-height: 1;
    }

    .${BADGE_CLASS}:focus-visible,
    .${HN_BADGE_CLASS}:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 3px;
    }

    .${HN_BADGE_CLASS} {
      font-size: 0.82rem;
      color: #ff6600;
      margin-left: 0.35rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
    }

    .${HN_BADGE_ICON_CLASS} {
      width: 12px;
      height: 12px;
    }

    .${HN_BADGE_TEXT_CLASS} {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .${BADGE_CONTAINER_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.2rem;
      direction: ltr;
    }
    .${OVERLAY_CLASS} {
      position: absolute;
      z-index: 2147483647;
      background: #fff;
      color: #202124;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      padding: 0.75rem;
      max-width: 320px;
      width: max-content;
      min-width: 220px;
      font-size: 0.8rem;
      line-height: 1.4;
      display: none;
    }

    .${OVERLAY_BODY_CLASS} {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 320px;
      overflow-y: auto;
    }

    .${OVERLAY_CLASS} ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .${OVERLAY_CLASS} li {
      border-top: 1px solid #e0e0e0;
      padding-top: 0.5rem;
    }

    .${OVERLAY_CLASS} li:first-child {
      border-top: none;
      padding-top: 0;
    }

    .${OVERLAY_USER_CLASS} {
      font-weight: 600;
      color: #1a73e8;
    }

    .${OVERLAY_COMMENT_CLASS} {
      margin-top: 0.15rem;
      color: #202124;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .${OVERLAY_EMPTY_CLASS} {
      color: #5f6368;
      font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
      .${OVERLAY_CLASS} {
        background: #202124;
        color: #e8eaed;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      }

      .${OVERLAY_CLASS} li {
        border-top-color: #3c4043;
      }

      .${OVERLAY_USER_CLASS} {
        color: #8ab4f8;
      }

      .${OVERLAY_COMMENT_CLASS} {
        color: #e8eaed;
      }

      .${OVERLAY_EMPTY_CLASS} {
        color: #bdc1c6;
      }
    }
`

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = STYLE_ELEMENT_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}
