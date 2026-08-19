// Turns a bare http(s) URL inside a chat message into a real, clickable <a> — split out of
// ChatbotPanel.tsx as a pure presentational helper. Deliberately not full markdown rendering
// (react-markdown, as AboutModule.tsx uses for CMS-authored body text): an LLM chat reply isn't
// authored markdown, and letting the model's output control heading/list structure inside a small
// chat bubble is more surface area than this needs. Every segment stays either a plain text node
// or a real <a> element — never dangerouslySetInnerHTML — so there's no HTML-injection surface.
// The regex requires a literal http(s):// prefix, which also rules out a javascript:/data: URI
// ever becoming a clickable href.
const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;

export function linkifyChatText(text: string): React.ReactNode[] {
  // Keyed by each link's own starting character offset in the source string, not the array
  // index — offsets are strictly increasing (url/text segments always alternate, so no two <a>
  // elements can ever share one), and unlike a bare loop index this stays meaningful if the
  // splitting logic ever changes shape (SonarCloud S6479 — array index in key).
  let consumedLength = 0;
  return text.split(URL_PATTERN).map((part, index) => {
    // split() with a capturing group returns the captured delimiters at odd indices,
    // interleaved with the surrounding plain-text segments at even indices.
    const isUrl = index % 2 === 1;
    const startOffset = consumedLength;
    consumedLength += part.length;
    if (!isUrl) return part;

    return (
      <a
        key={`link-${startOffset}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {part}
      </a>
    );
  });
}
